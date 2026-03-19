# cabinet_solver.py
#
# Standard-Size Constraint Solver
#
# Given a total wall run + photo proportions, solves for every cabinet width
# by snapping to factory standard sizes and distributing remainders as fillers.
# Typically needs just ONE measurement (total run) to solve an entire wall.

import itertools
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ===== STANDARD SIZES =====

STANDARD_BASE_WIDTHS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48]
STANDARD_WALL_WIDTHS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42]

# Frequency weights — common sizes get higher preference
SIZE_FREQUENCY = {
    9: 0.3, 12: 0.7, 15: 0.8, 18: 0.9, 21: 0.6,
    24: 1.0, 27: 0.5, 30: 1.0, 33: 0.7, 36: 1.0,
    42: 0.6, 48: 0.4,
}

# Known appliance widths (exact)
APPLIANCE_WIDTHS = {
    "refrigerator_30": 30.0,
    "refrigerator_33": 33.0,
    "refrigerator_36": 36.0,
    "range_30": 30.0,
    "range_36": 36.0,
    "dishwasher": 24.0,
    "microwave_otr": 30.0,
    "sink_single_bowl": 30.0,
    "sink_double_bowl": 36.0,
}


# ===== DATA MODELS =====

@dataclass
class CabinetWidth:
    """A solved cabinet width."""
    section_id: str
    standard_width: int            # factory standard size in inches
    confidence: float              # 0-1 how sure we are
    source: str                    # "solved", "measured", "appliance", "ambiguous"
    alternatives: List[int] = field(default_factory=list)  # other possible standard sizes
    is_appliance: bool = False


@dataclass
class FillerStrip:
    """A filler strip between cabinets or at wall ends."""
    position: str                  # "left_wall", "right_wall", "between_base_2_base_3"
    width: float                   # in inches
    confidence: float


@dataclass
class CabinetGroup:
    """Cabinets identified as the same size."""
    group_id: str
    section_ids: List[str]
    predicted_width: float         # AI's best estimate before solving
    confidence: float              # how sure they match
    reason: str                    # "symmetric uppers flanking range hood"
    anchor_measured: bool = False
    anchor_value: Optional[float] = None


@dataclass
class SolverResult:
    """Complete solution from the constraint solver."""
    cabinet_widths: List[CabinetWidth]
    fillers: List[FillerStrip]
    total_matches: bool            # does sum == total_run within tolerance?
    residual: float                # total_run - sum(widths) - sum(fillers)
    confidence: float              # overall solution confidence
    needs_user_input: Optional[str]  # "measure base_3 width" or None
    disambiguation_reason: Optional[str]  # why we need more input
    alternative_solutions: List[dict] = field(default_factory=list)


@dataclass
class SectionEstimate:
    """A cabinet section with its photo-derived proportion."""
    section_id: str
    cabinet_type: str              # "base", "wall", "wall_gap", "tall", "appliance_opening"
    proportion: float              # fraction of total run (0-1)
    raw_pixel_width: float         # raw pixel width from photo
    is_appliance: bool = False
    appliance_type: Optional[str] = None
    filler_detected_left: bool = False
    filler_detected_right: bool = False
    above_base_ids: Optional[List[str]] = None
    estimated_height: Optional[float] = None  # individual height (for wall cabinets)


# ===== SOLVER =====

