# app.py - Cabinet Measurement API
import os
import logging
logger = logging.getLogger(__name__)
import io
import uuid
import json
from pathlib import Path
from typing import Optional, List, Dict

# Load .env file if present (API keys persist across restarts)
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text().strip().splitlines():
        if "=" in line and not line.startswith("#"):
            key, val = line.split("=", 1)
            key, val = key.strip(), val.strip()
            if not os.environ.get(key):
                os.environ[key] = val

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from cabinet_measurement_service import (
    CabinetMeasurementAssistant,
    MeasurementEntry,
    PhotoAnalysisResult,
    PHOTO_CAPTURE_GUIDE,
)
from cabinet_solver import (
    CabinetWidthSolver,
    SectionEstimate,
    SolverResult,
    group_by_proportions,
)
from cabinet_elevation_drawing import generate_elevation_svg

app = FastAPI(title="Cabinet Measurement API", version="1.0.0")

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for cabinet analysis sessions
cabinet_sessions: Dict[str, dict] = {}


def _get_cabinet_assistant() -> CabinetMeasurementAssistant:
    """Get or create cabinet measurement assistant."""
    return CabinetMeasurementAssistant()


def _max_width_for_doors(door_count: int, drawer_count: int, is_sink: bool = False) -> float:
    """Maximum reasonable width for a cabinet based on door/drawer count."""
    if is_sink:
        # Sink bases can be wider: 2 doors = up to 36"
        if door_count <= 1:
            return 24.0
        elif door_count == 2:
            return 36.0
        else:
            return 48.0
    else:
        if door_count <= 1 and drawer_count <= 1:
            return 21.0  # 1 door + 1 drawer max = 18-21"
        elif door_count <= 1:
            return 18.0  # single door
        elif door_count == 2:
            return 33.0  # 2 door base max
        else:
            return 48.0


def _validate_and_fix_analysis(analysis: PhotoAnalysisResult) -> PhotoAnalysisResult:
    """
    Post-analysis validation: fix common AI detection issues.
    General fixes that apply to ALL cabinet layouts (not image-specific).
    """
    import copy
    sections = list(analysis.cabinet_sections)
    fixed_sections = []
    # Extract max numeric suffix from base IDs (handles descriptive IDs like "base_far_left")
    numeric_ids = []
    for s in sections:
        if s.id.startswith("base_"):
            try:
                numeric_ids.append(int(s.id.split("_")[-1]))
            except ValueError:
                pass
    next_base_id = (max(numeric_ids) if numeric_ids else len(sections)) + 1

    for s in sections:
        if s.cabinet_type != "base" or not s.estimated_width or s.is_appliance:
            fixed_sections.append(s)
            continue

        is_sink = bool(s.appliance_type and "sink" in (s.appliance_type or "").lower())
        max_w = _max_width_for_doors(s.door_count, s.drawer_count, is_sink)

        # If the estimated width exceeds what the door count supports,
        # the AI probably merged two adjacent cabinets
        if s.estimated_width > max_w + 3:  # 3" tolerance
            logger.info(
                f"Splitting {s.id}: est={s.estimated_width}\", "
                f"doors={s.door_count}, max_for_doors={max_w}\""
            )
            # Split: primary keeps most doors, secondary gets remainder
            # Primary is the "main" cabinet (e.g., sink), secondary is the adjacent narrow cab
            primary_w = min(s.estimated_width, max_w)
            secondary_w = s.estimated_width - primary_w

            # Primary keeps original ID
            s1 = copy.deepcopy(s)
            s1.estimated_width = round(primary_w)
            if s.pixel_proportion:
                s1.pixel_proportion = s.pixel_proportion * (primary_w / s.estimated_width)
            s1.notes = f"Split from wider AI detection. {s.notes or ''}"
            fixed_sections.append(s1)

            # Secondary gets new ID — assumed to be a simple 1-door cabinet
            from cabinet_measurement_service import CabinetSection
            s2 = copy.deepcopy(s)
            s2.id = f"base_{next_base_id}"
            next_base_id += 1
            s2.estimated_width = max(round(secondary_w), 12)
            s2.door_count = 1
            s2.drawer_count = 0
            s2.is_appliance = False
            s2.appliance_type = None
            if s.pixel_proportion:
                s2.pixel_proportion = s.pixel_proportion * (secondary_w / s.estimated_width)
            s2.position = f"Adjacent to {s.id} — split from wider detection"
            s2.notes = "Auto-split: door count suggests this is a separate cabinet"
            s2.confidence = max(s.confidence - 0.1, 0.5) if s.confidence else 0.6
            fixed_sections.append(s2)

            # Update wall references
            for ws in sections:
                if ws.above_base_ids and s.id in ws.above_base_ids:
                    ws.above_base_ids.append(s2.id)
        else:
            fixed_sections.append(s)

    analysis.cabinet_sections = fixed_sections
    return analysis


