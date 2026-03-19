# cabinet_measurement_service.py
#
# Cabinet Measurement Assistant — helps the person on-site measure faster
# and more accurately. The photo is the MAP, the tape is the TRUTH,
# and the AI catches mistakes and fills gaps.

import asyncio
import base64
import io
import json
import logging
import re
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
from PIL import Image, ImageEnhance, ImageOps
from openai import AsyncOpenAI
from pydantic import BaseModel, Field, field_validator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ===== KITCHEN REFERENCE STANDARDS =====

class KitchenStandards:
    """Industry-standard cabinet dimensions for cross-validation."""

    # Standard cabinet widths (inches) — what factories actually make
    STANDARD_BASE_WIDTHS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48]
    STANDARD_WALL_WIDTHS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42]

    # Standard heights
    BASE_CABINET_HEIGHT = 34.5        # without countertop
    BASE_WITH_COUNTERTOP = 36.0       # with standard 1.5" countertop
    WALL_CABINET_HEIGHTS = [12, 15, 18, 24, 30, 36, 42]
    STANDARD_WALL_HEIGHT = 30         # most common

    # Standard depths
    BASE_CABINET_DEPTH = 24           # standard base depth
    WALL_CABINET_DEPTH = 12           # standard wall depth

    # Gaps and clearances
    BACKSPLASH_HEIGHT_RANGE = (15, 20)  # between counter and wall cabinets
    TOE_KICK_HEIGHT = 4.5
    FILLER_STRIP_RANGE = (0.5, 6)       # typical filler widths

    # Appliance openings
    APPLIANCE_WIDTHS = {
        "refrigerator_standard": (29.5, 36),
        "refrigerator_counter_depth": (23, 27),
        "range_standard": (29.875, 30.125),
        "range_36": (35.875, 36.125),
        "dishwasher": (23.875, 24.125),
        "microwave_otr": (29.875, 30.125),
        "sink_single": (24, 30),
        "sink_double": (33, 36),
    }

    # Validation tolerances
    STANDARD_WIDTH_TOLERANCE = 0.125   # 1/8" — factory tolerance
    FIELD_MEASUREMENT_TOLERANCE = 0.25  # 1/4" — your target

    @classmethod
    def nearest_standard_width(cls, measured: float, cabinet_type: str = "base") -> Tuple[float, float]:
        """Find nearest standard width and return (standard, difference)."""
        widths = cls.STANDARD_BASE_WIDTHS if cabinet_type == "base" else cls.STANDARD_WALL_WIDTHS
        nearest = min(widths, key=lambda w: abs(w - measured))
        return nearest, measured - nearest

    @classmethod
    def validate_measurement(cls, name: str, value: float) -> List[str]:
        """Return warnings if a measurement seems wrong."""
        warnings = []

        if "width" in name.lower():
            nearest, diff = cls.nearest_standard_width(value)
            if abs(diff) > 3:
                warnings.append(
                    f"{name}={value}\" doesn't match any standard width. "
                    f"Nearest standard is {nearest}\". Did you mean {nearest}\"?"
                )
            elif abs(diff) > 0.5 and abs(diff) < 3:
                warnings.append(
                    f"{name}={value}\" is close to standard {nearest}\". "
                    f"Verify — could be {nearest}\" + filler strip."
                )

        if "height" in name.lower() and "wall" in name.lower():
            if value not in cls.WALL_CABINET_HEIGHTS and not any(
                abs(value - h) <= 0.5 for h in cls.WALL_CABINET_HEIGHTS
            ):
                warnings.append(
                    f"{name}={value}\" is non-standard wall cabinet height. "
                    f"Standard heights: {cls.WALL_CABINET_HEIGHTS}"
                )

        if "base" in name.lower() and "height" in name.lower():
            if abs(value - cls.BASE_CABINET_HEIGHT) > 1 and abs(value - cls.BASE_WITH_COUNTERTOP) > 1:
                warnings.append(
                    f"{name}={value}\" — standard base height is {cls.BASE_CABINET_HEIGHT}\" "
                    f"(or {cls.BASE_WITH_COUNTERTOP}\" with countertop). Verify this."
                )

        return warnings


