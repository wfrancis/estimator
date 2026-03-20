# cabinet_elevation_drawing.py
#
# SVG Elevation Drawing Engine
#
# Generates 2D front-elevation cabinet drawings in SVG format.
# Uses Jinja2 templating (already installed) — zero new dependencies.
# Output is interactive: each cabinet is a tap target for mobile input.

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from jinja2 import Template

from cabinet_solver import (
    CabinetWidth,
    FillerStrip,
    SolverResult,
    SectionEstimate,
    CabinetGroup,
    STANDARD_BASE_WIDTHS,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ===== DRAWING CONFIG =====

class DrawingConfig:
    """All visual parameters for the elevation drawing."""

    # Scale: pixels per inch. 4.0 means a 120" kitchen = 480px wide.
    SCALE = 4.0

    # Margins (pixels)
    MARGIN_LEFT = 90       # room for height dimension labels
    MARGIN_RIGHT = 40
    MARGIN_TOP = 80        # room for title + wall cabinet dimension labels
    MARGIN_BOTTOM = 120    # room for width dimensions + legend

    # Kitchen geometry (inches) — used as defaults when not measured
    BASE_CABINET_HEIGHT = 34.5
    COUNTERTOP_THICKNESS = 1.5
    COUNTERTOP_TOTAL = 36.0     # base + counter
    BACKSPLASH_HEIGHT = 18.0
    WALL_CABINET_HEIGHT = 30.0
    TOE_KICK_HEIGHT = 4.5

    # Dimension lines
    DIM_OFFSET = 20        # gap between cabinet and first dimension line
    DIM_TIER_GAP = 28      # gap between individual and total run dimensions
    DIM_FONT_SIZE = 11
    DIM_ARROWHEAD_SIZE = 5

    # Colors
    COLOR_MEASURED = "#2E7D32"       # green — tape verified
    COLOR_SOLVED = "#1565C0"         # blue — AI solved (standard size)
    COLOR_ESTIMATED = "#E65100"      # orange — photo estimate only
    COLOR_PROPAGATED = "#F9A825"     # yellow — group propagated

    COLOR_CABINET_FILL = "#FAFAF0"   # off-white cabinet fill
    COLOR_APPLIANCE_FILL = "#E8E8E8" # gray appliance fill
    COLOR_COUNTERTOP = "#8D6E63"     # brown countertop
    COLOR_FILLER_FILL = "#FFF3E0"    # light orange filler
    COLOR_FLOOR = "#5D4037"          # dark brown floor line
    COLOR_WALL = "#F5F5F5"           # light gray wall background
    COLOR_STROKE = "#333333"         # default stroke

    # Line styles
    DASH_ESTIMATED = "5,3"
    DASH_PROPAGATED = "8,3"
    DASH_NONE = "none"

    # Font
    FONT_FAMILY = "Arial, Helvetica, sans-serif"

    # Adaptive scale threshold
    MAX_CANVAS_WIDTH = 900  # reduce scale if drawing exceeds this


# ===== POSITIONED ELEMENTS =====

@dataclass
class PositionedCabinet:
    """A cabinet placed in drawing coordinate space."""
    section_id: str
    cabinet_type: str           # base, wall, appliance_opening
    x: float                    # left edge (px)
    y: float                    # top edge (px)
    width_px: float             # width in pixels
    height_px: float            # height in pixels
    real_width: float           # actual inches
    real_height: float          # actual inches
    source: str                 # "measured", "solved", "estimated", "propagated", "appliance"
    confidence: float
    door_count: int
    drawer_count: int
    label: str                  # display label (section_id or position)
    group_id: Optional[str] = None
    is_appliance: bool = False
    appliance_label: Optional[str] = None  # "FRIDGE", "RANGE", etc.


@dataclass
class PositionedFiller:
    """A filler strip in drawing coordinate space."""
    x: float
    y: float
    width_px: float
    height_px: float
    real_width: float
    label: str


@dataclass
class DimensionLine:
    """A dimension annotation with arrowheads."""
    x1: float
    y1: float
    x2: float
    y2: float
    label: str                  # e.g., '30"'
    source: str                 # for color coding
    orientation: str            # "horizontal" or "vertical"
    confidence: float = 1.0


@dataclass
class ElevationLayout:
    """Complete layout ready for SVG rendering."""
    base_cabinets: List[PositionedCabinet]
    wall_cabinets: List[PositionedCabinet]
    appliance_openings: List[PositionedCabinet]
    fillers: List[PositionedFiller]
    width_dimensions: List[DimensionLine]
    height_dimensions: List[DimensionLine]
    total_run_dimension: Optional[DimensionLine]
    countertop_rect: dict       # x, y, width, height
    floor_line_y: float
    canvas_width: float
    canvas_height: float
    title: str
    scale: float
    groups: List[dict]          # group info for legend


# ===== LAYOUT ENGINE =====

def layout_from_solver(
    solver_result: SolverResult,
    sections: List[SectionEstimate],
    total_run: float,
    wall_cabinet_sections: Optional[List[SectionEstimate]] = None,
    wall_solver_result: Optional[SolverResult] = None,
    groups: Optional[List[CabinetGroup]] = None,
    title: str = "Cabinet Elevation Drawing",
) -> ElevationLayout:
    """
    Convert solver results into positioned elements ready for SVG rendering.

    This is the core layout engine — it computes x,y positions for every
    cabinet, filler, and dimension line.
    """
    cfg = DrawingConfig()

    # Adaptive scale for long runs
    scale = cfg.SCALE
    needed_width = total_run * scale + cfg.MARGIN_LEFT + cfg.MARGIN_RIGHT
    if needed_width > cfg.MAX_CANVAS_WIDTH:
        scale = (cfg.MAX_CANVAS_WIDTH - cfg.MARGIN_LEFT - cfg.MARGIN_RIGHT) / total_run

    # Build width lookup from solver result
    width_lookup = {}
    source_lookup = {}
    confidence_lookup = {}
    for cw in solver_result.cabinet_widths:
        width_lookup[cw.section_id] = cw.standard_width
        source_lookup[cw.section_id] = cw.source
        confidence_lookup[cw.section_id] = cw.confidence

    # Build group lookup
    group_lookup = {}
    if groups:
        for g in groups:
            for sid in g.section_ids:
                group_lookup[sid] = g.group_id

    # Calculate vertical positions (from top of drawing)
    wall_top = cfg.MARGIN_TOP
    wall_height = cfg.WALL_CABINET_HEIGHT * scale
    backsplash_top = wall_top + wall_height
    backsplash_height = cfg.BACKSPLASH_HEIGHT * scale
    counter_top = backsplash_top + backsplash_height
    counter_height = cfg.COUNTERTOP_THICKNESS * scale
    base_top = counter_top + counter_height
    base_height = cfg.BASE_CABINET_HEIGHT * scale
    floor_y = base_top + base_height

    # Place base cabinets left-to-right
    base_sections = [s for s in sections if s.cabinet_type in ("base", "appliance_opening")]
    x_cursor = cfg.MARGIN_LEFT

    base_cabinets = []
    appliance_openings = []
    base_fillers = []
    base_width_dims = []

    # Sort fillers by position to interleave
    filler_lookup = {}
    for f in solver_result.fillers:
        filler_lookup[f.position] = f

    # Check for left-wall filler
    if base_sections:
        left_filler_key = f"left_of_{base_sections[0].section_id}"
        left_wall_filler = filler_lookup.get(left_filler_key) or filler_lookup.get("left_wall")
        if left_wall_filler and left_wall_filler.width > 0.125:
            fw = left_wall_filler.width * scale
            base_fillers.append(PositionedFiller(
                x=x_cursor, y=base_top, width_px=fw, height_px=base_height,
                real_width=left_wall_filler.width,
                label=f'{left_wall_filler.width:.2f}"',
            ))
            x_cursor += fw

    for i, section in enumerate(base_sections):
        width_inches = width_lookup.get(section.section_id, section.proportion * total_run)
        width_px = width_inches * scale
        source = source_lookup.get(section.section_id, "estimated")
        conf = confidence_lookup.get(section.section_id, 0.5)

        # Determine appliance label
        appliance_label = None
        if section.is_appliance and section.appliance_type:
            label_map = {
                "refrigerator_30": "FRIDGE", "refrigerator_33": "FRIDGE",
                "refrigerator_36": "FRIDGE", "range_30": "RANGE",
                "range_36": "RANGE", "dishwasher": "DW",
                "microwave_otr": "MW", "sink_single_bowl": "SINK",
                "sink_double_bowl": "SINK",
            }
            appliance_label = label_map.get(section.appliance_type, "APPLIANCE")

        cab = PositionedCabinet(
            section_id=section.section_id,
            cabinet_type=section.cabinet_type,
            x=x_cursor,
            y=base_top,
            width_px=width_px,
            height_px=base_height,
            real_width=width_inches,
            real_height=cfg.BASE_CABINET_HEIGHT,
            source=source,
            confidence=conf,
            door_count=0,   # filled from analysis
            drawer_count=0,
            label=section.section_id,
            group_id=group_lookup.get(section.section_id),
            is_appliance=section.is_appliance,
            appliance_label=appliance_label,
        )

        # Sinks are cabinets WITH a sink — they have doors. Only truly empty
        # openings (fridge, range, DW, empty spaces) get the X-pattern rendering.
        is_true_opening = section.is_appliance and section.appliance_type and \
            "sink" not in (section.appliance_type or "").lower()
        # Also treat empty appliance_opening (no appliance installed) as openings
        if section.cabinet_type == "appliance_opening" and not section.appliance_type:
            is_true_opening = True

        if is_true_opening:
            appliance_openings.append(cab)
        else:
            base_cabinets.append(cab)

        # Width dimension below this cabinet
        dim_y = floor_y + cfg.DIM_OFFSET
        base_width_dims.append(DimensionLine(
            x1=x_cursor, y1=dim_y,
            x2=x_cursor + width_px, y2=dim_y,
            label=f'{width_inches:.0f}"' if width_inches == int(width_inches) else f'{width_inches:.1f}"',
            source=source,
            orientation="horizontal",
            confidence=conf,
        ))

        x_cursor += width_px

        # Check for filler between this and next cabinet
        if i < len(base_sections) - 1:
            filler_key = f"between_{section.section_id}_{base_sections[i+1].section_id}"
            between_filler = filler_lookup.get(filler_key)
            if between_filler and between_filler.width > 0.125:
                fw = between_filler.width * scale
                base_fillers.append(PositionedFiller(
                    x=x_cursor, y=base_top, width_px=fw, height_px=base_height,
                    real_width=between_filler.width,
                    label=f'{between_filler.width:.2f}"',
                ))
                x_cursor += fw

    # Check for right-wall filler
    if base_sections:
        right_filler_key = f"right_of_{base_sections[-1].section_id}"
        right_wall_filler = filler_lookup.get(right_filler_key) or filler_lookup.get("right_wall")
        if right_wall_filler and right_wall_filler.width > 0.125:
            fw = right_wall_filler.width * scale
            base_fillers.append(PositionedFiller(
                x=x_cursor, y=base_top, width_px=fw, height_px=base_height,
                real_width=right_wall_filler.width,
                label=f'{right_wall_filler.width:.2f}"',
            ))
            x_cursor += fw

    # Total run dimension
    total_run_dim_y = floor_y + cfg.DIM_OFFSET + cfg.DIM_TIER_GAP
    total_run_dim = DimensionLine(
        x1=cfg.MARGIN_LEFT, y1=total_run_dim_y,
        x2=cfg.MARGIN_LEFT + total_run * scale, y2=total_run_dim_y,
        label=f'{total_run:.1f}" TOTAL RUN',
        source="measured",
        orientation="horizontal",
    )

    # Place wall cabinets (aligned above base cabinets using above_base_ids)
    wall_cabs = []
    wall_dims = []

    # Build wall solver lookups
    wall_width_lookup = {}
    wall_source_lookup = {}
    wall_conf_lookup = {}
    if wall_solver_result:
        for cw in wall_solver_result.cabinet_widths:
            wall_width_lookup[cw.section_id] = cw.standard_width
            wall_source_lookup[cw.section_id] = cw.source
            wall_conf_lookup[cw.section_id] = cw.confidence

    # Build base cabinet position lookup for alignment
    base_pos_lookup = {}
    for bc in base_cabinets + appliance_openings:
        base_pos_lookup[bc.section_id] = (bc.x, bc.width_px)

    if wall_cabinet_sections:
        wx_fallback = cfg.MARGIN_LEFT  # fallback if no above_base_ids
        prev_dim_y = None  # track previous dimension y to avoid overlap
        for section in wall_cabinet_sections:
            is_gap = section.cabinet_type == "wall_gap"

            # Get width: from wall solver, then width_lookup, then proportion
            w_inches = wall_width_lookup.get(
                section.section_id,
                width_lookup.get(section.section_id, section.proportion * total_run)
            )
            w_source = wall_source_lookup.get(
                section.section_id,
                source_lookup.get(section.section_id, "estimated")
            )
            w_conf = wall_conf_lookup.get(
                section.section_id,
                confidence_lookup.get(section.section_id, 0.5)
            )

            # Get individual height (defaults to standard wall cabinet height)
            sec_height = section.estimated_height or cfg.WALL_CABINET_HEIGHT
            sec_height_px = sec_height * scale

            # Position: align x to base cabinets below, but keep solved width
            if section.above_base_ids:
                base_xs = [base_pos_lookup[bid][0] for bid in section.above_base_ids if bid in base_pos_lookup]
                if base_xs:
                    wx = min(base_xs)
                else:
                    wx = wx_fallback
            else:
                wx = wx_fallback
            w_px = w_inches * scale

            # Wall cabinets bottom-align to backsplash_top, shorter ones float up
            wall_y = backsplash_top - sec_height_px

            wall_cabs.append(PositionedCabinet(
                section_id=section.section_id,
                cabinet_type="wall_gap" if is_gap else "wall",
                x=wx, y=wall_y,
                width_px=w_px, height_px=sec_height_px,
                real_width=w_inches,
                real_height=sec_height,
                source="gap" if is_gap else w_source,
                confidence=w_conf,
                door_count=0 if is_gap else max(1, int(w_inches / 15)),  # estimate doors from width
                drawer_count=0,
                label="HOOD" if is_gap else section.section_id,
                group_id=group_lookup.get(section.section_id),
            ))

            # Position dimension line just above this specific cabinet.
            # Stagger upward if it would overlap the previous dimension line.
            dim_label_y = wall_y - 8
            if prev_dim_y is not None and abs(dim_label_y - prev_dim_y) < cfg.DIM_TIER_GAP:
                dim_label_y = prev_dim_y - cfg.DIM_TIER_GAP
            # Clamp so it doesn't overlap the title area
            dim_label_y = max(dim_label_y, cfg.MARGIN_TOP)
            prev_dim_y = dim_label_y

            wall_dims.append(DimensionLine(
                x1=wx, y1=dim_label_y,
                x2=wx + w_px, y2=dim_label_y,
                label=f'{w_inches:.0f}"' if w_inches == int(w_inches) else f'{w_inches:.1f}"',
                source="gap" if is_gap else w_source,
                orientation="horizontal", confidence=w_conf,
            ))

            wx_fallback = wx + w_px  # advance fallback cursor

    # Height dimensions (left side)
    height_dims = []
    dim_x = cfg.MARGIN_LEFT - 15

    # Wall cabinet heights — show unique heights
    # Group by height to avoid redundant labels
    seen_heights = set()
    for wc in wall_cabs:
        if wc.cabinet_type == "wall_gap":
            continue
        h_label = f'{wc.real_height:.0f}"'
        if h_label not in seen_heights:
            seen_heights.add(h_label)
            height_dims.append(DimensionLine(
                x1=dim_x, y1=wc.y,
                x2=dim_x, y2=wc.y + wc.height_px,
                label=h_label,
                source="solved", orientation="vertical",
            ))
            dim_x -= 20  # offset each unique height label

    # Backsplash
    height_dims.append(DimensionLine(
        x1=dim_x - 20, y1=backsplash_top,
        x2=dim_x - 20, y2=counter_top,
        label=f'{cfg.BACKSPLASH_HEIGHT:.0f}"',
        source="solved", orientation="vertical",
    ))

    # Base cabinet height (including counter)
    height_dims.append(DimensionLine(
        x1=dim_x, y1=counter_top,
        x2=dim_x, y2=floor_y,
        label=f'{cfg.COUNTERTOP_TOTAL:.0f}"',
        source="solved", orientation="vertical",
    ))

    # Countertop bar
    ct_x = cfg.MARGIN_LEFT
    ct_width = total_run * scale
    countertop_rect = {
        "x": ct_x, "y": counter_top,
        "width": ct_width,
        "height": counter_height,
    }

    # Canvas size
    canvas_width = max(x_cursor + cfg.MARGIN_RIGHT, cfg.MARGIN_LEFT + total_run * scale + cfg.MARGIN_RIGHT)
    canvas_height = floor_y + cfg.MARGIN_BOTTOM

    # Group info for legend
    group_info = []
    if groups:
        colors = ["#E3F2FD", "#FFF3E0", "#E8F5E9", "#FCE4EC", "#F3E5F5"]
        for i, g in enumerate(groups):
            group_info.append({
                "group_id": g.group_id,
                "color": colors[i % len(colors)],
                "section_ids": g.section_ids,
                "reason": g.reason,
            })

    return ElevationLayout(
        base_cabinets=base_cabinets,
        wall_cabinets=wall_cabs,
        appliance_openings=appliance_openings,
        fillers=base_fillers,
        width_dimensions=base_width_dims + wall_dims,
        height_dimensions=height_dims,
        total_run_dimension=total_run_dim,
        countertop_rect=countertop_rect,
        floor_line_y=floor_y,
        canvas_width=canvas_width,
        canvas_height=canvas_height,
        title=title,
        scale=scale,
        groups=group_info,
    )


# ===== DOOR/DRAWER RENDERING =====

def generate_cabinet_details(cab: PositionedCabinet) -> str:
    """Generate SVG lines for doors and drawers inside a cabinet rect."""
    lines = []
    x, y, w, h = cab.x, cab.y, cab.width_px, cab.height_px
    padding = 3  # inner padding

    # Determine if this should render as an X-pattern (appliance opening) or with doors.
    # Sinks are appliances but have cabinet doors — render them like cabinets.
    # Empty openings (no appliance) should also show X.
    is_sink = "sink" in (cab.appliance_label or "").lower() or "SINK" in (cab.appliance_label or "")
    is_x_pattern = (cab.is_appliance and not is_sink) or \
        (cab.cabinet_type == "appliance_opening" and not is_sink)

    if is_x_pattern:
        # Appliance opening: draw an X and label (fridge, range, DW, empty)
        lines.append(f'<line x1="{x+padding}" y1="{y+padding}" '
                      f'x2="{x+w-padding}" y2="{y+h-padding}" '
                      f'stroke="#999" stroke-width="0.5"/>')
        lines.append(f'<line x1="{x+w-padding}" y1="{y+padding}" '
                      f'x2="{x+padding}" y2="{y+h-padding}" '
                      f'stroke="#999" stroke-width="0.5"/>')
        if cab.appliance_label:
            lines.append(
                f'<text x="{x+w/2}" y="{y+h/2}" text-anchor="middle" '
                f'dominant-baseline="middle" font-size="12" font-weight="bold" '
                f'fill="#666" font-family="{DrawingConfig.FONT_FAMILY}">'
                f'{cab.appliance_label}</text>'
            )
        return "\n    ".join(lines)

    door_count = cab.door_count or 0
    drawer_count = cab.drawer_count or 0

    # If no info, infer from width
    if door_count == 0 and drawer_count == 0:
        if cab.real_width <= 15:
            door_count = 1
        elif cab.real_width <= 24:
            door_count = 1
            if cab.cabinet_type == "base":
                drawer_count = 1
        else:
            door_count = 2
            if cab.cabinet_type == "base":
                drawer_count = 1

    # Draw drawers (top portion)
    if drawer_count > 0:
        drawer_zone_h = h * 0.3 if door_count > 0 else h * 0.9
        drawer_h = drawer_zone_h / drawer_count
        for d in range(drawer_count):
            dy = y + padding + d * drawer_h
            # Drawer box
            lines.append(
                f'<rect x="{x+padding}" y="{dy}" '
                f'width="{w-2*padding}" height="{drawer_h-2}" '
                f'fill="none" stroke="#AAA" stroke-width="0.5" rx="1"/>'
            )
            # Drawer pull (small line in center)
            pull_y = dy + drawer_h / 2
            pull_w = min(20, w * 0.3)
            lines.append(
                f'<line x1="{x+w/2-pull_w/2}" y1="{pull_y}" '
                f'x2="{x+w/2+pull_w/2}" y2="{pull_y}" '
                f'stroke="#999" stroke-width="1.5" stroke-linecap="round"/>'
            )

    # Draw doors (bottom portion, or full height if no drawers)
    if door_count > 0:
        if drawer_count > 0:
            door_top = y + padding + h * 0.3
            door_h = h * 0.65
        else:
            door_top = y + padding
            door_h = h - 2 * padding

        door_w = (w - 2 * padding) / door_count
        for d in range(door_count):
            dx = x + padding + d * door_w
            # Door panel
            lines.append(
                f'<rect x="{dx+1}" y="{door_top}" '
                f'width="{door_w-2}" height="{door_h}" '
                f'fill="none" stroke="#AAA" stroke-width="0.5" rx="1"/>'
            )
            # Inner panel detail (shaker style)
            inset = max(4, door_w * 0.1)
            lines.append(
                f'<rect x="{dx+inset}" y="{door_top+inset}" '
                f'width="{door_w-2*inset}" height="{door_h-2*inset}" '
                f'fill="none" stroke="#CCC" stroke-width="0.5" rx="1"/>'
            )
            # Door knob (small circle)
            if door_count == 1:
                knob_x = dx + door_w - inset - 3
            elif d == 0:
                knob_x = dx + door_w - inset - 3
            else:
                knob_x = dx + inset + 3
            knob_y = door_top + door_h * 0.35
            lines.append(
                f'<circle cx="{knob_x}" cy="{knob_y}" r="2" '
                f'fill="#999" stroke="none"/>'
            )

    # Section ID label (small, bottom-right corner)
    lines.append(
        f'<text x="{x+w-4}" y="{y+h-4}" text-anchor="end" '
        f'font-size="7" fill="#aaa" font-family="{DrawingConfig.FONT_FAMILY}">'
        f'{cab.section_id}</text>'
    )

    return "\n    ".join(lines)


# ===== SVG TEMPLATE =====

SVG_TEMPLATE = Template("""<svg xmlns="http://www.w3.org/2000/svg"
     width="{{ canvas_width }}" height="{{ canvas_height }}"
     viewBox="0 0 {{ canvas_width }} {{ canvas_height }}"
     style="background: white; font-family: {{ font_family }};">

  <defs>
    <!-- Arrowhead marker for dimension lines -->
    <marker id="arrow-start" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto">
      <path d="M8,0 L0,3 L8,6" fill="{{ color_dim }}" stroke="none"/>
    </marker>
    <marker id="arrow-end" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="{{ color_dim }}" stroke="none"/>
    </marker>

    <!-- Filler hatch pattern -->
    <pattern id="filler-hatch" width="6" height="6" patternUnits="userSpaceOnUse"
             patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="#E65100" stroke-width="0.5"/>
    </pattern>
  </defs>

  <!-- Title -->
  <text x="{{ canvas_width / 2 }}" y="30" text-anchor="middle"
        font-size="16" font-weight="bold" fill="#333">{{ title }}</text>
  <text x="{{ canvas_width / 2 }}" y="46" text-anchor="middle"
        font-size="10" fill="#888">Scale: 1" = {{ "%.1f"|format(scale) }}px | Tap a cabinet to input measurement</text>

  <!-- Wall background -->
  <rect x="{{ margin_left }}" y="{{ margin_top }}"
        width="{{ total_run_px }}" height="{{ wall_height }}"
        fill="{{ color_wall }}" stroke="none"/>

  <!-- Countertop -->
  <rect x="{{ ct.x }}" y="{{ ct.y }}" width="{{ ct.width }}" height="{{ ct.height }}"
        fill="{{ color_countertop }}" stroke="#5D4037" stroke-width="1.5" rx="1"/>

  <!-- Floor line -->
  <line x1="{{ margin_left - 10 }}" y1="{{ floor_y }}"
        x2="{{ margin_left + total_run_px + 10 }}" y2="{{ floor_y }}"
        stroke="{{ color_floor }}" stroke-width="2.5"/>

  <!-- ===== BASE CABINETS ===== -->
  <g id="base-cabinets">
  {% for cab in base_cabinets %}
    <g id="cab-{{ cab.section_id }}" class="cabinet tappable" data-section-id="{{ cab.section_id }}"
       data-group-id="{{ cab.group_id or '' }}" style="cursor: pointer;">
      {% if cab.group_id and group_colors[cab.group_id] %}
      <rect x="{{ cab.x }}" y="{{ cab.y }}" width="{{ cab.width_px }}" height="{{ cab.height_px }}"
            fill="{{ group_colors[cab.group_id] }}" stroke="none"/>
      {% endif %}
      <rect x="{{ cab.x }}" y="{{ cab.y }}" width="{{ cab.width_px }}" height="{{ cab.height_px }}"
            fill="{{ color_cabinet }}" fill-opacity="0.7" stroke="{{ source_color(cab.source) }}"
            stroke-width="{{ '2' if cab.source == 'measured' else '1.5' }}"
            stroke-dasharray="{{ source_dash(cab.source) }}"/>
      {{ cabinet_details[cab.section_id] }}
    </g>
  {% endfor %}
  </g>

  <!-- ===== APPLIANCE OPENINGS ===== -->
  <g id="appliances">
  {% for cab in appliance_openings %}
    <g id="cab-{{ cab.section_id }}" class="appliance" data-section-id="{{ cab.section_id }}">
      <rect x="{{ cab.x }}" y="{{ cab.y }}" width="{{ cab.width_px }}" height="{{ cab.height_px }}"
            fill="{{ color_appliance }}" stroke="{{ color_stroke }}" stroke-width="1"/>
      {{ cabinet_details[cab.section_id] }}
    </g>
  {% endfor %}
  </g>

  <!-- ===== WALL CABINETS ===== -->
  <g id="wall-cabinets">
  {% for cab in wall_cabinets %}
    <g id="cab-{{ cab.section_id }}" class="cabinet tappable" data-section-id="{{ cab.section_id }}"
       data-group-id="{{ cab.group_id or '' }}" style="cursor: pointer;">
      {% if cab.cabinet_type == "wall_gap" %}
      <!-- Wall gap: dashed outline only, no fill -->
      <rect x="{{ cab.x }}" y="{{ cab.y }}" width="{{ cab.width_px }}" height="{{ cab.height_px }}"
            fill="none" stroke="#ccc" stroke-width="1"
            stroke-dasharray="4,4"/>
      <text x="{{ cab.x + cab.width_px / 2 }}" y="{{ cab.y + cab.height_px / 2 }}"
            text-anchor="middle" dominant-baseline="middle"
            font-size="12" fill="#999" font-family="{{ font_family }}">{{ cab.label }}</text>
      {% else %}
      {% if cab.group_id and group_colors[cab.group_id] %}
      <rect x="{{ cab.x }}" y="{{ cab.y }}" width="{{ cab.width_px }}" height="{{ cab.height_px }}"
            fill="{{ group_colors[cab.group_id] }}" stroke="none"/>
      {% endif %}
      <rect x="{{ cab.x }}" y="{{ cab.y }}" width="{{ cab.width_px }}" height="{{ cab.height_px }}"
            fill="{{ color_cabinet }}" fill-opacity="0.7" stroke="{{ source_color(cab.source) }}"
            stroke-width="{{ '2' if cab.source == 'measured' else '1.5' }}"
            stroke-dasharray="{{ source_dash(cab.source) }}"/>
      {{ cabinet_details[cab.section_id] }}
      {% endif %}
    </g>
  {% endfor %}
  </g>

  <!-- ===== FILLERS ===== -->
  <g id="fillers">
  {% for f in fillers %}
    <rect x="{{ f.x }}" y="{{ f.y }}" width="{{ f.width_px }}" height="{{ f.height_px }}"
          fill="url(#filler-hatch)" stroke="{{ color_estimated }}" stroke-width="0.5"
          stroke-dasharray="3,2"/>
    <text x="{{ f.x + f.width_px / 2 }}" y="{{ f.y + f.height_px / 2 }}"
          text-anchor="middle" dominant-baseline="middle"
          font-size="7" fill="{{ color_estimated }}" transform="rotate(-90, {{ f.x + f.width_px / 2 }}, {{ f.y + f.height_px / 2 }})">
      {{ f.label }}</text>
  {% endfor %}
  </g>

  <!-- ===== WIDTH DIMENSIONS ===== -->
  <g id="dimensions-width">
  {% for dim in width_dimensions %}
    <!-- Extension lines -->
    <line x1="{{ dim.x1 }}" y1="{{ dim.y1 - 15 }}" x2="{{ dim.x1 }}" y2="{{ dim.y1 + 3 }}"
          stroke="#BBB" stroke-width="0.5"/>
    <line x1="{{ dim.x2 }}" y1="{{ dim.y1 - 15 }}" x2="{{ dim.x2 }}" y2="{{ dim.y1 + 3 }}"
          stroke="#BBB" stroke-width="0.5"/>
    <!-- Dimension line with arrows -->
    <line x1="{{ dim.x1 + 1 }}" y1="{{ dim.y1 }}" x2="{{ dim.x2 - 1 }}" y2="{{ dim.y2 }}"
          stroke="{{ source_color(dim.source) }}" stroke-width="0.8"
          marker-start="url(#arrow-start)" marker-end="url(#arrow-end)"/>
    <!-- Label -->
    <text x="{{ (dim.x1 + dim.x2) / 2 }}" y="{{ dim.y1 - 4 }}" text-anchor="middle"
          font-size="{{ dim_font_size }}" fill="{{ source_color(dim.source) }}"
          font-weight="{{ 'bold' if dim.source == 'measured' else 'normal' }}">{{ dim.label }}</text>
  {% endfor %}
  </g>

  <!-- ===== TOTAL RUN DIMENSION ===== -->
  {% if total_run_dim %}
  <g id="total-run">
    <line x1="{{ total_run_dim.x1 }}" y1="{{ total_run_dim.y1 - 20 }}"
          x2="{{ total_run_dim.x1 }}" y2="{{ total_run_dim.y1 + 3 }}"
          stroke="#BBB" stroke-width="0.5"/>
    <line x1="{{ total_run_dim.x2 }}" y1="{{ total_run_dim.y1 - 20 }}"
          x2="{{ total_run_dim.x2 }}" y2="{{ total_run_dim.y1 + 3 }}"
          stroke="#BBB" stroke-width="0.5"/>
    <line x1="{{ total_run_dim.x1 + 1 }}" y1="{{ total_run_dim.y1 }}"
          x2="{{ total_run_dim.x2 - 1 }}" y2="{{ total_run_dim.y2 }}"
          stroke="{{ color_measured }}" stroke-width="1.2"
          marker-start="url(#arrow-start)" marker-end="url(#arrow-end)"/>
    <text x="{{ (total_run_dim.x1 + total_run_dim.x2) / 2 }}" y="{{ total_run_dim.y1 - 5 }}"
          text-anchor="middle" font-size="12" font-weight="bold"
          fill="{{ color_measured }}">{{ total_run_dim.label }}</text>
  </g>
  {% endif %}

  <!-- ===== HEIGHT DIMENSIONS (left side) ===== -->
  <g id="dimensions-height">
  {% for dim in height_dimensions %}
    <line x1="{{ dim.x1 - 3 }}" y1="{{ dim.y1 }}" x2="{{ dim.x1 + 3 }}" y2="{{ dim.y1 }}"
          stroke="#BBB" stroke-width="0.5"/>
    <line x1="{{ dim.x1 - 3 }}" y1="{{ dim.y2 }}" x2="{{ dim.x1 + 3 }}" y2="{{ dim.y2 }}"
          stroke="#BBB" stroke-width="0.5"/>
    <line x1="{{ dim.x1 }}" y1="{{ dim.y1 + 1 }}" x2="{{ dim.x2 }}" y2="{{ dim.y2 - 1 }}"
          stroke="{{ color_dim }}" stroke-width="0.8"
          marker-start="url(#arrow-start)" marker-end="url(#arrow-end)"/>
    <text x="{{ dim.x1 - 5 }}" y="{{ (dim.y1 + dim.y2) / 2 }}"
          text-anchor="end" dominant-baseline="middle"
          font-size="10" fill="{{ color_dim }}">{{ dim.label }}</text>
  {% endfor %}
  </g>

  <!-- ===== LEGEND ===== -->
  <g id="legend" transform="translate({{ canvas_width - 220 }}, {{ canvas_height - 55 }})">
    <rect x="0" y="0" width="210" height="50" fill="white" stroke="#DDD" stroke-width="1" rx="4"/>

    <line x1="10" y1="12" x2="30" y2="12" stroke="{{ color_measured }}" stroke-width="2"/>
    <text x="35" y="15" font-size="9" fill="#333">Measured (tape)</text>

    <line x1="10" y1="27" x2="30" y2="27" stroke="{{ color_solved }}" stroke-width="1.5"/>
    <text x="35" y="30" font-size="9" fill="#333">Solved (standard size)</text>

    <line x1="110" y1="12" x2="130" y2="12" stroke="{{ color_estimated }}" stroke-width="1.5"
          stroke-dasharray="5,3"/>
    <text x="135" y="15" font-size="9" fill="#333">Estimated</text>

    <rect x="110" y="22" width="20" height="10" fill="url(#filler-hatch)" stroke="#CCC" stroke-width="0.5"/>
    <text x="135" y="30" font-size="9" fill="#333">Filler</text>

    <text x="10" y="44" font-size="8" fill="#999">Tap any cabinet to input measurement</text>
  </g>

</svg>""")


# ===== RENDERING =====

def _source_color(source: str) -> str:
    """Map source type to color."""
    return {
        "measured": DrawingConfig.COLOR_MEASURED,
        "solved": DrawingConfig.COLOR_SOLVED,
        "estimated": DrawingConfig.COLOR_ESTIMATED,
        "propagated": DrawingConfig.COLOR_PROPAGATED,
        "appliance": DrawingConfig.COLOR_STROKE,
    }.get(source, DrawingConfig.COLOR_ESTIMATED)


def _source_dash(source: str) -> str:
    """Map source type to dash style."""
    return {
        "measured": DrawingConfig.DASH_NONE,
        "solved": DrawingConfig.DASH_NONE,
        "estimated": DrawingConfig.DASH_ESTIMATED,
        "propagated": DrawingConfig.DASH_PROPAGATED,
        "appliance": DrawingConfig.DASH_NONE,
    }.get(source, DrawingConfig.DASH_ESTIMATED)


def render_elevation_svg(layout: ElevationLayout) -> str:
    """Render the complete elevation drawing as an SVG string."""
    cfg = DrawingConfig()

    # Pre-generate cabinet detail SVG for each cabinet
    cabinet_details = {}
    for cab in layout.base_cabinets + layout.wall_cabinets + layout.appliance_openings:
        cabinet_details[cab.section_id] = generate_cabinet_details(cab)

    # Build group color lookup
    group_colors = {}
    for g in layout.groups:
        group_colors[g["group_id"]] = g["color"]

    return SVG_TEMPLATE.render(
        canvas_width=layout.canvas_width,
        canvas_height=layout.canvas_height,
        font_family=cfg.FONT_FAMILY,
        title=layout.title,
        scale=layout.scale,
        margin_left=cfg.MARGIN_LEFT,
        margin_top=cfg.MARGIN_TOP,
        total_run_px=layout.countertop_rect["width"],
        wall_height=layout.floor_line_y - cfg.MARGIN_TOP,

        # Elements
        base_cabinets=layout.base_cabinets,
        wall_cabinets=layout.wall_cabinets,
        appliance_openings=layout.appliance_openings,
        fillers=layout.fillers,
        width_dimensions=layout.width_dimensions,
        height_dimensions=layout.height_dimensions,
        total_run_dim=layout.total_run_dimension,
        ct=layout.countertop_rect,
        floor_y=layout.floor_line_y,
        cabinet_details=cabinet_details,
        group_colors=group_colors,

        # Colors
        color_cabinet=cfg.COLOR_CABINET_FILL,
        color_appliance=cfg.COLOR_APPLIANCE_FILL,
        color_countertop=cfg.COLOR_COUNTERTOP,
        color_floor=cfg.COLOR_FLOOR,
        color_wall=cfg.COLOR_WALL,
        color_stroke=cfg.COLOR_STROKE,
        color_measured=cfg.COLOR_MEASURED,
        color_solved=cfg.COLOR_SOLVED,
        color_estimated=cfg.COLOR_ESTIMATED,
        color_dim="#1565C0",
        dim_font_size=cfg.DIM_FONT_SIZE,

        # Functions
        source_color=_source_color,
        source_dash=_source_dash,
    )


# ===== CONVENIENCE FUNCTION =====

def generate_elevation_svg(
    solver_result: SolverResult,
    sections: List[SectionEstimate],
    total_run: float,
    wall_sections: Optional[List[SectionEstimate]] = None,
    wall_solver_result: Optional[SolverResult] = None,
    groups: Optional[List[CabinetGroup]] = None,
    title: str = "Cabinet Elevation Drawing",
) -> str:
    """
    One-call convenience function: solver result → SVG string.

    This is the main entry point for generating a drawing.
    """
    layout = layout_from_solver(
        solver_result=solver_result,
        sections=sections,
        total_run=total_run,
        wall_cabinet_sections=wall_sections,
        wall_solver_result=wall_solver_result,
        groups=groups,
        title=title,
    )
    return render_elevation_svg(layout)