# ===== API Endpoints =====


@app.get("/")
async def root():
    return {
        "message": "Cabinet Measurement API",
        "version": "1.0.0",
        "description": "AI-powered cabinet measurement from photos",
    }


@app.get("/test-image")
async def get_test_image():
    """Serve test image for development."""
    img_path = Path(__file__).parent / "test_kitchen.jpg"
    if img_path.exists():
        return Response(content=img_path.read_bytes(), media_type="image/jpeg")
    raise HTTPException(status_code=404, detail="No test image")


@app.get("/ai-detected")
async def get_ai_detected():
    """Serve AI-detected annotated image."""
    img_path = Path(__file__).parent / "ai_detected.png"
    if img_path.exists():
        return Response(content=img_path.read_bytes(), media_type="image/png")
    raise HTTPException(status_code=404, detail="No detected image")


@app.get("/cabinet/guide")
async def get_photo_capture_guide():
    """Get instructions for taking good cabinet measurement photos."""
    return PHOTO_CAPTURE_GUIDE


@app.post("/cabinet/analyze")
async def analyze_cabinet_photo(
    photo: UploadFile = File(..., description="Photo of cabinets"),
    known_references: Optional[str] = Form(
        None,
        description='JSON dict of known references, e.g. {"refrigerator_width": 30, "range_width": 30}',
    ),
    total_run: Optional[float] = Form(
        None,
        description="Total wall run in inches (if known). Helps AI calibrate width estimates.",
    ),
):
    """
    Step 1: Upload a photo of cabinets. Returns identified cabinet sections
    and a prioritized measurement checklist for the person on-site.
    """
    assistant = _get_cabinet_assistant()
    photo_bytes = await photo.read()

    refs = None
    if known_references:
        try:
            refs = json.loads(known_references)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="known_references must be valid JSON")

    try:
        logger.info(f"Analyzing photo with total_run={total_run}")
        analysis, wireframe_bytes = await assistant.analyze_photo(
            photo_bytes, known_references=refs, total_run=total_run
        )
        logger.info(f"Analysis complete: {len(analysis.cabinet_sections)} sections")

        # Post-analysis validation: split overly wide base cabinets
        analysis = _validate_and_fix_analysis(analysis)
        logger.info(f"Validation complete: {len(analysis.cabinet_sections)} sections after validation")

        checklist = assistant.generate_measurement_checklist(analysis)

        # Store session
        session_id = str(uuid.uuid4())
        cabinet_sessions[session_id] = {
            "analysis": analysis,
            "photo_bytes": photo_bytes,
            "wireframe_bytes": wireframe_bytes,
            "measurements": [],
        }

        return {
            "session_id": session_id,
            "analysis": analysis.model_dump(),
            "checklist": checklist,
            "has_wireframe": wireframe_bytes is not None,
        }

    except Exception as e:
        import traceback
        logger.error(f"Analysis failed: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/cabinet/{session_id}/wireframe")
async def get_wireframe(session_id: str):
    """Get the AI-generated wireframe elevation drawing."""
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    wireframe = cabinet_sessions[session_id].get("wireframe_bytes")
    if not wireframe:
        raise HTTPException(status_code=404, detail="No wireframe available")
    return Response(content=wireframe, media_type="image/jpeg")


@app.post("/cabinet/{session_id}/measurements")
async def submit_measurements(
    session_id: str,
    measurements: List[MeasurementEntry],
):
    """
    Step 2: Submit tape measurements. Returns cross-validation results
    that catch errors, transposed digits, and inconsistencies.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    assistant = _get_cabinet_assistant()

    # Accumulate measurements
    session["measurements"].extend(measurements)

    # Cross-validate
    validation = await assistant.cross_validate(
        analysis=session["analysis"],
        measurements=session["measurements"],
        photo_bytes=session["photo_bytes"],
    )

    session["validation"] = validation

    return {
        "session_id": session_id,
        "validation": validation.model_dump(),
        "measurements_received": len(session["measurements"]),
    }


@app.post("/cabinet/{session_id}/fill-gaps")
async def fill_measurement_gaps(session_id: str):
    """
    Step 3: Estimate missing measurements using known tape measurements
    + photo analysis. Returns estimates with confidence scores.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    assistant = _get_cabinet_assistant()

    gap_fill = await assistant.fill_measurement_gaps(
        analysis=session["analysis"],
        measurements=session["measurements"],
        photo_bytes=session["photo_bytes"],
    )

    session["gap_fill"] = gap_fill

    return {
        "session_id": session_id,
        "gap_fill": gap_fill,
    }


