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


# ===== 2.5D ISOMETRIC WIREFRAME =====

import math

def generate_wireframe_svg(
    solver_result: SolverResult,
    sections: List[SectionEstimate],
    total_run: float,
    wall_sections: Optional[List[SectionEstimate]] = None,
    wall_solver_result: Optional[SolverResult] = None,
    title: str = "Cabinet Layout — Wireframe",
) -> str:
    """
    Generate a deterministic 2.5D isometric wireframe SVG of the cabinet layout.

    Renders front faces with shaker-style door panels, top faces as 30-degree
    parallelograms, and right side faces for the rightmost cabinet and
    fridge-type appliances. Includes countertop, toe kick, dimension lines,
    and cabinet labels.

    Same inputs as generate_elevation_svg().
    """
    # ── Constants ──
    SCALE = 6  # 6 px/in — larger for better visibility
    ISO_ANGLE = math.radians(30)
    COS30 = math.cos(ISO_ANGLE)  # ≈ 0.866
    SIN30 = math.sin(ISO_ANGLE)  # 0.5

    # Cabinet geometry (inches)
    BASE_HEIGHT = DrawingConfig.BASE_CABINET_HEIGHT   # 34.5"
    BASE_DEPTH = 24.0
    WALL_HEIGHT = DrawingConfig.WALL_CABINET_HEIGHT    # 30"
    WALL_DEPTH = 12.0
    COUNTERTOP_THICK = DrawingConfig.COUNTERTOP_THICKNESS  # 1.5"
    COUNTERTOP_OVERHANG = 1.5  # front overhang in inches
    BACKSPLASH_GAP = 12.0  # reduced from 15" for tighter layout — wall cabs closer to counter
    TOE_KICK_H = DrawingConfig.TOE_KICK_HEIGHT        # 4.5"
    FRIDGE_DEPTH = 30.0
    FRIDGE_HEIGHT = 70.0

    # Margins
    MARGIN_LEFT = 40
    MARGIN_TOP = 50
    MARGIN_BOTTOM = 80
    MARGIN_RIGHT = 160  # room for iso depth projection

    # Isometric offsets (pixels) for base and wall depth
    base_dx = BASE_DEPTH * COS30 * SCALE
    base_dy = BASE_DEPTH * SIN30 * SCALE
    wall_dx = WALL_DEPTH * COS30 * SCALE
    wall_dy = WALL_DEPTH * SIN30 * SCALE
    ct_dx = BASE_DEPTH * COS30 * SCALE  # countertop uses base depth
    ct_dy = BASE_DEPTH * SIN30 * SCALE
    fridge_dx = FRIDGE_DEPTH * COS30 * SCALE
    fridge_dy = FRIDGE_DEPTH * SIN30 * SCALE

    # Colors
    FACE_FRONT = "#f8f8f8"
    FACE_TOP = "#e8e8e8"
    FACE_SIDE = "#e0e0e0"
    STROKE = "#222222"
    STROKE_W = 1.5  # main stroke width
    STROKE_THIN = "#444444"
    STROKE_THIN_W = 0.8  # detail stroke width
    TOE_KICK_FILL = "#888888"
    COUNTERTOP_FILL = "#d4c4b0"
    COUNTERTOP_TOP = "#c8b8a4"
    APPLIANCE_FILL = "#e0e0e0"
    GRID_COLOR = "#e0e0e0"
    DIM_COLOR = "#666666"
    LABEL_COLOR = "#444444"

    # ── Build width lookup from solver result ──
    width_lookup: Dict[str, float] = {}
    source_lookup: Dict[str, str] = {}
    for cw in solver_result.cabinet_widths:
        width_lookup[cw.section_id] = cw.standard_width
        source_lookup[cw.section_id] = cw.source

    wall_width_lookup: Dict[str, float] = {}
    wall_source_lookup: Dict[str, str] = {}
    if wall_solver_result:
        for cw in wall_solver_result.cabinet_widths:
            wall_width_lookup[cw.section_id] = cw.standard_width
            wall_source_lookup[cw.section_id] = cw.source

    # ── Separate base sections ──
    base_sections = [s for s in sections if s.cabinet_type in ("base", "appliance_opening")]
    wall_secs = wall_sections or []

    # ── Compute vertical positions (front face, in pixels, y-down) ──
    # Wall cabinets top
    wall_top_y = MARGIN_TOP
    wall_h_px = WALL_HEIGHT * SCALE
    # Backsplash gap
    backsplash_top = wall_top_y + wall_h_px
    backsplash_h_px = BACKSPLASH_GAP * SCALE
    # Countertop
    ct_top_y = backsplash_top + backsplash_h_px
    ct_h_px = COUNTERTOP_THICK * SCALE
    # Base cabinets
    base_top_y = ct_top_y + ct_h_px
    base_h_px = BASE_HEIGHT * SCALE
    # Toe kick
    toe_kick_y = base_top_y + base_h_px - TOE_KICK_H * SCALE
    toe_kick_h_px = TOE_KICK_H * SCALE
    # Floor
    floor_y = base_top_y + base_h_px

    # ── Compute canvas size ──
    total_run_px = total_run * SCALE
    canvas_w = MARGIN_LEFT + total_run_px + max(base_dx, fridge_dx) + MARGIN_RIGHT
    canvas_h = floor_y + MARGIN_BOTTOM

    # ── SVG accumulator ──
    svg_parts: List[str] = []

    def _rect(x, y, w, h, fill="none", stroke=STROKE, sw=1.0, rx=0):
        r = f' rx="{rx}"' if rx else ""
        return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{r}/>'

    def _line(x1, y1, x2, y2, stroke=STROKE, sw=1.0, dash=""):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{sw}"{d}/>'

    def _polygon(points, fill="none", stroke=STROKE, sw=1.0):
        pts = " ".join(f"{px:.1f},{py:.1f}" for px, py in points)
        return f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'

    def _text(x, y, txt, size=10, anchor="middle", fill=LABEL_COLOR, weight="normal", rotate=0):
        r = f' transform="rotate({rotate},{x:.1f},{y:.1f})"' if rotate else ""
        return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{DrawingConfig.FONT_FAMILY}" '
                f'font-size="{size}" fill="{fill}" text-anchor="{anchor}" '
                f'font-weight="{weight}"{r}>{txt}</text>')

    # ── Background + grid ──
    svg_parts.append(_rect(0, 0, canvas_w, canvas_h, fill="white", stroke="none"))
    # Grid lines
    grid_spacing = 20  # px
    for gx in range(0, int(canvas_w) + 1, grid_spacing):
        svg_parts.append(_line(gx, 0, gx, canvas_h, stroke=GRID_COLOR, sw=0.5))
    for gy in range(0, int(canvas_h) + 1, grid_spacing):
        svg_parts.append(_line(0, gy, canvas_w, gy, stroke=GRID_COLOR, sw=0.5))

    # ── Title removed to save vertical space ──

    # ── Helper: draw an isometric cabinet box ──
    def draw_iso_box(x, y, w_px, h_px, depth_dx, depth_dy, fill_front, fill_top,
                     fill_side, show_side=False, stroke_w=1.8):
        """Draw the three visible faces of an isometric box."""
        parts = []

        # Front face
        parts.append(_rect(x, y, w_px, h_px, fill=fill_front, stroke=STROKE, sw=stroke_w))

        # Top face (parallelogram: front-top-left → front-top-right → back-top-right → back-top-left)
        top_pts = [
            (x, y),
            (x + w_px, y),
            (x + w_px + depth_dx, y - depth_dy),
            (x + depth_dx, y - depth_dy),
        ]
        parts.append(_polygon(top_pts, fill=fill_top, stroke=STROKE, sw=stroke_w))

        # Right side face (only if requested)
        if show_side:
            side_pts = [
                (x + w_px, y),
                (x + w_px + depth_dx, y - depth_dy),
                (x + w_px + depth_dx, y + h_px - depth_dy),
                (x + w_px, y + h_px),
            ]
            parts.append(_polygon(side_pts, fill=fill_side, stroke=STROKE, sw=stroke_w))

        return parts

    def draw_shaker_door(x, y, w, h, inset=None):
        """Draw a shaker-style door panel (outer frame + inner recessed rectangle)."""
        if inset is None:
            inset = max(6, min(10, w * 0.08))
        parts = []
        # Outer door frame
        parts.append(_rect(x, y, w, h, fill=FACE_FRONT, stroke=STROKE, sw=STROKE_W))
        # Inner panel (inset) with subtle shadow lines for 3D recessed look
        if w > inset * 2 + 4 and h > inset * 2 + 4:
            ix, iy = x + inset, y + inset
            iw, ih = w - 2 * inset, h - 2 * inset
            parts.append(_rect(ix, iy, iw, ih,
                               fill="#ececec", stroke=STROKE_THIN, sw=STROKE_THIN_W))
            # Shadow line along top inside edge
            parts.append(_line(ix + 1, iy + 1, ix + iw - 1, iy + 1,
                              stroke="#ddd", sw=0.8))
            # Shadow line along left inside edge
            parts.append(_line(ix + 1, iy + 1, ix + 1, iy + ih - 1,
                              stroke="#ddd", sw=0.8))
        # Handle (small vertical bar pull on right side, vertically centered)
        handle_x = x + w - inset - 3
        handle_y = y + h * 0.42
        handle_len = min(20, h * 0.15)
        parts.append(_line(handle_x, handle_y, handle_x, handle_y + handle_len,
                          stroke="#777", sw=2.5))
        return parts

    def draw_drawer_front(x, y, w, h, inset=6):
        """Draw a drawer front with inset panel and centered pull."""
        parts = []
        parts.append(_rect(x, y, w, h, fill=FACE_FRONT, stroke=STROKE, sw=STROKE_W))
        if w > inset * 2 + 4 and h > inset * 2 + 4:
            parts.append(_rect(x + inset, y + inset, w - 2 * inset, h - 2 * inset,
                               fill="#f0f0f0", stroke=STROKE_THIN, sw=STROKE_THIN_W))
        # Horizontal bar pull centered
        pull_w = min(30, w * 0.35)
        pull_x = x + (w - pull_w) / 2
        pull_y = y + h / 2
        parts.append(_line(pull_x, pull_y, pull_x + pull_w, pull_y,
                          stroke="#777", sw=2.5))
        return parts

    # ── Filler lookup ──
    filler_lookup: Dict[str, FillerStrip] = {}
    for f in solver_result.fillers:
        filler_lookup[f.position] = f

    # ── Draw base cabinets ──
    x_cursor = MARGIN_LEFT

    # Left-wall filler
    if base_sections:
        left_key = f"left_of_{base_sections[0].section_id}"
        left_filler = filler_lookup.get(left_key) or filler_lookup.get("left_wall")
        if left_filler and left_filler.width > 0.125:
            x_cursor += left_filler.width * SCALE

    base_positions: List[Tuple[float, float, float, str, bool, Optional[str]]] = []
    # (x, width_px, width_in, section_id, is_appliance, appliance_type)

    for i, section in enumerate(base_sections):
        w_in = width_lookup.get(section.section_id, section.proportion * total_run)
        w_px = w_in * SCALE
        is_app = section.is_appliance and section.appliance_type and \
            "sink" not in (section.appliance_type or "").lower()

        base_positions.append((x_cursor, w_px, w_in, section.section_id, is_app,
                               section.appliance_type))
        x_cursor += w_px

        # Filler between cabinets
        if i < len(base_sections) - 1:
            fk = f"between_{section.section_id}_{base_sections[i + 1].section_id}"
            bf = filler_lookup.get(fk)
            if bf and bf.width > 0.125:
                x_cursor += bf.width * SCALE

    # Detect fridge positions for special handling
    fridge_indices = set()
    for idx, (_, _, _, _, is_app, app_type) in enumerate(base_positions):
        if is_app and app_type and "refrigerator" in (app_type or ""):
            fridge_indices.add(idx)

    last_idx = len(base_positions) - 1

    # Draw each base cabinet
    for idx, (bx, bw, bw_in, sid, is_app, app_type) in enumerate(base_positions):
        is_fridge = idx in fridge_indices
        show_right = (idx == last_idx) or is_fridge

        if is_fridge:
            # Fridge: tall box with deeper projection
            fridge_h_px = FRIDGE_HEIGHT * SCALE
            fridge_y = floor_y - fridge_h_px
            box_parts = draw_iso_box(
                bx, fridge_y, bw, fridge_h_px,
                fridge_dx, fridge_dy,
                APPLIANCE_FILL, FACE_TOP, FACE_SIDE,
                show_side=True, stroke_w=1.5,
            )
            for p in box_parts:
                svg_parts.append(p)
            # Label
            svg_parts.append(_text(bx + bw / 2, fridge_y + fridge_h_px / 2,
                                   "FRIDGE", size=13, weight="bold"))
            svg_parts.append(_text(bx + bw / 2, fridge_y + fridge_h_px / 2 + 16,
                                   sid, size=11))
        elif is_app:
            # Appliance opening (range, DW, etc): recessed look with X pattern
            inset = 4
            svg_parts.append(_rect(bx, base_top_y, bw, base_h_px,
                                   fill="#d8d8d8", stroke=STROKE, sw=1.2))
            inner_x = bx + inset
            inner_y = base_top_y + inset
            inner_w = bw - 2 * inset
            inner_h = base_h_px - 2 * inset
            svg_parts.append(_rect(inner_x, inner_y, inner_w, inner_h,
                                   fill="#d0d0d0", stroke=STROKE_THIN, sw=0.8))
            # X pattern to indicate opening (not a cabinet)
            svg_parts.append(_line(inner_x, inner_y,
                                   inner_x + inner_w, inner_y + inner_h,
                                   stroke="#bbb", sw=0.8, dash="4,3"))
            svg_parts.append(_line(inner_x + inner_w, inner_y,
                                   inner_x, inner_y + inner_h,
                                   stroke="#bbb", sw=0.8, dash="4,3"))
            # Appliance label
            label_map = {
                "range_30": "RANGE", "range_36": "RANGE",
                "dishwasher": "DW", "microwave_otr": "MW",
            }
            lbl = label_map.get(app_type or "", "APPLIANCE")
            svg_parts.append(_text(bx + bw / 2, base_top_y + base_h_px / 2, lbl,
                                   size=13, weight="bold"))
            svg_parts.append(_text(bx + bw / 2, base_top_y + base_h_px / 2 + 16,
                                   sid, size=11))
        else:
            # Regular cabinet box with isometric faces
            box_parts = draw_iso_box(
                bx, base_top_y, bw, base_h_px,
                base_dx, base_dy,
                FACE_FRONT, FACE_TOP, FACE_SIDE,
                show_side=show_right, stroke_w=1.2,
            )
            for p in box_parts:
                svg_parts.append(p)

            # Toe kick
            svg_parts.append(_rect(bx, toe_kick_y, bw, toe_kick_h_px,
                                   fill=TOE_KICK_FILL, stroke=STROKE, sw=0.8))

            # Door and drawer layout inside front face
            # Determine door/drawer counts from the section
            sec = next((s for s in sections if s.section_id == sid), None)
            door_count = 0
            drawer_count = 0
            is_sink = False
            if sec:
                # Heuristic: determine door/drawer layout from width and type
                is_sink = sec.is_appliance and sec.appliance_type and \
                    "sink" in (sec.appliance_type or "").lower()
                if is_sink:
                    door_count = 2
                    drawer_count = 0
                elif bw_in <= 15:
                    # Narrow: single door, maybe a drawer on top
                    door_count = 1
                    drawer_count = 1
                elif bw_in <= 24:
                    door_count = 1
                    drawer_count = 1
                elif bw_in <= 36:
                    door_count = 2
                    drawer_count = 1
                else:
                    door_count = 2
                    drawer_count = 2

            panel_gap = 3  # gap between panels in px
            usable_y = base_top_y + panel_gap
            usable_h = base_h_px - toe_kick_h_px - panel_gap * 2

            if drawer_count > 0 and door_count > 0:
                # Drawers on top, doors on bottom (20% of front height, min 15px each)
                drawer_total_h = usable_h * 0.20
                each_drawer_h = (drawer_total_h - panel_gap * (drawer_count - 1)) / drawer_count
                if each_drawer_h < 15:
                    each_drawer_h = 15
                    drawer_total_h = each_drawer_h * drawer_count + panel_gap * (drawer_count - 1)
                door_total_h = usable_h - drawer_total_h - panel_gap

                dy = usable_y
                for _ in range(drawer_count):
                    for p in draw_drawer_front(bx + panel_gap, dy,
                                               bw - 2 * panel_gap, each_drawer_h):
                        svg_parts.append(p)
                    dy += each_drawer_h + panel_gap

                # Doors below drawers
                each_door_w = (bw - panel_gap * (door_count + 1)) / door_count
                for d in range(door_count):
                    dx = bx + panel_gap + d * (each_door_w + panel_gap)
                    for p in draw_shaker_door(dx, dy, each_door_w, door_total_h):
                        svg_parts.append(p)
            elif door_count > 0:
                each_door_w = (bw - panel_gap * (door_count + 1)) / door_count
                for d in range(door_count):
                    dx = bx + panel_gap + d * (each_door_w + panel_gap)
                    for p in draw_shaker_door(dx, usable_y, each_door_w, usable_h):
                        svg_parts.append(p)

            # Sink label if applicable
            if is_sink:
                svg_parts.append(_text(bx + bw / 2, base_top_y + base_h_px / 2,
                                       "SINK", size=13, weight="bold", fill="#777"))

            # Cabinet ID label below toe kick
            svg_parts.append(_text(bx + bw / 2, floor_y + 14, sid, size=11, fill=LABEL_COLOR))

    # ── Draw countertop ──
    # Countertop spans all base cabinets (excluding fridge)
    non_fridge = [(bx, bw) for idx, (bx, bw, _, _, _, _) in enumerate(base_positions)
                  if idx not in fridge_indices]
    if non_fridge:
        ct_left = non_fridge[0][0]
        ct_right = max(bx + bw for bx, bw in non_fridge)
        ct_w = ct_right - ct_left
        overhang_px = COUNTERTOP_OVERHANG * SCALE

        # Front face of countertop (with overhang) — thicker stroke as visual anchor
        svg_parts.append(_rect(ct_left - overhang_px, ct_top_y, ct_w + 2 * overhang_px,
                               ct_h_px, fill=COUNTERTOP_FILL, stroke=STROKE, sw=2.0))

        # Top face of countertop (parallelogram with overhang)
        ct_pts = [
            (ct_left - overhang_px, ct_top_y),
            (ct_right + overhang_px, ct_top_y),
            (ct_right + overhang_px + ct_dx, ct_top_y - ct_dy),
            (ct_left - overhang_px + ct_dx, ct_top_y - ct_dy),
        ]
        svg_parts.append(_polygon(ct_pts, fill=COUNTERTOP_TOP, stroke=STROKE, sw=1.2))

        # Right edge of countertop
        side_pts = [
            (ct_right + overhang_px, ct_top_y),
            (ct_right + overhang_px + ct_dx, ct_top_y - ct_dy),
            (ct_right + overhang_px + ct_dx, ct_top_y + ct_h_px - ct_dy),
            (ct_right + overhang_px, ct_top_y + ct_h_px),
        ]
        svg_parts.append(_polygon(side_pts, fill=COUNTERTOP_FILL, stroke=STROKE, sw=1.0))

    # ── Draw wall cabinets ──
    if wall_secs:
        # Build position map for wall cabinets aligned to base cabinets
        base_x_by_id: Dict[str, Tuple[float, float]] = {}
        for bx, bw, _, sid, _, _ in base_positions:
            base_x_by_id[sid] = (bx, bw)

        wall_x_cursor = MARGIN_LEFT
        wall_positions: List[Tuple[float, float, float, str, str]] = []

        for wi, wsec in enumerate(wall_secs):
            ww_in = wall_width_lookup.get(wsec.section_id, wsec.proportion * total_run)
            ww_px = ww_in * SCALE

            # Try to align with base cabinets
            if wsec.above_base_ids and wsec.above_base_ids[0] in base_x_by_id:
                aligned_x, _ = base_x_by_id[wsec.above_base_ids[0]]
                wall_x_cursor = aligned_x

            wall_positions.append((wall_x_cursor, ww_px, ww_in, wsec.section_id,
                                   wsec.cabinet_type))
            wall_x_cursor += ww_px

        last_wall_idx = len(wall_positions) - 1
        for widx, (wx, ww, ww_in, wsid, wcab_type) in enumerate(wall_positions):
            if wcab_type == "wall_gap":
                # Hood gap: empty space with label and bracket line
                mid_x = wx + ww / 2
                mid_y = wall_top_y + wall_h_px / 2
                svg_parts.append(_text(mid_x, mid_y, "HOOD", size=12,
                                       weight="bold", fill="#999"))
                # Small horizontal bracket line
                bracket_w = min(ww * 0.6, 60)
                bracket_y = mid_y + 16
                svg_parts.append(_line(mid_x - bracket_w / 2, bracket_y,
                                       mid_x + bracket_w / 2, bracket_y,
                                       stroke="#aaa", sw=1.5))
                svg_parts.append(_text(wx + ww / 2, wall_top_y - 10, wsid, size=11,
                                       fill=LABEL_COLOR))
                continue

            show_right_wall = (widx == last_wall_idx)

            box_parts = draw_iso_box(
                wx, wall_top_y, ww, wall_h_px,
                wall_dx, wall_dy,
                FACE_FRONT, FACE_TOP, FACE_SIDE,
                show_side=show_right_wall, stroke_w=1.2,
            )
            for p in box_parts:
                svg_parts.append(p)

            # Door panels inside wall cabinet front face
            panel_gap = 3
            w_door_count = 2 if ww_in >= 24 else 1
            each_door_w = (ww - panel_gap * (w_door_count + 1)) / w_door_count
            wall_door_h = wall_h_px - 2 * panel_gap
            wall_door_inset = None  # default
            if wall_door_h < 80:
                default_inset = max(6, min(10, each_door_w * 0.08))
                wall_door_inset = max(4, default_inset * 0.7)
            for d in range(w_door_count):
                dx = wx + panel_gap + d * (each_door_w + panel_gap)
                for p in draw_shaker_door(dx, wall_top_y + panel_gap,
                                          each_door_w, wall_door_h,
                                          inset=wall_door_inset):
                    svg_parts.append(p)

            # Wall cabinet label
            svg_parts.append(_text(wx + ww / 2, wall_top_y - 10, wsid, size=11,
                                   fill=LABEL_COLOR))

    # ── Back wall line (left edge, top of wall cabs to floor) ──
    svg_parts.append(_line(MARGIN_LEFT, wall_top_y, MARGIN_LEFT, floor_y,
                           stroke="#ccc", sw=1.0))

    # ── Floor line (spans full width of base cabinets) ──
    if base_positions:
        floor_x1 = base_positions[0][0]
        floor_x2 = base_positions[-1][0] + base_positions[-1][1]
        svg_parts.append(_line(floor_x1, floor_y, floor_x2, floor_y,
                               stroke="#999", sw=1.5))

    # ── Dimension lines (below base cabinets) ──
    dim_y = floor_y + 35
    dim_total_y = floor_y + 58

    def draw_dimension(x1, x2, y, label, color=DIM_COLOR, label_size=12, label_weight="normal"):
        parts = []
        arrow_size = 4
        parts.append(_line(x1, y, x2, y, stroke=color, sw=1.0))
        # Left arrowhead
        parts.append(_line(x1, y, x1 + arrow_size, y - arrow_size, stroke=color, sw=1.0))
        parts.append(_line(x1, y, x1 + arrow_size, y + arrow_size, stroke=color, sw=1.0))
        # Right arrowhead
        parts.append(_line(x2, y, x2 - arrow_size, y - arrow_size, stroke=color, sw=1.0))
        parts.append(_line(x2, y, x2 - arrow_size, y + arrow_size, stroke=color, sw=1.0))
        # Extension lines
        parts.append(_line(x1, y - 8, x1, y + 8, stroke=color, sw=0.5))
        parts.append(_line(x2, y - 8, x2, y + 8, stroke=color, sw=0.5))
        # Label
        mid_x = (x1 + x2) / 2
        parts.append(_text(mid_x, y - 5, label, size=label_size, fill=color, weight=label_weight))
        return parts

    # Individual cabinet width dimensions
    for bx, bw, bw_in, sid, is_app, _ in base_positions:
        label = f'{bw_in:.0f}"' if bw_in == int(bw_in) else f'{bw_in:.1f}"'
        for p in draw_dimension(bx, bx + bw, dim_y, label):
            svg_parts.append(p)

    # Total run dimension
    if base_positions:
        run_x1 = base_positions[0][0]
        run_x2 = base_positions[-1][0] + base_positions[-1][1]
        for p in draw_dimension(run_x1, run_x2, dim_total_y,
                                f'{total_run:.1f}" TOTAL RUN', color="#333",
                                label_size=13, label_weight="bold"):
            svg_parts.append(p)

    # ── Assemble SVG ──
    svg_header = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {canvas_w:.0f} {canvas_h:.0f}" '
        f'width="{canvas_w:.0f}" height="{canvas_h:.0f}" '
        f'style="background:white">'
    )
    svg_body = "\n".join(svg_parts)
    svg_footer = "</svg>"

    return f"{svg_header}\n{svg_body}\n{svg_footer}"