# ===== DATA MODELS =====

class CabinetSection(BaseModel):
    """A single cabinet section identified in the photo."""
    id: str = Field(description="Unique identifier like 'upper_left_1' or 'base_sink'")
    cabinet_type: str = Field(description="'base', 'wall', 'tall', 'corner', 'appliance_opening'")
    position: str = Field(description="Description of where it is: 'left of sink', 'above range', etc.")
    door_count: int = Field(ge=0, description="Number of doors visible")
    drawer_count: int = Field(ge=0, description="Number of drawers visible")
    estimated_width: Optional[float] = Field(None, description="Photo-estimated width in inches")
    estimated_height: Optional[float] = Field(None, description="Photo-estimated height in inches")
    confidence: float = Field(ge=0, le=1, description="How confident the estimate is")
    needs_tape_measure: bool = Field(default=True, description="Whether this needs physical measurement")
    measurement_priority: str = Field(default="required", description="'required', 'verify', 'optional'")
    notes: str = Field(default="", description="Special notes about this section")
    # Proportion and grouping fields (for solver + drawing)
    pixel_proportion: Optional[float] = Field(None, description="Fraction of total run width this cabinet occupies (0-1)")
    is_appliance: bool = Field(default=False, description="Whether this is an appliance opening")
    appliance_type: Optional[str] = Field(None, description="e.g. 'refrigerator_30', 'range_30', 'dishwasher'")
    filler_detected_left: bool = Field(default=False, description="Filler strip detected on left side")
    filler_detected_right: bool = Field(default=False, description="Filler strip detected on right side")
    same_size_as: Optional[List[str]] = Field(None, description="IDs of other cabinets that appear to be the same width")


class ReferenceObject(BaseModel):
    """A reference object identified in the photo for scale calibration."""
    object_type: str = Field(description="'refrigerator', 'range', 'dishwasher', 'door', 'tape_measure', etc.")
    known_dimension: Optional[float] = Field(None, description="Known dimension in inches if provided by user")
    estimated_dimension: Optional[float] = Field(None, description="Estimated dimension from standards")
    dimension_type: str = Field(default="width", description="'width' or 'height'")
    reliability: float = Field(ge=0, le=1, description="How reliable this reference is")


class PhotoAnalysisResult(BaseModel):
    """Complete analysis of a kitchen photo."""
    cabinet_sections: List[CabinetSection]
    reference_objects: List[ReferenceObject]
    layout_description: str
    wall_count: int = Field(ge=1, description="Number of walls with cabinets visible")
    has_corner: bool
    photo_quality_notes: List[str]
    suggested_additional_photos: List[str]


class MeasurementEntry(BaseModel):
    """A measurement provided by the person on-site."""
    section_id: str = Field(description="Which cabinet section this measures")
    dimension: str = Field(description="'width', 'height', 'depth', 'opening_width', etc.")
    value: float = Field(gt=0, description="Measured value in inches")
    measured_with: str = Field(default="tape", description="'tape', 'laser', 'estimated'")


class CrossValidationResult(BaseModel):
    """Result of cross-checking measurements against each other and the photo."""
    is_consistent: bool
    issues: List[str]
    warnings: List[str]
    suggestions: List[str]


class MeasurementReport(BaseModel):
    """Final output — everything the cabinet maker needs."""
    sections: List[Dict[str, Any]]
    total_run_width: Optional[float]
    missing_measurements: List[str]
    validation_issues: List[str]
    warnings: List[str]
    confidence_score: float
    ready_for_production: bool
    next_steps: List[str]


# ===== PROMPT TEMPLATES =====