@app.get("/cabinet/{session_id}/report")
async def get_measurement_report(session_id: str):
    """
    Step 4: Get the final measurement report. Shows all measured and
    estimated dimensions, validation status, and whether you're ready
    for production.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    assistant = _get_cabinet_assistant()

    # Run validation if not done yet
    validation = session.get("validation")
    if not validation:
        validation = await assistant.cross_validate(
            analysis=session["analysis"],
            measurements=session["measurements"],
            photo_bytes=session["photo_bytes"],
        )

    report = assistant.generate_final_report(
        analysis=session["analysis"],
        measurements=session["measurements"],
        validation=validation,
        gap_fill=session.get("gap_fill"),
    )

    return {
        "session_id": session_id,
        "report": report.model_dump(),
    }


# ===== STREAMLINED CABINET WORKFLOW (1-2 measurements) =====


def _analysis_to_sections(analysis: PhotoAnalysisResult) -> List[SectionEstimate]:
    """Convert PhotoAnalysisResult cabinet sections to SectionEstimate list for the solver."""
    total_est = sum(
        s.estimated_width for s in analysis.cabinet_sections
        if s.estimated_width and s.cabinet_type in ("base", "appliance_opening")
    )
    if total_est <= 0:
        total_est = 1.0

    sections = []
    for s in analysis.cabinet_sections:
        if s.cabinet_type not in ("base", "appliance_opening"):
            continue
        prop = s.pixel_proportion if s.pixel_proportion else (
            (s.estimated_width / total_est) if s.estimated_width else 0.1
        )
        sections.append(SectionEstimate(
            section_id=s.id,
            cabinet_type=s.cabinet_type,
            proportion=prop,
            raw_pixel_width=s.estimated_width or 0,
            is_appliance=s.is_appliance,
            appliance_type=s.appliance_type,
            filler_detected_left=s.filler_detected_left,
            filler_detected_right=s.filler_detected_right,
        ))
    return sections


def _analysis_to_wall_sections(analysis: PhotoAnalysisResult) -> List[SectionEstimate]:
    """Extract wall cabinet and wall_gap sections for the drawing."""
    total_est = sum(
        s.estimated_width for s in analysis.cabinet_sections
        if s.estimated_width and s.cabinet_type in ("wall", "wall_gap")
    )
    if total_est <= 0:
        total_est = 1.0

    sections = []
    for s in analysis.cabinet_sections:
        if s.cabinet_type not in ("wall", "wall_gap"):
            continue
        prop = s.pixel_proportion if s.pixel_proportion else (
            (s.estimated_width / total_est) if s.estimated_width else 0.1
        )
        # Validate above_base_ids — filter out references to non-existent base IDs
        valid_base_ids = {
            sec.id for sec in analysis.cabinet_sections
            if sec.cabinet_type in ("base", "appliance_opening")
        }
        above_ids = s.above_base_ids
        if above_ids:
            above_ids = [bid for bid in above_ids if bid in valid_base_ids]
            if not above_ids:
                above_ids = None

        sections.append(SectionEstimate(
            section_id=s.id,
            cabinet_type=s.cabinet_type,
            proportion=prop,
            raw_pixel_width=s.estimated_width or 0,
            above_base_ids=above_ids,
            estimated_height=s.estimated_height,
        ))
    return sections


class SolveRequest(BaseModel):
    total_run: float
    additional_measurements: Optional[Dict[str, float]] = None


@app.post("/cabinet/{session_id}/solve")
async def solve_cabinet_widths(session_id: str, request: SolveRequest):
    """
    The main action endpoint. User inputs total wall run (1 measurement)
    and optionally one more measurement. AI solves every cabinet width
    by snapping to standard factory sizes.

    Returns solved widths, fillers, confidence, and updated SVG drawing.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    analysis = session["analysis"]

    # Convert analysis to solver input
    base_sections = _analysis_to_sections(analysis)
    wall_sections = _analysis_to_wall_sections(analysis)

    if not base_sections:
        raise HTTPException(status_code=400, detail="No base cabinets found in analysis")

    # Group same-size cabinets
    groups = group_by_proportions(base_sections)

    # Solve base cabinets
    solver = CabinetWidthSolver()
    result = solver.solve(
        total_run=request.total_run,
        sections=base_sections,
        groups=groups,
        known_measurements=request.additional_measurements,
    )

    # Solve wall cabinets (aligned to base)
    wall_solver_result = None
    if wall_sections:
        wall_solver_result = solver.solve_wall_cabinets(
            wall_sections=wall_sections,
            base_solver_result=result,
            base_sections=base_sections,
        )

    # Generate SVG elevation drawing
    svg = generate_elevation_svg(
        solver_result=result,
        sections=base_sections,
        total_run=request.total_run,
        wall_sections=wall_sections if wall_sections else None,
        wall_solver_result=wall_solver_result,
        groups=groups,
        title="Cabinet Elevation — Solved",
    )

    # Store solver result in session
    session["solver_result"] = result
    session["wall_solver_result"] = wall_solver_result
    session["solve_request"] = request
    session["base_sections"] = base_sections
    session["wall_sections"] = wall_sections
    session["groups"] = groups

    return {
        "session_id": session_id,
        "solved": {
            "cabinet_widths": [
                {
                    "section_id": cw.section_id,
                    "width": cw.standard_width,
                    "confidence": cw.confidence,
                    "source": cw.source,
                    "alternatives": cw.alternatives,
                }
                for cw in result.cabinet_widths
            ],
            "fillers": [
                {"position": f.position, "width": f.width, "confidence": f.confidence}
                for f in result.fillers
            ],
            "total_matches": result.total_matches,
            "confidence": result.confidence,
        },
        "needs_more_input": result.needs_user_input,
        "disambiguation_reason": result.disambiguation_reason,
        "svg": svg,
    }