class CabinetWidthSolver:
    """
    Solves cabinet widths using:
    1. Total wall run (one tape measurement)
    2. Photo proportions (pixel ratios from AI analysis)
    3. Standard size constraint (widths must be factory standards)
    4. Filler distribution (remainder goes to fillers)
    """

    TOLERANCE = 0.5  # acceptable error in inches for sum validation

    def solve(
        self,
        total_run: float,
        sections: List[SectionEstimate],
        groups: Optional[List[CabinetGroup]] = None,
        known_measurements: Optional[Dict[str, float]] = None,
    ) -> SolverResult:
        """
        Main solver entry point.

        Args:
            total_run: Total wall run in inches (user measured)
            sections: Cabinet sections with photo proportions
            groups: Optional cabinet groupings (same-size cabinets)
            known_measurements: Optional dict of section_id -> measured width
        """
        known = known_measurements or {}

        # Step 1: Lock in appliances and known measurements
        locked = {}
        ambiguous_appliances = {}  # section_id -> list of possible widths
        for s in sections:
            if s.section_id in known:
                locked[s.section_id] = known[s.section_id]
            elif s.is_appliance and s.appliance_type:
                appliance_width = APPLIANCE_WIDTHS.get(s.appliance_type)
                if appliance_width:
                    locked[s.section_id] = appliance_width
                    # For fridges, also consider adjacent standard sizes
                    if "refrigerator" in (s.appliance_type or ""):
                        ambiguous_appliances[s.section_id] = [30.0, 33.0, 36.0]

        # Step 2: Calculate remaining run for unsolved cabinets
        locked_sum = sum(locked.values())
        remaining_run = total_run - locked_sum

        # Get unsolved sections
        unsolved = [s for s in sections if s.section_id not in locked]

        if not unsolved:
            # Everything is locked — just calculate fillers
            return self._build_result(sections, locked, total_run, groups)

        # Step 3: Calculate proportions for unsolved sections
        total_unsolved_proportion = sum(s.proportion for s in unsolved)
        if total_unsolved_proportion <= 0:
            total_unsolved_proportion = 1.0

        # Raw estimates based on proportions of remaining run
        raw_estimates = {}
        for s in unsolved:
            normalized_prop = s.proportion / total_unsolved_proportion
            raw_estimates[s.section_id] = normalized_prop * remaining_run

        # Step 4: Apply group constraints (same-size cabinets get same estimate)
        if groups:
            raw_estimates = self._apply_group_constraints(raw_estimates, groups)

        # Step 5: Find best standard-size combination
        solutions = self._find_solutions(raw_estimates, remaining_run, unsolved)

        if not solutions:
            # Fallback: just snap each individually
            for sid, est in raw_estimates.items():
                locked[sid] = self._nearest_standard(est)
            return self._build_result(sections, locked, total_run, groups)

        # Step 6: Check if disambiguation is needed
        best = solutions[0]
        needs_input = None
        disambig_reason = None

        if len(solutions) >= 2:
            score_gap = best["score"] - solutions[1]["score"]
            if score_gap < 0.05:
                # Too close — find which cabinet differs between solutions
                diff_id = self._find_disambiguation_target(solutions[0], solutions[1])
                if diff_id:
                    needs_input = f"Measure {diff_id} width to confirm"
                    disambig_reason = (
                        f"Two possible solutions: {diff_id} could be "
                        f"{solutions[0]['widths'].get(diff_id)}\" or "
                        f"{solutions[1]['widths'].get(diff_id)}\""
                    )

        # Apply best solution
        for sid, width in best["widths"].items():
            locked[sid] = width

        # Try alternative appliance sizes (e.g. fridge 30/33/36) to see if better fit
        if ambiguous_appliances:
            best_result = self._build_result(sections, locked, total_run, groups)
            best_score = best_result.confidence

            for app_sid, alt_widths in ambiguous_appliances.items():
                for alt_w in alt_widths:
                    if alt_w == locked.get(app_sid):
                        continue  # already tried
                    test_locked = dict(locked)
                    test_locked[app_sid] = alt_w
                    # Re-solve with this appliance size
                    test_remaining = total_run - sum(
                        test_locked[s.section_id] for s in sections if s.section_id in test_locked
                    )
                    test_unsolved = [s for s in sections if s.section_id not in test_locked]
                    if test_unsolved and test_remaining > 0:
                        total_prop = sum(s.proportion for s in test_unsolved)
                        if total_prop > 0:
                            test_raw = {
                                s.section_id: (s.proportion / total_prop) * test_remaining
                                for s in test_unsolved
                            }
                            test_solutions = self._find_solutions(test_raw, test_remaining, test_unsolved)
                            if test_solutions:
                                for sid2, w2 in test_solutions[0]["widths"].items():
                                    test_locked[sid2] = w2
                                test_result = self._build_result(sections, test_locked, total_run, groups)
                                if test_result.confidence > best_score:
                                    locked = test_locked
                                    best_result = test_result
                                    best_score = test_result.confidence
                                    logger.info(f"Better fit with {app_sid}={alt_w}\": conf={best_score:.2f}")

        result = self._build_result(sections, locked, total_run, groups)
        result.needs_user_input = needs_input
        result.disambiguation_reason = disambig_reason
        result.alternative_solutions = [
            {"widths": s["widths"], "score": round(s["score"], 3)}
            for s in solutions[:3]
        ]
        return result

    def _apply_group_constraints(
        self, raw_estimates: Dict[str, float], groups: List[CabinetGroup]
    ) -> Dict[str, float]:
        """Force same-group cabinets to the same raw estimate (averaged)."""
        result = dict(raw_estimates)
        for group in groups:
            group_ids = [sid for sid in group.section_ids if sid in result]
            if len(group_ids) > 1:
                avg = sum(result[sid] for sid in group_ids) / len(group_ids)
                for sid in group_ids:
                    result[sid] = avg
        return result

    def _find_solutions(
        self,
        raw_estimates: Dict[str, float],
        remaining_run: float,
        unsolved: List[SectionEstimate],
    ) -> List[dict]:
        """
        Find the best combinations of standard sizes that sum to remaining_run.

        Strategy: for each cabinet, consider the 2-3 nearest standard sizes,
        then find combinations that sum closest to remaining_run.
        """
        # Get candidate standard sizes for each cabinet (top 3 nearest)
        candidates = {}
        for sid, est in raw_estimates.items():
            cabinet_type = "base"
            for s in unsolved:
                if s.section_id == sid:
                    cabinet_type = s.cabinet_type
                    break
            candidates[sid] = self._nearest_standards(est, n=3, cabinet_type=cabinet_type)

        section_ids = list(candidates.keys())

        # If too many cabinets, limit search space
        if len(section_ids) > 8:
            # For large kitchens, just use top-2 candidates
            for sid in candidates:
                candidates[sid] = candidates[sid][:2]

        # Generate all combinations
        all_combos = list(itertools.product(*[candidates[sid] for sid in section_ids]))

        # Score each combination
        scored = []
        for combo in all_combos:
            widths = dict(zip(section_ids, combo))
            combo_sum = sum(combo)

            # Filler = remaining_run - combo_sum
            filler_total = remaining_run - combo_sum

            # Reject if filler is negative (cabinets can't exceed wall)
            if filler_total < -self.TOLERANCE:
                continue

            # Reject if filler is unreasonably large (>12" total)
            if filler_total > 12:
                continue

            # Score components
            # 1. How well does it match proportions? (0-1, higher = better)
            proportion_score = self._proportion_match_score(widths, raw_estimates)

            # 2. How small are the fillers? (0-1, higher = less filler)
            filler_score = max(0, 1.0 - abs(filler_total) / 12.0)

            # 3. Are the sizes common? (0-1, higher = more common)
            frequency_score = sum(SIZE_FREQUENCY.get(w, 0.3) for w in combo) / len(combo)

            # 4. Does it sum to exactly the run? (bonus)
            exact_match_bonus = 0.1 if abs(filler_total) < self.TOLERANCE else 0

            # Weighted total
            score = (
                proportion_score * 0.50
                + filler_score * 0.25
                + frequency_score * 0.15
                + exact_match_bonus * 0.10
            )

            scored.append({
                "widths": widths,
                "filler_total": filler_total,
                "score": score,
                "proportion_score": proportion_score,
            })

        # Sort by score descending
        scored.sort(key=lambda x: x["score"], reverse=True)

        return scored[:10]  # top 10 solutions

    def _proportion_match_score(
        self, widths: Dict[str, int], raw_estimates: Dict[str, float]
    ) -> float:
        """Score how well standard sizes match the photo proportions."""
        if not raw_estimates:
            return 0.5
        errors = []
        for sid, standard in widths.items():
            raw = raw_estimates.get(sid, standard)
            if raw > 0:
                relative_error = abs(standard - raw) / raw
                errors.append(relative_error)
        if not errors:
            return 0.5
        avg_error = sum(errors) / len(errors)
        return max(0, 1.0 - avg_error * 3)  # 33% error → score 0

    def _nearest_standard(self, value: float, cabinet_type: str = "base") -> int:
        """Find the single nearest standard size."""
        standards = STANDARD_BASE_WIDTHS if cabinet_type == "base" else STANDARD_WALL_WIDTHS
        return min(standards, key=lambda s: abs(s - value))

    def _nearest_standards(
        self, value: float, n: int = 3, cabinet_type: str = "base"
    ) -> List[int]:
        """Find the N nearest standard sizes, sorted by distance."""
        standards = STANDARD_BASE_WIDTHS if cabinet_type == "base" else STANDARD_WALL_WIDTHS
        ranked = sorted(standards, key=lambda s: abs(s - value))
        return ranked[:n]

    def _find_disambiguation_target(self, sol_a: dict, sol_b: dict) -> Optional[str]:
        """Find which cabinet differs between two solutions."""
        for sid in sol_a["widths"]:
            if sol_a["widths"][sid] != sol_b["widths"].get(sid):
                return sid
        return None

    def _build_result(
        self,
        sections: List[SectionEstimate],
        locked: Dict[str, float],
        total_run: float,
        groups: Optional[List[CabinetGroup]],
    ) -> SolverResult:
        """Build the final SolverResult from locked widths."""
        cabinet_widths = []
        for s in sections:
            width = locked.get(s.section_id)
            if width is None:
                continue

            source = "solved"
            if s.is_appliance:
                source = "appliance"

            # Determine confidence
            # The solver CHOSE this width as the optimal solution, so base confidence is high
            # Only reduce if the raw estimate was very different (suggesting photo proportions were off)
            if source == "appliance":
                confidence = 0.95
            elif source == "measured":
                confidence = 0.99
            else:
                raw_estimate = s.proportion * total_run
                diff = abs(width - raw_estimate)
                # Photo proportions can easily be off by 3-5" — that's normal
                if diff < 3:
                    confidence = 0.90
                elif diff < 6:
                    confidence = 0.82
                else:
                    confidence = 0.70

            # Check for alternatives
            alts = self._nearest_standards(s.proportion * total_run, n=3,
                                           cabinet_type=s.cabinet_type)
            alts = [a for a in alts if a != width]

            cabinet_widths.append(CabinetWidth(
                section_id=s.section_id,
                standard_width=int(width),
                confidence=confidence,
                source=source,
                alternatives=alts[:2],
                is_appliance=s.is_appliance,
            ))

        # Calculate fillers
        cabinet_sum = sum(locked.values())
        filler_total = total_run - cabinet_sum
        fillers = self._distribute_fillers(filler_total, sections)

        # Validation
        everything = cabinet_sum + sum(f.width for f in fillers)
        residual = total_run - everything
        total_matches = abs(residual) <= self.TOLERANCE

        # Overall confidence — weighted by source quality
        # Appliances and measured are very reliable, so weight them higher
        if cabinet_widths:
            weighted_sum = 0
            weight_total = 0
            for c in cabinet_widths:
                w = 2.0 if c.source in ("appliance", "measured") else 1.0
                weighted_sum += c.confidence * w
                weight_total += w
            avg_confidence = weighted_sum / weight_total if weight_total > 0 else 0
        else:
            avg_confidence = 0
        overall_confidence = avg_confidence * (1.0 if total_matches else 0.7)

        return SolverResult(
            cabinet_widths=cabinet_widths,
            fillers=fillers,
            total_matches=total_matches,
            residual=round(residual, 4),
            confidence=round(overall_confidence, 3),
            needs_user_input=None,
            disambiguation_reason=None,
        )

    def _distribute_fillers(
        self, filler_total: float, sections: List[SectionEstimate]
    ) -> List[FillerStrip]:
        """Distribute filler width to detected filler positions."""
        if filler_total <= 0.125:  # less than 1/8" — no fillers needed
            return []

        fillers = []

        # Check for detected filler positions
        filler_positions = []
        for i, s in enumerate(sections):
            if i == 0 and s.filler_detected_left:
                filler_positions.append(f"left_of_{s.section_id}")
            if s.filler_detected_right:
                if i < len(sections) - 1:
                    filler_positions.append(f"between_{s.section_id}_{sections[i+1].section_id}")
                else:
                    filler_positions.append(f"right_of_{s.section_id}")

        if not filler_positions:
            # Default: split between left wall and right wall
            filler_positions = ["left_wall", "right_wall"]

        # Distribute evenly across detected positions
        per_filler = round(filler_total / len(filler_positions), 4)
        for pos in filler_positions:
            fillers.append(FillerStrip(
                position=pos,
                width=per_filler,
                confidence=0.7 if len(filler_positions) == 1 else 0.5,
            ))

        return fillers

    def solve_wall_cabinets(
        self,
        wall_sections: List[SectionEstimate],
        base_solver_result: SolverResult,
        base_sections: List[SectionEstimate],
    ) -> SolverResult:
        """
        Solve wall cabinet widths by aligning them to the base cabinets below.

        Wall cabinets are positioned above specific base cabinets (via above_base_ids).
        Their widths are constrained by the base cabinets they sit above and snapped
        to standard wall widths.
        """
        # Build a lookup: base_id -> solved_width
        base_width_lookup = {}
        for cw in base_solver_result.cabinet_widths:
            base_width_lookup[cw.section_id] = cw.standard_width

        solved_widths = []
        for ws in wall_sections:
            if ws.cabinet_type == "wall_gap":
                # Gap width = sum of base cabinets below
                gap_width = 0
                if ws.above_base_ids:
                    gap_width = sum(base_width_lookup.get(bid, 0) for bid in ws.above_base_ids)
                if gap_width <= 0:
                    gap_width = ws.raw_pixel_width or 30  # fallback
                solved_widths.append(CabinetWidth(
                    section_id=ws.section_id,
                    standard_width=int(round(gap_width)),
                    confidence=0.8,
                    source="gap",
                    alternatives=[],
                    is_appliance=False,
                ))
            else:
                # Wall cabinet: snap to nearest standard wall width
                # Use the span of base cabinets below as a guide
                span_width = 0
                if ws.above_base_ids:
                    span_width = sum(base_width_lookup.get(bid, 0) for bid in ws.above_base_ids)

                # Estimate: use span if available, otherwise proportion-based
                if span_width > 0:
                    est_width = span_width
                elif ws.raw_pixel_width > 0:
                    est_width = ws.raw_pixel_width
                else:
                    est_width = 24  # fallback

                # Snap to nearest standard wall width
                nearest = self._nearest_standard(est_width, cabinet_type="wall")
                solved_widths.append(CabinetWidth(
                    section_id=ws.section_id,
                    standard_width=nearest,
                    confidence=0.6 if not ws.above_base_ids else 0.75,
                    source="solved",
                    alternatives=self._get_alternatives(est_width, cabinet_type="wall"),
                    is_appliance=False,
                ))

        return SolverResult(
            cabinet_widths=solved_widths,
            fillers=[],
            total_matches=True,
            residual=0,
            confidence=0.7,
            needs_user_input=None,
            disambiguation_reason=None,
        )

    def _get_alternatives(self, raw_width: float, cabinet_type: str = "base") -> List[int]:
        """Get 2 nearest standard alternatives to a raw width."""
        standards = STANDARD_WALL_WIDTHS if cabinet_type == "wall" else STANDARD_BASE_WIDTHS
        diffs = [(abs(raw_width - s), s) for s in standards]
        diffs.sort()
        return [s for _, s in diffs[1:3]]