CABINET_DETECTION_PROMPT = """You are a cabinet measurement assistant helping a cabinet maker on-site.

Analyze this kitchen photo and identify EVERY cabinet section, appliance opening, and reference object.
The person on-site will only need to measure 1-2 things — the AI will figure out the rest.

CRITICAL TASKS:
1. Identify every cabinet, appliance opening, and reference object
2. Estimate PROPORTIONS — what fraction of the total wall run each cabinet occupies
3. Detect FILLER STRIPS — gaps between cabinets and walls, or between adjacent cabinets
4. Group SAME-SIZE cabinets — which cabinets appear to be the same width?
5. Identify APPLIANCE TYPES — what specific appliance fits each opening?

For each cabinet section provide:
- id: unique ID in LEFT-TO-RIGHT order (e.g., "base_1", "base_2", "base_sink", "wall_1")
- cabinet_type: base, wall, tall, corner, appliance_opening
- position: description relative to other items
- door_count, drawer_count: what's visible
- estimated_width, estimated_height: your best guess in inches
- confidence: 0-1 (be conservative)
- pixel_proportion: fraction of total wall run this cabinet occupies (all proportions should sum to ~1.0 for cabinets only, excluding fillers)
- is_appliance: true if this is an appliance opening (fridge, range, dishwasher)
- appliance_type: specific type if appliance (use keys: refrigerator_30, refrigerator_33, refrigerator_36, range_30, range_36, dishwasher, microwave_otr, sink_single_bowl, sink_double_bowl)
- filler_detected_left: true if there's a visible filler strip to the left
- filler_detected_right: true if there's a visible filler strip to the right
- same_size_as: list of other section IDs that appear to be the same width (for grouping)
- needs_tape_measure: false for appliances, true for cabinets (but solver may make this unnecessary)
- measurement_priority: "required" for ambiguous sizes, "verify" for standard sizes, "optional" for appliances
- notes: any special observations

STANDARD CABINET WIDTHS (factory sizes): 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48 inches.
All cabinets MUST be one of these widths. Estimate which standard width each cabinet most likely is.

{reference_context}

Return your analysis as JSON matching this structure:
{{
  "cabinet_sections": [
    {{
      "id": "string",
      "cabinet_type": "base|wall|tall|corner|appliance_opening",
      "position": "string",
      "door_count": 0,
      "drawer_count": 0,
      "estimated_width": null or number,
      "estimated_height": null or number,
      "confidence": 0.0-1.0,
      "pixel_proportion": 0.0-1.0,
      "is_appliance": false,
      "appliance_type": null or "string",
      "filler_detected_left": false,
      "filler_detected_right": false,
      "same_size_as": [] or ["id1", "id2"],
      "needs_tape_measure": true,
      "measurement_priority": "required|verify|optional",
      "notes": "string"
    }}
  ],
  "reference_objects": [
    {{
      "object_type": "string",
      "known_dimension": null or number,
      "estimated_dimension": null or number,
      "dimension_type": "width|height",
      "reliability": 0.0-1.0
    }}
  ],
  "layout_description": "string describing the overall layout",
  "wall_count": 1,
  "has_corner": false,
  "photo_quality_notes": ["list of issues with the photo"],
  "suggested_additional_photos": ["list of additional photos that would help"]
}}"""