@app.get("/cabinet/{session_id}/elevation")
async def get_elevation_drawing(session_id: str):
    """
    Get the current SVG elevation drawing.
    Works at any stage — before or after solving.
    Returns SVG that renders directly in the browser.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    analysis = session["analysis"]

    # If solved, use solver result
    if "solver_result" in session:
        svg = generate_elevation_svg(
            solver_result=session["solver_result"],
            sections=session["base_sections"],
            total_run=session["solve_request"].total_run,
            wall_sections=session.get("wall_sections"),
            wall_solver_result=session.get("wall_solver_result"),
            groups=session.get("groups"),
            title="Cabinet Elevation — Solved",
        )
    else:
        # Pre-solve: generate from estimates only
        base_sections = _analysis_to_sections(analysis)
        wall_sections = _analysis_to_wall_sections(analysis)

        # Use estimated total run from photo
        est_total = sum(s.estimated_width or 0 for s in analysis.cabinet_sections
                        if s.cabinet_type in ("base", "appliance_opening"))
        if est_total <= 0:
            est_total = 120  # fallback

        # Create a dummy solver result with estimates
        from cabinet_solver import CabinetWidth as CW
        dummy_widths = [
            CW(section_id=s.section_id,
               standard_width=int(s.raw_pixel_width) if s.raw_pixel_width else 24,
               confidence=0.4, source="estimated", alternatives=[])
            for s in base_sections
        ]
        dummy_result = SolverResult(
            cabinet_widths=dummy_widths, fillers=[], total_matches=False,
            residual=0, confidence=0.3, needs_user_input="Measure total wall run",
            disambiguation_reason=None,
        )
        svg = generate_elevation_svg(
            solver_result=dummy_result,
            sections=base_sections,
            total_run=est_total,
            wall_sections=wall_sections if wall_sections else None,
            title="Cabinet Elevation — Estimated (measure total run to solve)",
        )

    return Response(content=svg, media_type="image/svg+xml")


@app.post("/cabinet/{session_id}/tap-measure")
async def tap_measure(session_id: str, section_id: str, dimension: str, value: float):
    """
    Mobile tap-to-update: user taps a cabinet on the drawing, inputs a measurement.
    AI propagates to same-group cabinets and re-solves.
    Returns updated SVG.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]

    if "solve_request" not in session:
        raise HTTPException(status_code=400, detail="Run /solve first with total_run")

    # Add to known measurements
    additional = session["solve_request"].additional_measurements or {}
    additional[section_id] = value
    session["solve_request"].additional_measurements = additional

    # Re-solve with the new anchor
    solver = CabinetWidthSolver()
    result = solver.solve(
        total_run=session["solve_request"].total_run,
        sections=session["base_sections"],
        groups=session.get("groups"),
        known_measurements=additional,
    )

    # Find which cabinets were updated by propagation
    propagated_to = []
    if session.get("groups"):
        for group in session["groups"]:
            if section_id in group.section_ids:
                propagated_to = [sid for sid in group.section_ids if sid != section_id]

    # Re-solve wall cabinets with updated base result
    wall_solver_result = None
    wall_sections = session.get("wall_sections")
    if wall_sections:
        wall_solver_result = solver.solve_wall_cabinets(
            wall_sections=wall_sections,
            base_solver_result=result,
            base_sections=session["base_sections"],
        )

    # Regenerate SVG
    svg = generate_elevation_svg(
        solver_result=result,
        sections=session["base_sections"],
        total_run=session["solve_request"].total_run,
        wall_sections=wall_sections,
        wall_solver_result=wall_solver_result,
        groups=session.get("groups"),
        title="Cabinet Elevation — Updated",
    )

    session["solver_result"] = result
    session["wall_solver_result"] = wall_solver_result

    return {
        "session_id": session_id,
        "updated_section": section_id,
        "propagated_to": propagated_to,
        "value": value,
        "needs_more_input": result.needs_user_input,
        "confidence": result.confidence,
        "svg": svg,
    }


