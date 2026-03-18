# Estimator: AI-Powered Cabinet Measurement System

## What This Is

**An AI tool that turns a phone photo of a kitchen into a complete, production-ready cabinet measurement sheet — with only 1-2 tape measurements from the installer.**

This is for **cabinet makers and kitchen remodelers**. The people who show up to a job site, measure every cabinet by hand (12-20+ measurements per wall), write it all down, hope they didn't transpose any numbers, then drive back to the shop to build. If one number is wrong, the cabinet doesn't fit, and it's a $500-$2,000 mistake.

---

## The Problem

Today's field measurement process:
1. Drive to job site (30-60 min)
2. Tape-measure every cabinet width, height, depth individually (20-40 min)
3. Sketch it all by hand on graph paper
4. Hope you didn't write 31" when you meant 13" (transposed digits — happens constantly)
5. Drive back to shop, re-draw in CAD
6. If anything is wrong → drive back, re-measure

**Pain points:**
- Takes 1-2 hours on site per kitchen
- Human error rate is high (transposed digits, missed measurements, hard-to-reach spots)
- No instant validation — mistakes discovered at fabrication
- Skilled labor spent on tedious measuring instead of building

---

## The Solution

### Input
1. **A phone photo** of the kitchen wall (taken straight-on)
2. **One tape measurement**: total wall run (wall-to-wall distance)
3. *(Occasionally)* one more measurement if AI can't disambiguate between two possible solutions

### What the AI Does
1. **Analyzes the photo** with GPT-5.4 Vision — identifies every cabinet, appliance opening, filler strip, and reference object
2. **Extracts proportions** — pixel ratios between cabinets (cabinet A is ~25% of the wall, cabinet B is ~30%, etc.)
3. **Applies the key constraint**: cabinet widths are **always factory standard sizes** (9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48 inches). They're not random numbers.
4. **Solves the puzzle**: given total run + proportions + standard sizes, finds the ONE combination that adds up correctly
5. **Cross-validates**: checks the solution against known appliance widths (dishwasher = always 24", ranges = 30" or 36"), standard countertop height (36"), and photo proportions
6. **Catches errors**: if the user inputs a measurement that doesn't match the photo proportions, flags it immediately ("Did you mean 31" instead of 13"?")

### Output
1. **Interactive SVG elevation drawing** — 2D front view of the kitchen with every cabinet labeled and dimensioned
2. **All cabinet widths** solved to standard factory sizes with confidence scores
3. **Filler strip locations and widths** calculated
4. **Validation report** — issues, warnings, what's ready for production
5. **Production-ready measurement sheet** — everything the shop needs to build

---

## The Key Insight (Why This Works)

**Cabinets are NOT custom-width.** Every cabinet factory in America builds to the same standard widths: 9", 12", 15", 18", 21", 24", 27", 30", 33", 36", 42", 48". The gaps between cabinets and walls are filled with "filler strips" — thin pieces cut on site.