CROSS_VALIDATION_PROMPT = """You are a cabinet measurement expert reviewing measurements for accuracy.

A cabinet maker is on-site and has taken these measurements. Cross-check them against each other,
the photo, and industry standards. Your job is to CATCH MISTAKES before cabinets get built wrong.

LAYOUT FROM PHOTO:
{layout_description}

CABINET SECTIONS IDENTIFIED:
{sections_json}

MEASUREMENTS PROVIDED BY ON-SITE PERSON:
{measurements_json}

REFERENCE OBJECTS:
{references_json}

CHECK FOR:
1. **Transposed digits** — Did they write 24" when they meant 42"? Check against the photo proportions.
2. **Sum validation** — Do individual cabinet widths add up to the total wall run? (within 0.5")
3. **Standard sizes** — Do measurements match standard cabinet widths? If not, are filler strips noted?
4. **Proportional consistency** — In the photo, does cabinet A look roughly 1.5x wider than cabinet B?
   If measurements say otherwise, flag it.
5. **Missing measurements** — What critical dimensions are still unmeasured?
6. **Appliance clearances** — Will the fridge/range/dishwasher actually fit?
7. **Common mistakes** — Measuring to wrong edge, forgetting to account for countertop overhang, etc.

Return JSON:
{{
  "is_consistent": true/false,
  "issues": ["list of definite problems that need re-measurement"],
  "warnings": ["list of things that look suspicious but might be correct"],
  "suggestions": ["helpful tips for remaining measurements"],
  "corrected_estimates": {{
    "section_id": {{
      "original": number,
      "suggested": number,
      "reason": "why"
    }}
  }}
}}"""


GAP_FILL_PROMPT = """You are a cabinet measurement assistant. The on-site person has measured SOME
dimensions. Using those known measurements as anchor points, estimate the MISSING dimensions
from the photo.

CRITICAL: These estimates are for PLANNING ONLY. Each estimate MUST include a confidence level
and a note about whether it needs tape verification before production.

KNOWN MEASUREMENTS (tape-measured, trustworthy):
{known_measurements_json}

PHOTO-ESTIMATED DIMENSIONS (from initial analysis):
{photo_estimates_json}

REFERENCE OBJECTS:
{references_json}

For each missing measurement, provide:
1. Your best estimate in inches (to nearest 0.25")
2. Confidence (0-1): how sure you are
3. How you derived it (which known measurement did you scale from?)
4. Whether production can proceed with this estimate or if tape verification is required

Return JSON:
{{
  "filled_measurements": [
    {{
      "section_id": "string",
      "dimension": "width|height|depth",
      "estimated_value": number,
      "confidence": 0.0-1.0,
      "derivation": "string explaining how you estimated this",
      "safe_for_production": false,
      "verify_note": "string — what to double-check"
    }}
  ],
  "overall_confidence": 0.0-1.0,
  "measurements_still_needed": ["list of what MUST be tape-measured before ordering"]
}}"""


# ===== MAIN SERVICE =====