@app.post("/cabinet/{session_id}/confirm")
async def confirm_measurements(session_id: str):
    """
    User confirms the solved measurements look correct.
    Marks everything as verified and returns production-ready report.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]

    if "solver_result" not in session:
        raise HTTPException(status_code=400, detail="Run /solve first")

    result = session["solver_result"]

    report = {
        "status": "confirmed",
        "ready_for_production": result.total_matches and result.confidence >= 0.7,
        "total_run": session["solve_request"].total_run,
        "cabinets": [
            {
                "section_id": cw.section_id,
                "width": cw.standard_width,
                "source": "verified" if cw.source in ("solved", "measured", "appliance") else cw.source,
                "confidence": cw.confidence,
            }
            for cw in result.cabinet_widths
        ],
        "fillers": [
            {"position": f.position, "width": round(f.width, 4)}
            for f in result.fillers
        ],
        "confidence": result.confidence,
        "warnings": [],
    }

    if not result.total_matches:
        report["warnings"].append(
            f"Cabinet widths + fillers don't sum to total run. Residual: {result.residual}\""
        )
    if result.confidence < 0.7:
        report["warnings"].append(
            "Low confidence — consider measuring additional cabinets"
        )

    return {"session_id": session_id, "report": report}


@app.get("/cabinet/{session_id}/scene")
async def get_scene_data(session_id: str):
    """
    Get 3D scene data for the Three.js viewer.
    Returns all cabinet positions, dimensions, and metadata needed to render a 3D cabinet layout.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    analysis = session["analysis"]
    solver_result = session.get("solver_result")
    wall_solver_result = session.get("wall_solver_result")
    total_run = session["solve_request"].total_run if "solve_request" in session else None

    # Build solver width lookups
    base_width_lookup = {}
    if solver_result:
        for cw in solver_result.cabinet_widths:
            base_width_lookup[cw.section_id] = {
                "width": cw.standard_width,
                "confidence": cw.confidence,
                "source": cw.source,
            }

    wall_width_lookup = {}
    if wall_solver_result:
        for cw in wall_solver_result.cabinet_widths:
            wall_width_lookup[cw.section_id] = {
                "width": cw.standard_width,
                "confidence": cw.confidence,
                "source": cw.source,
            }

    # Use layout_boxes if available (from interactive editor), else fall back to analysis
    layout_boxes = session.get("layout_boxes")

    # Position base cabinets left-to-right
    base_cabinets = []
    x_cursor = 0.0
    fillers_scene = []

    # Add left filler if present
    if solver_result:
        for f in solver_result.fillers:
            if "left" in f.position.lower():
                fillers_scene.append({"x": x_cursor, "width": f.width, "position": f.position})
                x_cursor += f.width

    if layout_boxes:
        # Interactive editor path: use layout boxes sorted by position_order
        base_boxes = sorted(
            [b for b in layout_boxes if b.cabinet_type in ("base", "appliance_opening")],
            key=lambda b: b.position_order,
        )
        for b in base_boxes:
            solved = base_width_lookup.get(b.id, {})
            w = solved.get("width", b.width_inches or 24)

            # Determine height based on appliance type
            cab_height = b.height_inches or 34.5
            cab_depth = 24.0
            if b.is_appliance and b.appliance_type:
                atype = b.appliance_type.lower()
                if "fridge" in atype or "refrigerator" in atype:
                    cab_height = 68.0
                    cab_depth = 30.0
                elif "oven" in atype or "wall oven" in atype:
                    cab_height = 48.0

            cab = {
                "id": b.id,
                "type": b.cabinet_type,
                "x": x_cursor,
                "width": w,
                "depth": cab_depth,
                "height": cab_height,
                "doors": b.doors,
                "drawers": b.drawers,
                "is_appliance": b.is_appliance,
                "appliance_type": b.appliance_type,
                "confidence": solved.get("confidence", 0.5),
                "source": solved.get("source", "estimated"),
            }
            base_cabinets.append(cab)
            x_cursor += w

        # Wall cabinets from layout boxes
        wall_boxes = sorted(
            [b for b in layout_boxes if b.cabinet_type in ("wall", "wall_gap")],
            key=lambda b: b.position_order,
        )
    else:
        # Original analysis path
        for s in analysis.cabinet_sections:
            if s.cabinet_type not in ("base", "appliance_opening"):
                continue
            w = base_width_lookup.get(s.id, {}).get("width", s.estimated_width or 24)

            # Determine height based on appliance type
            cab_height = 34.5
            cab_depth = 24.0
            if s.is_appliance and s.appliance_type:
                atype = s.appliance_type.lower()
                if "fridge" in atype or "refrigerator" in atype:
                    cab_height = 68.0  # Full-height fridge
                    cab_depth = 30.0
                elif "oven" in atype or "wall oven" in atype:
                    cab_height = 48.0
                # Range/stove stays at base height (34.5)

            cab = {
                "id": s.id,
                "type": s.cabinet_type,
                "x": x_cursor,
                "width": w,
                "depth": cab_depth,
                "height": cab_height,
                "doors": s.door_count,
                "drawers": s.drawer_count,
                "is_appliance": s.is_appliance,
                "appliance_type": s.appliance_type,
                "confidence": base_width_lookup.get(s.id, {}).get("confidence", s.confidence),
                "source": base_width_lookup.get(s.id, {}).get("source", "estimated"),
            }
            base_cabinets.append(cab)
            x_cursor += w
        wall_boxes = None

    # Add right filler
    if solver_result:
        for f in solver_result.fillers:
            if "right" in f.position.lower():
                fillers_scene.append({"x": x_cursor, "width": f.width, "position": f.position})

    # Build base position lookup for wall cabinet alignment
    base_pos_lookup = {c["id"]: {"x": c["x"], "width": c["width"]} for c in base_cabinets}

    # Position wall cabinets
    wall_cabinets = []

    if wall_boxes is not None:
        # Interactive editor path
        wx_cursor = 0.0
        for b in wall_boxes:
            solved = wall_width_lookup.get(b.id, {})
            w = solved.get("width", b.width_inches or 24)
            h = b.height_inches or 30.0
            is_gap = b.cabinet_type == "wall_gap"
            wall_cabinets.append({
                "id": b.id,
                "type": b.cabinet_type,
                "x": wx_cursor,
                "width": w,
                "depth": 12.0,
                "height": h,
                "y_bottom": 54.0,
                "doors": b.doors if not is_gap else 0,
                "drawers": 0,
                "is_gap": is_gap,
                "gap_type": None,
                "confidence": solved.get("confidence", 0.5),
                "source": solved.get("source", "estimated"),
                "above_base_ids": None,
            })
            wx_cursor += w
    else:
        # Original analysis path — position wall cabinets left-to-right sequentially
        wx_cursor = 0.0
        for s in analysis.cabinet_sections:
            if s.cabinet_type not in ("wall", "wall_gap"):
                continue
            w = wall_width_lookup.get(s.id, {}).get("width", s.estimated_width or 24)
            h = s.estimated_height or 30.0
            is_gap = s.cabinet_type == "wall_gap"

            wall_cabinets.append({
                "id": s.id,
                "type": s.cabinet_type,
                "x": wx_cursor,
                "width": w,
                "depth": 12.0,
                "height": h,
                "y_bottom": 54.0,
                "doors": s.door_count if not is_gap else 0,
                "drawers": 0,
                "is_gap": is_gap,
                "gap_type": "hood" if is_gap and "hood" in (s.notes or "").lower() else ("open" if is_gap else None),
                "confidence": wall_width_lookup.get(s.id, {}).get("confidence", s.confidence),
                "source": wall_width_lookup.get(s.id, {}).get("source", "estimated"),
                "above_base_ids": s.above_base_ids,
            })
            wx_cursor += w

    # Wall solver already constrains total to match base total,
    # but reposition x coordinates sequentially in case of rounding
    wx_cursor = 0.0
    for wc in wall_cabinets:
        wc["x"] = wx_cursor
        wx_cursor += wc["width"]

    # Calculate countertop width excluding tall appliances (fridge)
    countertop_width = 0.0
    for cab in base_cabinets:
        if cab.get("height", 34.5) <= 36:  # Only base-height items get countertop
            countertop_width += cab["width"]
        # Also add filler widths
    for f in fillers_scene:
        countertop_width += f["width"]

    return {
        "session_id": session_id,
        "total_run": total_run,
        "base_cabinets": base_cabinets,
        "wall_cabinets": wall_cabinets,
        "fillers": fillers_scene,
        "countertop": {
            "width": countertop_width or (total_run or x_cursor),
            "depth": 25.5,
            "height": 1.5,
            "y": 34.5,
        },
    }