# ===== GROUPING =====

def group_by_proportions(
    sections: List[SectionEstimate],
    tolerance: float = 0.08,
) -> List[CabinetGroup]:
    """
    Group cabinets that appear to be the same width based on photo proportions.
    Tolerance is the maximum relative difference to consider "same size".
    """
    groups = []
    assigned = set()
    group_counter = 0

    for i, a in enumerate(sections):
        if a.section_id in assigned or a.is_appliance:
            continue

        group_members = [a.section_id]
        for j, b in enumerate(sections):
            if j <= i or b.section_id in assigned or b.is_appliance:
                continue
            if a.cabinet_type != b.cabinet_type:
                continue

            # Compare proportions
            if a.proportion > 0 and b.proportion > 0:
                ratio = min(a.proportion, b.proportion) / max(a.proportion, b.proportion)
                if ratio >= (1 - tolerance):
                    group_members.append(b.section_id)

        if len(group_members) > 1:
            group_counter += 1
            avg_prop = sum(
                s.proportion for s in sections if s.section_id in group_members
            ) / len(group_members)

            for sid in group_members:
                assigned.add(sid)

            groups.append(CabinetGroup(
                group_id=f"group_{chr(64 + group_counter)}",
                section_ids=group_members,
                predicted_width=0,  # filled after solving
                confidence=0.85 if len(group_members) == 2 else 0.80,
                reason=f"Similar proportions in photo ({len(group_members)} cabinets)",
            ))

    return groups