class CabinetMeasurementAssistant:
    """
    Workflow:
    1. User uploads photo(s) → we identify all sections and generate a measurement checklist
    2. User measures what they can → we cross-validate and catch errors
    3. We estimate missing measurements from photo + known ones → user verifies critical ones
    4. Final report with everything needed for production
    """

    def __init__(self, openai_api_key: str):
        self.client = AsyncOpenAI(api_key=openai_api_key)
        self.standards = KitchenStandards()

    # ===== STEP 1: Analyze photo and generate checklist =====

    async def analyze_photo(
        self,
        photo_bytes: bytes,
        known_references: Optional[Dict[str, float]] = None,
    ) -> PhotoAnalysisResult:
        """
        Analyze kitchen photo, identify every cabinet section,
        and generate a measurement checklist for the person on-site.
        """
        # Validate and enhance
        photo_bytes = self._enhance_photo(photo_bytes)
        base64_image = base64.b64encode(photo_bytes).decode("utf-8")
        media_type = self._detect_media_type(photo_bytes)

        # Build reference context
        reference_context = ""
        if known_references:
            lines = ["KNOWN REFERENCES PROVIDED BY USER:"]
            for obj, dim in known_references.items():
                lines.append(f"  - {obj}: {dim} inches")
            reference_context = "\n".join(lines)

        prompt = CABINET_DETECTION_PROMPT.format(reference_context=reference_context)

        response = await self.client.chat.completions.create(
            model="gpt-5.4",
            max_completion_tokens=4000,
            temperature=0.1,
            messages=[
                {"role": "system", "content": "You are a precise cabinet measurement assistant. Return only valid JSON."},
                {"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {
                        "url": f"data:{media_type};base64,{base64_image}",
                    }},
                ]},
            ],
        )

        data = self._extract_json(response.choices[0].message.content)
        return PhotoAnalysisResult(**data)

    def generate_measurement_checklist(self, analysis: PhotoAnalysisResult) -> Dict[str, Any]:
        """
        Turn the photo analysis into a prioritized checklist
        the person on-site can work through.
        """
        required = []
        verify = []
        optional = []

        for section in analysis.cabinet_sections:
            item = {
                "section_id": section.id,
                "type": section.cabinet_type,
                "position": section.position,
                "what_to_measure": self._what_to_measure(section),
                "photo_estimate": section.estimated_width,
                "notes": section.notes,
            }

            if section.measurement_priority == "required":
                required.append(item)
            elif section.measurement_priority == "verify":
                verify.append(item)
            else:
                optional.append(item)

        # Add critical overall measurements
        overall = [
            "Total wall run (left wall to right wall or corner to corner)",
            "Ceiling height at cabinet location",
            "Distance from counter to bottom of wall cabinets",
        ]
        if analysis.has_corner:
            overall.append("Corner depth (both walls)")
            overall.append("Distance from corner to first cabinet on each wall")

        # Photo tips
        tips = []
        if analysis.photo_quality_notes:
            tips.extend(analysis.photo_quality_notes)
        if analysis.suggested_additional_photos:
            tips.append("Additional photos that would help:")
            tips.extend(f"  - {p}" for p in analysis.suggested_additional_photos)

        return {
            "measurement_checklist": {
                "must_measure": required,
                "verify_these": verify,
                "optional": optional,
                "overall_dimensions": overall,
            },
            "section_count": len(analysis.cabinet_sections),
            "tips": tips,
            "instructions": [
                "Measure each item to the nearest 1/4 inch",
                "For widths: measure inside the face frame opening AND outside overall width",
                "For heights: measure from floor to top of cabinet (base) or bottom to top (wall)",
                "Place tape measure in the photo for at least one measurement — this dramatically improves accuracy",
                "Photograph each wall straight-on (perpendicular) if possible",
            ],
        }

    def _what_to_measure(self, section: CabinetSection) -> List[str]:
        """Determine what measurements are needed for a cabinet section."""
        measures = []

        if section.cabinet_type in ("base", "wall", "tall"):
            measures.append(f"Width of {section.id} (outside face frame)")
            if section.cabinet_type == "base":
                measures.append(f"Depth of {section.id} (front to wall)")
            if section.confidence < 0.5:
                measures.append(f"Height of {section.id}")

        elif section.cabinet_type == "corner":
            measures.append(f"Width on left wall")
            measures.append(f"Width on right wall")
            measures.append(f"Depth on both sides")

        elif section.cabinet_type == "appliance_opening":
            measures.append(f"Opening width for {section.position}")
            measures.append(f"Opening height for {section.position}")
            measures.append(f"Opening depth for {section.position}")

        return measures

    # ===== STEP 2: Cross-validate measurements =====

    async def cross_validate(
        self,
        analysis: PhotoAnalysisResult,
        measurements: List[MeasurementEntry],
        photo_bytes: Optional[bytes] = None,
    ) -> CrossValidationResult:
        """
        Cross-check user's tape measurements against:
        1. Each other (do widths sum to total run?)
        2. The photo (proportional consistency)
        3. Industry standards (standard sizes, tolerances)
        """
        issues = []
        warnings = []
        suggestions = []

        # --- Local validation (no API call needed) ---

        # Check against standards
        for m in measurements:
            section_warnings = self.standards.validate_measurement(
                f"{m.section_id}_{m.dimension}", m.value
            )
            warnings.extend(section_warnings)

        # Check width sum vs total run
        total_run_entries = [m for m in measurements if m.dimension == "total_run"]
        width_entries = [m for m in measurements if m.dimension == "width"]

        if total_run_entries and width_entries:
            total_run = total_run_entries[0].value
            width_sum = sum(m.value for m in width_entries)
            diff = abs(total_run - width_sum)

            if diff > 1.0:
                issues.append(
                    f"Individual widths sum to {width_sum}\" but total run is "
                    f"{total_run}\". Difference of {diff}\" — re-measure! "
                    f"(Could be filler strips, gaps, or a mis-measurement)"
                )
            elif diff > 0.25:
                warnings.append(
                    f"Individual widths sum to {width_sum}\", total run is "
                    f"{total_run}\". Difference of {diff}\" — check for filler strips."
                )

        # Check for likely transposed digits
        for m in measurements:
            if m.dimension == "width" and m.value > 0:
                reversed_str = str(int(m.value))[::-1]
                reversed_val = int(reversed_str) if reversed_str.isdigit() else None
                if reversed_val and reversed_val != int(m.value):
                    # Check if the reversed value is a standard width and current isn't
                    nearest_current, diff_current = self.standards.nearest_standard_width(m.value)
                    nearest_reversed, diff_reversed = self.standards.nearest_standard_width(reversed_val)
                    if abs(diff_reversed) < abs(diff_current) and abs(diff_current) > 2:
                        warnings.append(
                            f"{m.section_id} width={m.value}\" — did you mean "
                            f"{reversed_val}\"? ({reversed_val}\" is standard, "
                            f"{m.value}\" is not)"
                        )

        # --- Vision-based validation (if photo provided) ---
        if photo_bytes and measurements:
            vision_result = await self._vision_cross_validate(
                analysis, measurements, photo_bytes
            )
            issues.extend(vision_result.get("issues", []))
            warnings.extend(vision_result.get("warnings", []))
            suggestions.extend(vision_result.get("suggestions", []))

        is_consistent = len(issues) == 0

        return CrossValidationResult(
            is_consistent=is_consistent,
            issues=issues,
            warnings=warnings,
            suggestions=suggestions,
        )

    async def _vision_cross_validate(
        self,
        analysis: PhotoAnalysisResult,
        measurements: List[MeasurementEntry],
        photo_bytes: bytes,
    ) -> Dict:
        """Use OpenAI Vision to check measurements against photo proportions."""
        base64_image = base64.b64encode(photo_bytes).decode("utf-8")
        media_type = self._detect_media_type(photo_bytes)

        prompt = CROSS_VALIDATION_PROMPT.format(
            layout_description=analysis.layout_description,
            sections_json=json.dumps(
                [s.model_dump() for s in analysis.cabinet_sections], indent=2
            ),
            measurements_json=json.dumps(
                [m.model_dump() for m in measurements], indent=2
            ),
            references_json=json.dumps(
                [r.model_dump() for r in analysis.reference_objects], indent=2
            ),
        )

        response = await self.client.chat.completions.create(
            model="gpt-5.4",
            max_completion_tokens=3000,
            temperature=0.1,
            messages=[
                {"role": "system", "content": "You are a cabinet measurement expert. Catch errors. Return only valid JSON."},
                {"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {
                        "url": f"data:{media_type};base64,{base64_image}",
                    }},
                ]},
            ],
        )

        return self._extract_json(response.choices[0].message.content)

    # ===== STEP 3: Fill gaps =====

    async def fill_measurement_gaps(
        self,
        analysis: PhotoAnalysisResult,
        measurements: List[MeasurementEntry],
        photo_bytes: bytes,
    ) -> Dict[str, Any]:
        """
        Use known tape measurements + photo to estimate missing dimensions.
        The known measurements act as scale anchors — much more accurate than
        photo-only estimation.
        """
        # Separate known vs missing
        measured_ids = {(m.section_id, m.dimension) for m in measurements}
        missing = []
        for section in analysis.cabinet_sections:
            if (section.id, "width") not in measured_ids:
                missing.append({"section_id": section.id, "dimension": "width",
                                "photo_estimate": section.estimated_width})
            if (section.id, "height") not in measured_ids and section.cabinet_type == "wall":
                missing.append({"section_id": section.id, "dimension": "height",
                                "photo_estimate": section.estimated_height})

        if not missing:
            return {"filled_measurements": [], "measurements_still_needed": [],
                    "overall_confidence": 1.0}

        base64_image = base64.b64encode(photo_bytes).decode("utf-8")
        media_type = self._detect_media_type(photo_bytes)

        prompt = GAP_FILL_PROMPT.format(
            known_measurements_json=json.dumps(
                [m.model_dump() for m in measurements], indent=2
            ),
            photo_estimates_json=json.dumps(missing, indent=2),
            references_json=json.dumps(
                [r.model_dump() for r in analysis.reference_objects], indent=2
            ),
        )

        response = await self.client.chat.completions.create(
            model="gpt-5.4",
            max_completion_tokens=3000,
            temperature=0.1,
            messages=[
                {"role": "system", "content": "You are a cabinet measurement assistant. Estimate conservatively. Return only valid JSON."},
                {"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {
                        "url": f"data:{media_type};base64,{base64_image}",
                    }},
                ]},
            ],
        )

        return self._extract_json(response.choices[0].message.content)

    # ===== STEP 4: Final report =====

    def generate_final_report(
        self,
        analysis: PhotoAnalysisResult,
        measurements: List[MeasurementEntry],
        validation: CrossValidationResult,
        gap_fill: Optional[Dict] = None,
    ) -> MeasurementReport:
        """Generate the final measurement report for production."""
        sections = []
        measured_lookup = {}
        for m in measurements:
            key = m.section_id
            if key not in measured_lookup:
                measured_lookup[key] = {}
            measured_lookup[key][m.dimension] = {
                "value": m.value,
                "source": m.measured_with,
            }

        # Add gap-filled estimates
        filled_lookup = {}
        if gap_fill and "filled_measurements" in gap_fill:
            for f in gap_fill["filled_measurements"]:
                key = f["section_id"]
                if key not in filled_lookup:
                    filled_lookup[key] = {}
                filled_lookup[key][f["dimension"]] = {
                    "value": f["estimated_value"],
                    "source": "estimated_from_photo",
                    "confidence": f["confidence"],
                    "safe_for_production": f.get("safe_for_production", False),
                    "verify_note": f.get("verify_note", ""),
                }

        missing = []
        for section in analysis.cabinet_sections:
            section_data = {
                "id": section.id,
                "type": section.cabinet_type,
                "position": section.position,
                "measurements": {},
            }

            # Add tape measurements
            if section.id in measured_lookup:
                for dim, data in measured_lookup[section.id].items():
                    section_data["measurements"][dim] = {
                        **data,
                        "status": "measured",
                    }

            # Add estimated measurements
            if section.id in filled_lookup:
                for dim, data in filled_lookup[section.id].items():
                    if dim not in section_data["measurements"]:
                        section_data["measurements"][dim] = {
                            **data,
                            "status": "estimated",
                        }

            # Track what's still missing
            if "width" not in section_data["measurements"]:
                missing.append(f"{section.id}: width")
            if section.cabinet_type == "wall" and "height" not in section_data["measurements"]:
                missing.append(f"{section.id}: height")

            sections.append(section_data)

        # Calculate total run from measured widths
        total_run = None
        width_sum = sum(
            m.value for m in measurements
            if m.dimension == "width"
        )
        total_run_entries = [m for m in measurements if m.dimension == "total_run"]
        if total_run_entries:
            total_run = total_run_entries[0].value
        elif width_sum > 0:
            total_run = width_sum

        # Confidence score
        total_sections = len(analysis.cabinet_sections)
        measured_count = len(set(m.section_id for m in measurements))
        measurement_coverage = measured_count / max(total_sections, 1)
        has_issues = len(validation.issues) > 0
        confidence = measurement_coverage * (0.5 if has_issues else 1.0)

        ready = (
            confidence >= 0.8
            and not has_issues
            and len(missing) == 0
        )

        next_steps = []
        if validation.issues:
            next_steps.append("FIX: Re-measure the flagged issues above")
        if missing:
            next_steps.append(f"MEASURE: {len(missing)} dimensions still missing")
        if validation.warnings:
            next_steps.append("VERIFY: Check the warnings — some measurements look unusual")
        if ready:
            next_steps.append("READY: All measurements look good for production!")

        return MeasurementReport(
            sections=sections,
            total_run_width=total_run,
            missing_measurements=missing,
            validation_issues=validation.issues,
            warnings=validation.warnings,
            confidence_score=round(confidence, 2),
            ready_for_production=ready,
            next_steps=next_steps,
        )

    # ===== UTILITIES =====

    def _enhance_photo(self, photo_bytes: bytes) -> bytes:
        """Enhance photo for better analysis."""
        try:
            image = Image.open(io.BytesIO(photo_bytes))
            if image.mode != "RGB":
                image = image.convert("RGB")
            image = ImageEnhance.Contrast(image).enhance(1.2)
            image = ImageEnhance.Sharpness(image).enhance(1.3)
            image = ImageOps.autocontrast(image, cutoff=1)
            buf = io.BytesIO()
            fmt = image.format or "JPEG"
            image.save(buf, format=fmt)
            return buf.getvalue()
        except Exception:
            return photo_bytes

    def _detect_media_type(self, photo_bytes: bytes) -> str:
        """Detect image media type from bytes."""
        if photo_bytes[:8] == b"\x89PNG\r\n\x1a\n":
            return "image/png"
        return "image/jpeg"

    def _extract_json(self, text: str) -> Dict:
        """Extract JSON from LLM response text."""
        # Try to find JSON block
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if json_match:
            return json.loads(json_match.group(1).strip())

        # Try to find raw JSON object
        json_match = re.search(r"\{[\s\S]*\}", text)
        if json_match:
            return json.loads(json_match.group())

        raise ValueError(f"No valid JSON found in response: {text[:200]}...")


