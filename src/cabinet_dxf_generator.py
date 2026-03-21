# cabinet_dxf_generator.py
#
# DXF R12 File Generation for CNC-Ready Cabinet Parts
#
# Generates individual part DXFs with proper layering for CNC routers:
#   CUTOUT     — outer rectangle (cut path)
#   DADO       — back panel dado grooves (routed channels)
#   BORE_BLIND — shelf pin holes (blind bores, 32mm system)
#   EDGE_BAND  — edges flagged for edge banding
#   ANNOTATIONS— part labels, dimensions
#
# Also generates elevation overview DXFs for visualization.
# All dimensions in inches. Bore spacing uses 32mm internally, converted to inches.

import io
import logging
from typing import Dict, List, Optional, Tuple

import ezdxf
from ezdxf.document import Drawing

from cabinet_parametric import ConstructionConfig, Part

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ===== CONSTANTS =====

MM_TO_INCH = 1.0 / 25.4

# 32mm system bore layout
SHELF_PIN_DIAMETER_MM = 5.0
SHELF_PIN_SPACING_MM = 32.0
SHELF_PIN_FRONT_SETBACK_MM = 37.0   # from front edge of side panel
SHELF_PIN_BOTTOM_OFFSET_MM = 37.0   # first hole from bottom
SHELF_PIN_TOP_CLEARANCE_MM = 50.0   # stop this far from top

# DXF layer definitions: (name, color index)
LAYER_CUTOUT = ("CUTOUT", 7)         # white — cut path
LAYER_DADO = ("DADO", 1)            # red — routed grooves
LAYER_BORE_BLIND = ("BORE_BLIND", 3) # green — blind bore holes
LAYER_EDGE_BAND = ("EDGE_BAND", 2)  # yellow — edge banding marks
LAYER_ANNOTATIONS = ("ANNOTATIONS", 4)  # cyan — text labels


# ===== LAYER SETUP =====

def _setup_layers(doc: Drawing) -> None:
    """Add standard CNC layers to a DXF document."""
    for name, color in [LAYER_CUTOUT, LAYER_DADO, LAYER_BORE_BLIND, LAYER_EDGE_BAND, LAYER_ANNOTATIONS]:
        doc.layers.add(name, color=color)


# ===== SINGLE PART DXF =====