# ===== INTERACTIVE EDITOR ENDPOINTS =====


class LayoutBox(BaseModel):
    id: str
    cabinet_type: str
    width_inches: Optional[float] = None
    height_inches: Optional[float] = None
    position_order: int
    is_appliance: bool = False
    appliance_type: Optional[str] = None
    doors: int = 0
    drawers: int = 0


class UpdateLayoutRequest(BaseModel):
    boxes: List[LayoutBox]
    total_run: Optional[float] = None


@app.post("/cabinet/{session_id}/update-layout")
async def update_layout(session_id: str, request: UpdateLayoutRequest):
    """
    Interactive editor sends manually-placed boxes + total run.
    Converts to solver input, solves, returns result + scene data.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]

    # Convert layout boxes to SectionEstimate for solver
    base_boxes = [b for b in request.boxes if b.cabinet_type in ("base", "appliance_opening")]
    wall_boxes = [b for b in request.boxes if b.cabinet_type in ("wall", "wall_gap")]

    # Calculate proportions from ordering (equal weight as fallback)
    total_base = len(base_boxes) or 1
    base_sections = []
    known_measurements = {}

    for b in sorted(base_boxes, key=lambda x: x.position_order):
        prop = 1.0 / total_base
        # If user supplied a width, use it as a known measurement
        if b.width_inches and request.total_run:
            prop = b.width_inches / request.total_run
            known_measurements[b.id] = b.width_inches

        base_sections.append(SectionEstimate(
            section_id=b.id,
            cabinet_type=b.cabinet_type,
            proportion=prop,
            raw_pixel_width=b.width_inches or 0,
            is_appliance=b.is_appliance,
            appliance_type=b.appliance_type,
            filler_detected_left=False,
            filler_detected_right=False,
        ))

    wall_sections = []
    for b in sorted(wall_boxes, key=lambda x: x.position_order):
        wall_sections.append(SectionEstimate(
            section_id=b.id,
            cabinet_type=b.cabinet_type,
            proportion=1.0 / max(len(wall_boxes), 1),
            raw_pixel_width=b.width_inches or 0,
            estimated_height=b.height_inches,
        ))

    if not base_sections:
        raise HTTPException(status_code=400, detail="No base cabinets in layout")

    if not request.total_run or request.total_run <= 0:
        raise HTTPException(status_code=400, detail="total_run required and must be > 0")

    # Group and solve
    groups = group_by_proportions(base_sections)
    solver = CabinetWidthSolver()
    result = solver.solve(
        total_run=request.total_run,
        sections=base_sections,
        groups=groups,
        known_measurements=known_measurements if known_measurements else None,
    )

    # Solve wall cabinets
    wall_solver_result = None
    if wall_sections:
        wall_solver_result = solver.solve_wall_cabinets(
            wall_sections=wall_sections,
            base_solver_result=result,
            base_sections=base_sections,
        )

    # Generate SVG
    svg = generate_elevation_svg(
        solver_result=result,
        sections=base_sections,
        total_run=request.total_run,
        wall_sections=wall_sections if wall_sections else None,
        wall_solver_result=wall_solver_result,
        groups=groups,
        title="Cabinet Elevation — Solved",
    )

    # Store in session
    solve_req = SolveRequest(total_run=request.total_run, additional_measurements=known_measurements)
    session["solver_result"] = result
    session["wall_solver_result"] = wall_solver_result
    session["solve_request"] = solve_req
    session["base_sections"] = base_sections
    session["wall_sections"] = wall_sections
    session["groups"] = groups
    session["layout_boxes"] = request.boxes

    return {
        "session_id": session_id,
        "solved": {
            "cabinet_widths": [
                {
                    "section_id": cw.section_id,
                    "width": cw.standard_width,
                    "confidence": cw.confidence,
                    "source": cw.source,
                    "alternatives": cw.alternatives,
                }
                for cw in result.cabinet_widths
            ],
            "fillers": [
                {"position": f.position, "width": f.width, "confidence": f.confidence}
                for f in result.fillers
            ],
            "total_matches": result.total_matches,
            "confidence": result.confidence,
        },
        "needs_more_input": result.needs_user_input,
        "disambiguation_reason": result.disambiguation_reason,
        "svg": svg,
    }


class ChatRequest(BaseModel):
    message: str
    current_scene: dict


@app.post("/cabinet/{session_id}/chat")
async def chat_with_assistant(session_id: str, request: ChatRequest):
    """
    AI chat assist for the 3D viewer. User describes changes in natural language,
    AI returns updated scene data.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    from google import genai
    from google.genai import types as genai_types

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY not set")

    client = genai.Client(api_key=api_key)

    system_prompt = """You are a cabinet layout assistant for cabinet makers. This tool works for any room — kitchens, bathrooms, laundry, offices, garages, etc.

You will receive the current scene data as JSON and a user request to modify it. Return ONLY the updated scene data as valid JSON.

Rules:
- Only modify what the user asks for
- Cabinet widths must be standard factory sizes: 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48 inches
- Base cabinet height is typically 34.5" (without countertop)
- Wall/upper cabinet heights vary: 12, 15, 18, 24, 30, 36, 42 inches
- Countertop adds 1.5" on top of base cabinets
- Keep all existing fields intact when modifying"""

    try:
        response = client.models.generate_content(
            model='gemini-3.1-flash-image-preview',
            contents=f"Current scene:\n```json\n{json.dumps(request.current_scene, indent=2)}\n```\n\nUser request: {request.message}\n\nReturn the updated scene JSON only.",
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type='application/json',
            ),
        )

        reply_text = response.text.strip()

        updated_scene = json.loads(reply_text)

        return {
            "reply": f"Updated: {request.message}",
            "updated_scene": updated_scene,
            "changes_made": [request.message],
        }

    except json.JSONDecodeError:
        return {
            "reply": reply_text if 'reply_text' in dir() else "Could not parse AI response as JSON",
            "updated_scene": None,
            "changes_made": [],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


class DxfExportRequest(BaseModel):
    construction_type: Optional[str] = None
    box_material_thickness: Optional[float] = None
    back_panel_thickness: Optional[float] = None
    back_panel_dado_depth: Optional[float] = None
    edge_banding_thickness: Optional[float] = None
    toe_kick_height: Optional[float] = None
    toe_kick_depth: Optional[float] = None
    face_frame_stile_width: Optional[float] = None
    face_frame_rail_width: Optional[float] = None


@app.post("/cabinet/{session_id}/export-dxf")
async def export_dxf(session_id: str, request: Optional[DxfExportRequest] = None):
    """
    Generate a ZIP file containing:
    - cut_list.json — Bill of Materials with exact part dimensions
    - Individual DXF files for each part of each cabinet
    - elevation.dxf — Front elevation overview drawing
    """
    import zipfile
    from cabinet_parametric import ConstructionConfig, CabinetParts, generate_cut_list
    from cabinet_dxf_generator import generate_cabinet_dxf_package, generate_elevation_dxf

    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    if "solver_result" not in session:
        raise HTTPException(status_code=400, detail="Run /solve first")

    solver_result = session["solver_result"]
    base_sections = session["base_sections"]

    # Build construction config from request body (use defaults for missing fields)
    config_kwargs = {}
    if request:
        for field_name in (
            "construction_type", "box_material_thickness", "back_panel_thickness",
            "back_panel_dado_depth", "edge_banding_thickness", "toe_kick_height",
            "toe_kick_depth", "face_frame_stile_width", "face_frame_rail_width",
        ):
            val = getattr(request, field_name, None)
            if val is not None:
                config_kwargs[field_name] = val
    config = ConstructionConfig(**config_kwargs)

    # Build cabinet list from solver result + base sections
    section_lookup = {s.section_id: s for s in base_sections}
    cabinets = []
    for cw in solver_result.cabinet_widths:
        sec = section_lookup.get(cw.section_id)
        cab = {
            "cabinet_id": cw.section_id,
            "width": cw.standard_width,
            "height": 34.5,
            "depth": 24.0,
            "door_count": 1,
            "drawer_count": 0,
            "cabinet_type": "base",
        }
        if sec:
            cab["cabinet_type"] = sec.cabinet_type or "base"
        cabinets.append(cab)

    # Generate cut list
    cut_list = generate_cut_list(cabinets, config=config)

    # Serialize cut list to JSON (convert Part objects)
    cut_list_json = {
        "cabinets": [
            {
                "cabinet_id": cab_entry["cabinet_id"],
                "nominal": cab_entry["nominal"],
                "part_count": cab_entry["part_count"],
                "total_area_sqft": round(cab_entry["total_area_sqft"], 2),
                "parts": [
                    {
                        "name": p.name,
                        "blank_width": round(p.blank_width, 4),
                        "blank_length": round(p.blank_length, 4),
                        "material": p.material,
                        "thickness": p.thickness,
                        "edge_banding": p.edge_banding,
                        "grain_direction": p.grain_direction,
                        "quantity": p.quantity,
                        "notes": p.notes,
                    }
                    for p in cab_entry["parts"]
                ],
            }
            for cab_entry in cut_list["cabinets"]
        ],
        "summary": cut_list["summary"],
    }

    # Build ZIP in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Cut list JSON
        zf.writestr("cut_list.json", json.dumps(cut_list_json, indent=2))

        # 2. Individual part DXFs per cabinet
        for cab_entry in cut_list["cabinets"]:
            cab_id = cab_entry["cabinet_id"]
            parts = cab_entry["parts"]
            dxf_package = generate_cabinet_dxf_package(cab_id, parts, config)
            for filename, dxf_bytes in dxf_package.items():
                zf.writestr(f"parts/{filename}", dxf_bytes)

        # 3. Elevation overview DXF
        elevation_dxf = generate_elevation_dxf(
            cabinets=cabinets,
            total_run=session["solve_request"].total_run,
        )
        zf.writestr("elevation.dxf", elevation_dxf)

    zip_bytes = zip_buffer.getvalue()
    short_id = session_id[:8]

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="cabinet-dxf-{short_id}.zip"',
        },
    )


@app.get("/cabinet/{session_id}/export")
async def export_config(session_id: str):
    """
    Export the pure-numbers JSON config that can regenerate the 3D view.
    This is 'the program' — a standalone config with no photo dependency.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    if "solver_result" not in session:
        raise HTTPException(status_code=400, detail="Run solve first")

    # Get scene data by calling the scene logic
    scene_response = await get_scene_data(session_id)

    return {
        "version": "1.0",
        "exported_at": str(uuid.uuid4())[:8],
        **scene_response,
    }


# ===== STATIC FILE SERVING (production: serve built frontend) =====

_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    print("Starting Cabinet Measurement API...")
    print(f"API docs: http://localhost:8000/docs")

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