# ===== GUIDED PHOTO CAPTURE =====

PHOTO_CAPTURE_GUIDE = {
    "before_you_start": [
        "Place a tape measure or 24\" level flat on the countertop, visible in the photo",
        "Turn on all kitchen lights — consistent lighting helps accuracy",
        "Clear the countertops if possible — clutter hides cabinet edges",
    ],
    "photos_to_take": [
        {
            "name": "Main straight-on shot",
            "instruction": "Stand directly in front of the main cabinet wall, camera at counter height, as perpendicular as possible",
            "why": "This is the primary measurement photo — straight-on eliminates perspective error",
        },
        {
            "name": "Left angle (if L-shaped or U-shaped)",
            "instruction": "Stand at the left end of the kitchen, shoot toward the right",
            "why": "Captures the side that's hidden in the straight-on shot",
        },
        {
            "name": "Right angle (if L-shaped or U-shaped)",
            "instruction": "Stand at the right end, shoot toward the left",
            "why": "Same — captures the other hidden side",
        },
        {
            "name": "Close-up of any non-standard sections",
            "instruction": "Get close to corners, fillers, or odd-sized cabinets",
            "why": "These are where mistakes happen — close-up helps us verify",
        },
    ],
    "pro_tips": [
        "Open one cabinet door and measure its width — this gives us a perfect reference point",
        "A tape measure visible in the photo is worth 10x more than a fridge for calibration",
        "If there's a gap between cabinets and wall, measure it and note it",
        "Photograph the toe kick area — it reveals if floors are level",
    ],
}