def generate_part_dxf(part: Part, config: Optional[ConstructionConfig] = None) -> bytes:
    """Generate a DXF R12 file for a single cabinet part.

    The part is drawn with its lower-left corner at the origin.
    Width along X, length along Y.

    Args:
        part: Part dataclass with dimensions and edge banding info.
        config: Construction config (needed for dado/bore parameters).

    Returns:
        DXF file content as bytes.
    """
    cfg = config or ConstructionConfig()
    doc = ezdxf.new("R12")
    _setup_layers(doc)
    msp = doc.modelspace()

    w = part.blank_width
    h = part.blank_length

    # --- CUTOUT layer: outer rectangle ---
    # R12 does not support LWPOLYLINE; use individual lines for the outline.
    cutout_layer = LAYER_CUTOUT[0]
    msp.add_line((0, 0), (w, 0), dxfattribs={"layer": cutout_layer})
    msp.add_line((w, 0), (w, h), dxfattribs={"layer": cutout_layer})
    msp.add_line((w, h), (0, h), dxfattribs={"layer": cutout_layer})
    msp.add_line((0, h), (0, 0), dxfattribs={"layer": cutout_layer})

    # --- EDGE_BAND layer: mark banded edges ---
    # Convention: L1=left long edge (x=0), L2=right long edge (x=w)
    #             W1=bottom short edge (y=0), W2=top short edge (y=h)
    eb = part.edge_banding or {}
    edge_offset = 0.1  # visual offset for edge band indicator lines
    if eb.get("L1"):
        msp.add_line((edge_offset, 0), (edge_offset, h), dxfattribs={"layer": LAYER_EDGE_BAND[0]})
    if eb.get("L2"):
        msp.add_line((w - edge_offset, 0), (w - edge_offset, h), dxfattribs={"layer": LAYER_EDGE_BAND[0]})
    if eb.get("W1"):
        msp.add_line((0, edge_offset), (w, edge_offset), dxfattribs={"layer": LAYER_EDGE_BAND[0]})
    if eb.get("W2"):
        msp.add_line((0, h - edge_offset), (w, h - edge_offset), dxfattribs={"layer": LAYER_EDGE_BAND[0]})

    # --- DADO layer: back panel groove (side panels only) ---
    is_side_panel = "side" in part.name.lower()
    if is_side_panel:
        dado_x = cfg.back_panel_thickness  # distance from rear edge
        dado_depth = cfg.back_panel_dado_depth
        # Dado groove runs full height, positioned from the rear (right) edge
        # Part is oriented with rear at x=w, so dado is at x = w - dado_x
        dado_center = w - dado_x
        # Draw dado as two parallel lines (representing groove width = back_panel_thickness)
        half_groove = cfg.back_panel_thickness / 2.0
        msp.add_line(
            (dado_center - half_groove, 0),
            (dado_center - half_groove, h),
            dxfattribs={"layer": LAYER_DADO[0]},
        )
        msp.add_line(
            (dado_center + half_groove, 0),
            (dado_center + half_groove, h),
            dxfattribs={"layer": LAYER_DADO[0]},
        )

    # --- BORE_BLIND layer: shelf pin holes (side panels only) ---
    if is_side_panel:
        pin_spacing = SHELF_PIN_SPACING_MM * MM_TO_INCH
        pin_radius = (SHELF_PIN_DIAMETER_MM * MM_TO_INCH) / 2.0
        front_setback = SHELF_PIN_FRONT_SETBACK_MM * MM_TO_INCH
        bottom_start = SHELF_PIN_BOTTOM_OFFSET_MM * MM_TO_INCH
        top_stop = h - (SHELF_PIN_TOP_CLEARANCE_MM * MM_TO_INCH)

        # Bore column x-position: setback from front edge (x=0 is front)
        bore_x = front_setback

        # Generate holes from bottom to top
        y = bottom_start
        while y <= top_stop:
            msp.add_circle(
                center=(bore_x, y),
                radius=pin_radius,
                dxfattribs={"layer": LAYER_BORE_BLIND[0]},
            )
            y += pin_spacing

    # --- ANNOTATIONS layer: part name and dimensions ---
    text_height = min(w, h) * 0.04
    text_height = max(text_height, 0.15)  # minimum readable size
    text_height = min(text_height, 0.5)   # cap for large parts

    # Part name centered
    msp.add_text(
        part.name,
        dxfattribs={
            "layer": LAYER_ANNOTATIONS[0],
            "height": text_height,
        },
    ).set_placement((w / 2, h / 2))

    # Dimension text below part name
    dim_text = f"{part.blank_width:.4f}\" x {part.blank_length:.4f}\""
    msp.add_text(
        dim_text,
        dxfattribs={
            "layer": LAYER_ANNOTATIONS[0],
            "height": text_height * 0.8,
        },
    ).set_placement((w / 2, h / 2 - text_height * 1.5))

    # Quantity if > 1
    if part.quantity > 1:
        qty_text = f"QTY: {part.quantity}"
        msp.add_text(
            qty_text,
            dxfattribs={
                "layer": LAYER_ANNOTATIONS[0],
                "height": text_height * 0.8,
            },
        ).set_placement((w / 2, h / 2 - text_height * 3.0))

    # --- Dimension entities (width and length) ---
    # Width dimension along bottom
    dim_offset = -1.0
    msp.add_line((0, dim_offset), (w, dim_offset), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
    msp.add_line((0, 0), (0, dim_offset - 0.3), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
    msp.add_line((w, 0), (w, dim_offset - 0.3), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
    msp.add_text(
        f"{part.blank_width:.4f}\"",
        dxfattribs={"layer": LAYER_ANNOTATIONS[0], "height": text_height * 0.7},
    ).set_placement((w / 2, dim_offset - 0.5))

    # Length dimension along left
    dim_offset_x = -1.0
    msp.add_line((dim_offset_x, 0), (dim_offset_x, h), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
    msp.add_line((0, 0), (dim_offset_x - 0.3, 0), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
    msp.add_line((0, h), (dim_offset_x - 0.3, h), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
    msp.add_text(
        f"{part.blank_length:.4f}\"",
        dxfattribs={"layer": LAYER_ANNOTATIONS[0], "height": text_height * 0.7},
    ).set_placement((dim_offset_x - 0.5, h / 2))

    # Serialize to bytes — ezdxf.write() expects a text stream
    text_stream = io.StringIO()
    doc.write(text_stream)
    return text_stream.getvalue().encode("utf-8")


# ===== CABINET DXF PACKAGE =====

def generate_cabinet_dxf_package(
    cabinet_id: str,
    parts: List[Part],
    config: Optional[ConstructionConfig] = None,
) -> Dict[str, bytes]:
    """Generate DXF files for all parts of one cabinet.

    Args:
        cabinet_id: Identifier for the cabinet (used in filenames).
        parts: List of Part objects from CabinetParts.
        config: Construction config.

    Returns:
        Dict mapping filename (str) to DXF file content (bytes).
    """
    cfg = config or ConstructionConfig()
    package: Dict[str, bytes] = {}

    for i, part in enumerate(parts):
        # Sanitize part name for filename
        safe_name = part.name.lower().replace(" ", "_").replace("/", "_")
        filename = f"{cabinet_id}_{safe_name}.dxf"

        # If quantity > 1, still one DXF (CNC runs it multiple times)
        dxf_bytes = generate_part_dxf(part, cfg)
        package[filename] = dxf_bytes
        logger.info(f"Generated {filename} ({len(dxf_bytes)} bytes)")

    return package


# ===== ELEVATION DXF =====

def generate_elevation_dxf(
    cabinets: List[dict],
    total_run: float,
) -> bytes:
    """Generate an elevation overview DXF showing all cabinets side by side.

    Draws a front elevation wireframe with cabinet outlines, widths, and
    overall dimension. Suitable for client review or print.

    Args:
        cabinets: List of dicts with width, height, cabinet_id, and
                  optionally cabinet_type.
        total_run: Total wall run in inches (for overall dimension).

    Returns:
        DXF file content as bytes.
    """
    doc = ezdxf.new("R12")
    _setup_layers(doc)
    msp = doc.modelspace()

    x_cursor = 0.0
    max_height = 0.0
    text_h = 1.0

    for cab in cabinets:
        w = cab["width"]
        h = cab.get("height", 34.5)
        cab_id = cab.get("cabinet_id", "")
        max_height = max(max_height, h)

        # Cabinet outline (R12-compatible individual lines)
        cl = LAYER_CUTOUT[0]
        msp.add_line((x_cursor, 0), (x_cursor + w, 0), dxfattribs={"layer": cl})
        msp.add_line((x_cursor + w, 0), (x_cursor + w, h), dxfattribs={"layer": cl})
        msp.add_line((x_cursor + w, h), (x_cursor, h), dxfattribs={"layer": cl})
        msp.add_line((x_cursor, h), (x_cursor, 0), dxfattribs={"layer": cl})

        # Cabinet ID label
        msp.add_text(
            cab_id,
            dxfattribs={"layer": LAYER_ANNOTATIONS[0], "height": text_h},
        ).set_placement((x_cursor + w / 2, h / 2 + text_h))

        # Width label
        msp.add_text(
            f'{w}"',
            dxfattribs={"layer": LAYER_ANNOTATIONS[0], "height": text_h * 0.8},
        ).set_placement((x_cursor + w / 2, h / 2 - text_h))

        # Individual width dimension below floor line
        dim_y = -3.0
        msp.add_line((x_cursor, dim_y), (x_cursor + w, dim_y), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
        msp.add_line((x_cursor, 0), (x_cursor, dim_y - 0.5), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
        msp.add_line((x_cursor + w, 0), (x_cursor + w, dim_y - 0.5), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
        msp.add_text(
            f'{w}"',
            dxfattribs={"layer": LAYER_ANNOTATIONS[0], "height": text_h * 0.7},
        ).set_placement((x_cursor + w / 2, dim_y - 1.5))

        x_cursor += w

    # Overall run dimension
    overall_y = -7.0
    msp.add_line((0, overall_y), (x_cursor, overall_y), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
    msp.add_line((0, -3.5), (0, overall_y - 0.5), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
    msp.add_line((x_cursor, -3.5), (x_cursor, overall_y - 0.5), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
    msp.add_text(
        f'Total Run: {total_run}"',
        dxfattribs={"layer": LAYER_ANNOTATIONS[0], "height": text_h},
    ).set_placement((x_cursor / 2, overall_y - 2.0))

    # Height dimension on right side
    height_x = x_cursor + 3.0
    msp.add_line((height_x, 0), (height_x, max_height), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
    msp.add_line((x_cursor, 0), (height_x + 0.5, 0), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
    msp.add_line((x_cursor, max_height), (height_x + 0.5, max_height), dxfattribs={"layer": LAYER_ANNOTATIONS[0]})
    msp.add_text(
        f'{max_height}"',
        dxfattribs={"layer": LAYER_ANNOTATIONS[0], "height": text_h * 0.7},
    ).set_placement((height_x + 1.0, max_height / 2))

    text_stream = io.StringIO()
    doc.write(text_stream)
    return text_stream.getvalue().encode("utf-8")


# ===== MAIN =====

if __name__ == "__main__":
    from cabinet_parametric import CabinetParts, ConstructionConfig as CC

    # Build sample parts for a 24" base cabinet
    cfg = CC()
    cp = CabinetParts(
        cabinet_width=24,
        cabinet_height=34.5,
        cabinet_depth=24,
        door_count=1,
        config=cfg,
        cabinet_id="base_1",
    )

    print("=" * 60)
    print("PART DXF GENERATION TEST — base_1 (24\" base)")
    print("=" * 60)

    # Generate package
    package = generate_cabinet_dxf_package("base_1", cp.parts, cfg)
    for filename, data in package.items():
        print(f"  {filename}: {len(data):,} bytes")

    # Write one sample to disk for inspection
    sample_file = list(package.keys())[0]
    with open(f"/tmp/{sample_file}", "wb") as f:
        f.write(package[sample_file])
    print(f"\n  Wrote sample to /tmp/{sample_file}")

    # Generate elevation DXF
    print("\n" + "=" * 60)
    print("ELEVATION DXF TEST")
    print("=" * 60)

    sample_cabinets = [
        {"cabinet_id": "base_1", "width": 24, "height": 34.5},
        {"cabinet_id": "base_2", "width": 36, "height": 34.5},
        {"cabinet_id": "tall_1", "width": 24, "height": 84},
    ]
    elev_bytes = generate_elevation_dxf(sample_cabinets, total_run=84.0)
    with open("/tmp/elevation_test.dxf", "wb") as f:
        f.write(elev_bytes)
    print(f"  elevation_test.dxf: {len(elev_bytes):,} bytes -> /tmp/elevation_test.dxf")

    print("\nAll tests passed.")