This means measuring a kitchen is actually a **constraint satisfaction problem**:
- You know the standard sizes (finite set)
- You know the total wall run (one measurement)
- You know the proportions from the photo (AI vision)
- You know appliance widths (dishwasher = 24", range = 30" or 36")
- **There's usually only ONE valid solution.**

Example: total wall run = 122". Photo shows 4 cabinets + fridge. Proportions from photo: ~20%, ~25%, ~30%, ~25%. Fridge = 36".
- 122" - 36" (fridge) = 86" for 3 cabinets
- 86" × [.27, .33, .40] ≈ [23", 28", 34"] → snap to standards: [24", 27", 36"] = 87" → 1" filler at wall end
- **Solved. Zero ambiguity. One measurement.**

---

## The User Workflow

```
INSTALLER ON SITE                          AI SYSTEM
─────────────────                          ─────────
1. Opens app, takes photo of wall    →     Analyzes photo, identifies cabinets
                                     ←     Returns: elevation drawing + "measure total wall run"
2. Measures wall-to-wall (1 number)  →     Solves all cabinet widths
                                     ←     Returns: complete drawing with all dimensions
3. Eyeballs it: "yep, looks right"   →     Marks as confirmed
                                     ←     Returns: production-ready measurement sheet

TOTAL TIME: 3-5 minutes
OLD WAY: 60-90 minutes
```

Worst case: AI says "I'm not sure if cabinet 3 is 27" or 30" — measure that one." User measures ONE more thing. Done.

---

## System Architecture

### Components (all built)

| Component | File | What It Does |
|-----------|------|-------------|
| **Photo Analyzer** | `src/cabinet_measurement_service.py` | GPT-5.4 Vision: identifies cabinets, appliances, fillers, proportions |
| **Constraint Solver** | `src/cabinet_solver.py` | Math engine: snaps proportions to standard sizes, solves for fillers |
| **SVG Drawing Engine** | `src/cabinet_elevation_drawing.py` | Generates interactive 2D elevation drawings |
| **FastAPI Server** | `src/app.py` | REST API: all endpoints for the workflow |
| **Fashion Video Gen** | `src/app.py` (shared) | Separate feature: AI fashion video generation via Google Veo 2.0 |

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /cabinet/analyze` | Upload photo → get cabinet sections + measurement checklist |
| `POST /cabinet/{id}/solve` | Input total run → AI solves all widths |
| `POST /cabinet/{id}/measurements` | Submit tape measurements → cross-validation |
| `POST /cabinet/{id}/fill-gaps` | AI estimates missing measurements |
| `GET /cabinet/{id}/elevation` | Get current SVG drawing |
| `POST /cabinet/{id}/tap-measure` | Mobile: tap cabinet on drawing, input value, re-solve |
| `POST /cabinet/{id}/confirm` | Confirm → production-ready report |
| `GET /cabinet/{id}/report` | Final measurement report |

### Tech Stack
- **AI**: OpenAI GPT-5.4 (vision + reasoning)
- **Backend**: Python / FastAPI
- **Solver**: Custom constraint satisfaction (no ML — pure math)
- **Drawing**: SVG via Jinja2 templates
- **Image Processing**: Pillow (enhancement), potential OpenCV (perspective correction)
- **Validation**: Pydantic models throughout

---

## Accuracy Analysis (from feasibility study)

| Approach | Accuracy | Confidence | Status |
|----------|----------|------------|--------|
| Single photo + AI + 1 measurement | ±0.5" | ~85% | **Built (current)** |
| Multi-photo (3-5) + SfM reconstruction | ±0.15-0.25" | ~95% | Planned |
| LiDAR phone (iPhone Pro) | ±0.25" | ~95% | Future option |

For production cabinet ordering: ±0.5" with standard-size snapping is **good enough** because cabinets ARE standard sizes — the snapping eliminates the error. The fillers absorb the remainder.

---

## What's Done vs What's Left

### Done
- Photo analysis with GPT-5.4 Vision (identify cabinets, appliances, proportions)
- Constraint solver (snap to standard sizes, calculate fillers)
- SVG elevation drawing engine (interactive, tap-to-measure, color-coded)
- Cross-validation (catches transposed digits, sum mismatches)
- Gap-filling (estimate missing measurements from photo + known ones)
- All API endpoints wired up
- CLAUDE.md workflow guidelines

### Left To Do (for local development)
1. **Remove hardcoded API keys** from `src/clothes.py:738`, `src/photo_analysis_service.py:937`, `src/services/link_generator.py:791` — replace with `os.environ.get()`
2. **Push to `wfrancis/estimator`** on GitHub
3. **Add `requirements.txt`** or `pyproject.toml` with all dependencies
4. **End-to-end testing** with a real kitchen photo
5. **Multi-photo support** (Phase 2 — for higher accuracy)
6. **Mobile frontend** (the SVG tap targets are ready, need a simple web UI)

---

## Goal

**Replace 60-90 minutes of manual measuring with a 3-5 minute workflow: photo → one measurement → done.** Save cabinet makers time, eliminate transposed-digit errors, and produce production-ready measurement sheets that the shop can build from with confidence.

---

## How the AI Solves It (The Math)

### Standard Size Constraint Solver

Given:
- `total_run` = user's one tape measurement (e.g., 122")
- `proportions[]` = pixel ratios from photo (e.g., [20%, 25%, 30%, 25%])
- `standard_sizes` = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48]
- `n_cabinets` = count from photo

Find: the combination of standard sizes + filler widths that:
1. Sums to `total_run` (within ±0.25")
2. Best matches the photo proportions
3. Uses minimal fillers (factories avoid fillers when possible)

**Algorithm:**
```python
def solve_cabinet_widths(total_run, proportions, n_cabinets):
    # 1. Raw estimates from proportions
    raw_estimates = [p * total_run for p in proportions]

    # 2. Snap each to nearest standard size
    snapped = [nearest_standard(est) for est in raw_estimates]

    # 3. Check if sum matches total_run
    cabinet_sum = sum(snapped)
    filler_total = total_run - cabinet_sum

    # 4. If filler_total is small (0-6"), distribute as fillers
    # 5. If filler_total is large, try alternative snapping combinations
    # 6. Score each combination by: proximity to proportions × minimizing fillers
    # 7. If top-2 solutions are close, ask user for ONE disambiguating measurement
```

### Reference Objects for Scale Calibration

Before the user even measures anything, the AI uses reference objects to pre-calibrate:
- **Refrigerator**: known model → exact width; unknown model → range (28-36"), lower confidence
- **Range/Stove**: almost always 30" or 36" — ask user which
- **Dishwasher**: always 24" — excellent reference
- **Countertop height**: always 36" — vertical reference
- **Standard door**: 80" tall, 32-36" wide

These pre-calibrate the drawing BEFORE any user input. The total-run measurement then confirms/refines.

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/cabinet_elevation_drawing.py` | **CREATE** | SVG drawing engine with tap targets |
| `src/cabinet_solver.py` | **CREATE** | Standard-size constraint solver + filler calculator |
| `src/cabinet_measurement_service.py` | **MODIFY** | Integrate solver + simplified workflow |
| `src/app.py` | **MODIFY** | Add streamlined endpoints |

---

## Step 1: Standard Size Solver (`src/cabinet_solver.py`)

**Core class**: `CabinetWidthSolver`

```python
class CabinetWidthSolver:
    STANDARD_WIDTHS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48]

    def solve(self, total_run, photo_proportions, n_cabinets,
              known_refs=None) -> SolverResult

    def snap_to_standard(self, raw_width) -> Tuple[int, float]  # (standard, residual)

    def find_best_combination(self, total_run, proportions) -> List[CombinationResult]

    def calculate_fillers(self, total_run, cabinet_widths,
                          filler_positions) -> List[FillerStrip]

    def needs_disambiguation(self, solutions) -> Optional[str]
    # Returns which cabinet to measure, or None if unambiguous
```

**Output**: `SolverResult`
```python
@dataclass
class SolverResult:
    cabinet_widths: List[CabinetWidth]     # id, standard_width, confidence
    fillers: List[FillerStrip]             # position, width
    total_matches: bool                     # does sum == total_run?
    confidence: float                       # overall confidence
    needs_user_input: Optional[str]         # "measure cabinet 3" or None
    alternative_solutions: List[...]        # other valid combos (for transparency)
```

**Solver strategy** (ranked):
1. Snap all to nearest standard → check sum. If matches total_run ±0.5": done.
2. If off by 0.5-6": assign remainder as fillers (AI identifies filler positions from photo)
3. If off by >6": try next-nearest standard sizes for the least-confident cabinets
4. Generate top 3 solutions, score by: `photo_fit × 0.6 + minimal_fillers × 0.3 + standard_preference × 0.1`
5. If top 2 solutions score within 10%: flag `needs_user_input` with which ONE cabinet to measure

---

## Step 2: SVG Drawing Engine (`src/cabinet_elevation_drawing.py`)

### Layout
- Base cabinets: bottom row at 36" countertop height (34.5" cabinet + 1.5" counter)
- Wall cabinets: top row, 30" standard height, 18" above counter
- Appliance openings: gray fill with label (FRIDGE, RANGE, etc.)
- Fillers: hatched strips with dimension
- Countertop: brown bar between base and wall cabinets
- Floor line at bottom

### SVG Features
- **Tap targets**: each cabinet is a `<rect>` with `data-section-id` and `onclick`
- **Dimension lines**: arrowheads via SVG `<marker>`, extension lines
- **3 visual states**:
  - Estimated (orange dashed) — from photo analysis
  - Solved (blue solid) — AI-solved using standard sizes + total run
  - Verified (green solid) — user confirmed or tape-measured
- **Group highlighting**: tap a cabinet → same-group cabinets flash
- **Responsive**: `viewBox` scales to any screen size

### Template Approach
Jinja2 SVG template (already installed, no new deps). SVG is XML — Jinja2 is perfect for this.

Key drawing elements:
```xml
<svg viewBox="0 0 {{width}} {{height}}">
  <defs>
    <marker id="arrow">...</marker>      <!-- dimension arrowheads -->
    <pattern id="filler-hatch">...</pattern>  <!-- filler strip pattern -->
  </defs>

  <!-- Cabinets (rects + door/drawer lines) -->
  <!-- Appliance openings (gray + label) -->
  <!-- Fillers (hatched strips) -->
  <!-- Countertop bar -->
  <!-- Dimension lines with labels -->
  <!-- Legend -->
</svg>
```

Drawing config: SCALE=4.0 px/inch (adaptive for long runs), green/orange/blue color scheme.

---

## Step 3: Update Measurement Service (`src/cabinet_measurement_service.py`)

### Simplified Workflow

Modify `analyze_photo()` to also:
1. Detect filler strip positions
2. Identify reference objects with dimensions
3. Group same-size cabinets
4. Return `what_to_measure`: just "total wall run" (and maybe one disambiguating cabinet)

### Add Solver Integration

New method: `solve_with_total_run(analysis, total_run) -> SolverResult`
- Takes the photo analysis + one user measurement
- Runs the constraint solver
- Returns all cabinet widths with confidence

### Filler Detection

Add to Claude Vision prompt:
- "Identify any filler strips between cabinets and walls"
- "Identify any filler strips between adjacent cabinets"
- "Are there gaps at corners?"

---

## Step 4: Streamlined API Endpoints (`src/app.py`)

### `POST /cabinet/analyze` (existing, enhanced)
Upload photo → returns:
- 2D elevation SVG (all estimated/orange)
- Cabinet sections with predicted measurements
- **"What to measure"**: typically just "total wall run"
- Reference objects detected

### `POST /cabinet/{session_id}/solve`
**The main action endpoint.** User inputs 1-2 measurements:
```json
{
  "total_run": 122.0,
  "additional": [                    // optional, only if AI asked
    {"section_id": "base_3", "width": 36.0}
  ]
}
```
Returns:
- Updated SVG with all cabinets solved (blue/solid)
- All cabinet widths (standard sizes)
- Filler positions and widths
- Confidence score
- `needs_more_input`: null (done) or "measure base_3 to confirm"

### `GET /cabinet/{session_id}/elevation`
Returns current SVG at any stage.

### `POST /cabinet/{session_id}/confirm`
User taps "looks right" → marks all as verified (green). Returns final production-ready report.

---

## Step 5: Accuracy Improvements

### Perspective Correction
- Use countertop line (horizontal) and wall edge (vertical) as reference geometry
- Compute homography with OpenCV `getPerspectiveTransform`
- Dewarp photo before extracting pixel ratios → eliminates 3-5% perspective error

### Filler-Aware Solving
- Fillers detected from photo BEFORE solving
- Solver knows where fillers go → doesn't try to snap filler width to standard sizes
- Validates: `sum(standards) + sum(fillers) = total_run`

### Standard-Size Bias
- Estimates within 5% of a standard width snap to that standard
- Stronger bias toward common sizes (24, 30, 36) vs uncommon (9, 15, 42)

### Out-of-Square Detection
- If user optionally measures total run at BOTH top and bottom: compare
- Difference >0.25" → flag "walls out of square, individual measurements recommended"

### Production Gate
- Solved measurements: safe for quoting/estimating
- Verified measurements: safe for production/CNC
- Never send solved-only measurements to CNC without user confirmation

---

## Reusable Code

- `KitchenStandards` class (`cabinet_measurement_service.py:26`) — standard sizes, appliance widths, tolerances
- `CabinetSection` model (`cabinet_measurement_service.py:110`) — door_count, drawer_count
- `PhotoAnalysisResult` (`cabinet_measurement_service.py:134`) — layout data
- Claude Vision API pattern (`cabinet_measurement_service.py:263`) — image encoding, prompting
- Jinja2 Template (already imported in `photo_analysis_service.py:18`)
- Image enhancement (`cabinet_measurement_service.py:518`) — contrast/sharpness

---

## Verification

1. **Solver unit test**: total_run=122", proportions=[.20, .25, .30, .25] → should solve to [24, 30, 36, 30] + 2" filler
2. **Ambiguity test**: total_run=60", proportions=[.50, .50] → 30+30 vs 27+33 — should flag "measure one cabinet"
3. **SVG render test**: generate SVG, open in browser, verify layout matches a Design Flex-style elevation
4. **End-to-end**: upload kitchen photo → get SVG → input total run → get solved SVG → confirm → get production report
5. **Mobile test**: open SVG on phone, verify tap targets work, text is readable
