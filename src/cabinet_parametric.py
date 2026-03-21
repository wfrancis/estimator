# cabinet_parametric.py
#
# Part Dimension Computation Engine
#
# Computes exact part dimensions for CNC-ready cabinet manufacturing.
# Supports frameless (European) and face-frame construction methods.
# All dimensions in inches unless noted otherwise.

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ===== CONFIGURATION =====

@dataclass
class ConstructionConfig:
    """Construction parameters for cabinet part computation."""
    construction_type: Literal["frameless", "face_frame"] = "frameless"
    box_material_thickness: float = 0.75          # 3/4" plywood
    back_panel_thickness: float = 0.25            # 1/4" plywood
    back_panel_dado_depth: float = 0.25           # depth of dado groove for back panel
    edge_banding_thickness: float = 0.039         # 1mm PVC edge banding
    toe_kick_height: float = 4.5                  # inches
    toe_kick_depth: float = 3.0                   # inches
    shelf_pin_spacing_mm: float = 32.0            # 32mm system
    shelf_clearance_per_side: float = 0.0625      # 1/16" per side for adjustable shelves
    shelf_nose_clearance: float = 1.0             # depth reduction for shelf front clearance
    top_stretcher_depth: float = 4.0              # nailer/stretcher strip depth
    face_frame_stile_width: float = 1.5           # face frame stile width
    face_frame_rail_width: float = 1.5            # face frame rail width


# ===== PART MODEL =====

@dataclass
class Part:
    """A single cut part for CNC or panel saw."""
    name: str
    blank_width: float                            # finished width after edge banding deduction
    blank_length: float                           # finished length after edge banding deduction
    material: str                                 # e.g. "3/4 plywood", "1/4 plywood", "hardwood"
    thickness: float
    edge_banding: Dict[str, bool] = field(default_factory=dict)  # L1, L2, W1, W2 -> banded?
    grain_direction: Literal["length", "width"] = "length"
    quantity: int = 1
    notes: str = ""

    @property
    def area_sqft(self) -> float:
        """Board area in square feet (for one piece)."""
        return (self.blank_width * self.blank_length) / 144.0

    @property
    def total_area_sqft(self) -> float:
        """Total board area for all pieces."""
        return self.area_sqft * self.quantity


# ===== CABINET PARTS COMPUTATION =====

class CabinetParts:
    """Computes all parts for a single cabinet box.

    Takes nominal cabinet dimensions and construction config, returns
    a list of Part objects with exact blank sizes ready for cutting.
    """

    def __init__(
        self,
        cabinet_width: float,
        cabinet_height: float,
        cabinet_depth: float,
        door_count: int = 1,
        drawer_count: int = 0,
        config: Optional[ConstructionConfig] = None,
        cabinet_id: str = "",
        cabinet_type: str = "base",
    ):
        self.w = cabinet_width
        self.h = cabinet_height
        self.d = cabinet_depth
        self.door_count = door_count
        self.drawer_count = drawer_count
        self.cfg = config or ConstructionConfig()
        self.cabinet_id = cabinet_id
        self.cabinet_type = cabinet_type
        self.parts: List[Part] = []

        self._compute()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _eb(self, finished_dim: float, banded_edge_count: int) -> float:
        """Deduct edge banding thickness from a finished dimension.

        For each banded edge on this axis, the blank must be cut smaller
        by the edge banding thickness so the finished size is correct.
        """
        return finished_dim - banded_edge_count * self.cfg.edge_banding_thickness

    def _box_interior_width(self) -> float:
        """Interior width between side panels."""
        return self.w - 2 * self.cfg.box_material_thickness

    def _box_height(self) -> float:
        """Usable box height (total height minus toe kick)."""
        return self.h - self.cfg.toe_kick_height

    def _is_tall(self) -> bool:
        """Tall cabinets are >= 60" (pantry, oven tower, utility)."""
        return self.h >= 60.0

    # ------------------------------------------------------------------
    # Computation entry point
    # ------------------------------------------------------------------

    def _compute(self) -> None:
        self._compute_frameless_parts()
        if self.cfg.construction_type == "face_frame":
            self._compute_face_frame_parts()

    # ------------------------------------------------------------------
    # Frameless (European) parts
    # ------------------------------------------------------------------

    def _compute_frameless_parts(self) -> None:
        c = self.cfg
        interior_w = self._box_interior_width()
        box_h = self._box_height()

        # --- Side panels (left & right) ---
        side_finished_h = box_h
        side_finished_d = self.d
        # Edge band the front long edge (L1)
        side_blank_h = side_finished_h  # no banding on height edges
        side_blank_d = self._eb(side_finished_d, 1)  # L1 banded

        for label in ("Left Side", "Right Side"):
            self.parts.append(Part(
                name=label,
                blank_width=side_blank_d,
                blank_length=side_blank_h,
                material="3/4 plywood",
                thickness=c.box_material_thickness,
                edge_banding={"L1": True, "L2": False, "W1": False, "W2": False},
                grain_direction="length",
                quantity=1,
                notes="Dado for back panel on inside face",
            ))

        # --- Bottom panel ---
        bottom_finished_w = interior_w
        bottom_finished_d = self.d - c.back_panel_thickness
        # Edge band front short edge (W1)
        bottom_blank_w = bottom_finished_w  # no banding on width edges
        bottom_blank_d = self._eb(bottom_finished_d, 1)  # W1 banded

        self.parts.append(Part(
            name="Bottom Panel",
            blank_width=bottom_blank_w,
            blank_length=bottom_blank_d,
            material="3/4 plywood",
            thickness=c.box_material_thickness,
            edge_banding={"L1": False, "L2": False, "W1": True, "W2": False},
            grain_direction="width",
            quantity=1,
        ))

        # --- Back panel ---
        back_w = interior_w + 2 * c.back_panel_dado_depth
        back_h = box_h - c.box_material_thickness  # sits above bottom panel

        self.parts.append(Part(
            name="Back Panel",
            blank_width=back_w,
            blank_length=back_h,
            material="1/4 plywood",
            thickness=c.back_panel_thickness,
            edge_banding={"L1": False, "L2": False, "W1": False, "W2": False},
            grain_direction="length",
            quantity=1,
            notes="Slides into dado grooves in side panels",
        ))

        # --- Top stretcher (nailer) ---
        stretcher_w = interior_w
        stretcher_d = c.top_stretcher_depth

        self.parts.append(Part(
            name="Top Stretcher",
            blank_width=stretcher_w,
            blank_length=stretcher_d,
            material="3/4 plywood",
            thickness=c.box_material_thickness,
            edge_banding={"L1": False, "L2": False, "W1": False, "W2": False},
            grain_direction="width",
            quantity=1,
            notes="Nailer strip at top of cabinet",
        ))

        # --- Adjustable shelf(s) ---
        shelf_finished_w = interior_w - 2 * c.shelf_clearance_per_side
        shelf_finished_d = self.d - c.shelf_nose_clearance
        # Edge band front short edge (W1)
        shelf_blank_w = shelf_finished_w  # no banding on width edges
        shelf_blank_d = self._eb(shelf_finished_d, 1)  # W1 banded
        shelf_qty = 2 if self._is_tall() else 1

        self.parts.append(Part(
            name="Adjustable Shelf",
            blank_width=shelf_blank_w,
            blank_length=shelf_blank_d,
            material="3/4 plywood",
            thickness=c.box_material_thickness,
            edge_banding={"L1": False, "L2": False, "W1": True, "W2": False},
            grain_direction="width",
            quantity=shelf_qty,
        ))

        # --- Toe kick board ---
        tk_w = interior_w
        tk_h = c.toe_kick_height

        self.parts.append(Part(
            name="Toe Kick Board",
            blank_width=tk_w,
            blank_length=tk_h,
            material="3/4 plywood",
            thickness=c.box_material_thickness,
            edge_banding={"L1": False, "L2": False, "W1": False, "W2": False},
            grain_direction="width",
            quantity=1,
        ))

    # ------------------------------------------------------------------
    # Face frame parts (added on top of frameless box)
    # ------------------------------------------------------------------

    def _compute_face_frame_parts(self) -> None:
        c = self.cfg
        box_h = self._box_height()
        stile_w = c.face_frame_stile_width
        rail_w = c.face_frame_rail_width

        # Stiles (full height of box)
        stile_length = box_h
        for label in ("Left Stile", "Right Stile"):
            self.parts.append(Part(
                name=label,
                blank_width=stile_w,
                blank_length=stile_length,
                material="hardwood",
                thickness=c.box_material_thickness,
                edge_banding={},
                grain_direction="length",
                quantity=1,
            ))

        # Rails (span between stiles)
        rail_length = self.w - 2 * stile_w
        for label in ("Top Rail", "Bottom Rail"):
            self.parts.append(Part(
                name=label,
                blank_width=rail_w,
                blank_length=rail_length,
                material="hardwood",
                thickness=c.box_material_thickness,
                edge_banding={},
                grain_direction="length",
                quantity=1,
            ))

        # Center stile (if 2+ doors)
        if self.door_count >= 2:
            opening_height = box_h - 2 * rail_w
            self.parts.append(Part(
                name="Center Stile",
                blank_width=stile_w,
                blank_length=opening_height,
                material="hardwood",
                thickness=c.box_material_thickness,
                edge_banding={},
                grain_direction="length",
                quantity=1,
            ))


# ===== CUT LIST / BOM GENERATION =====

def generate_cut_list(
    cabinets: List[dict],
    config: Optional[ConstructionConfig] = None,
) -> dict:
    """Generate a complete Bill of Materials from solved cabinet data.

    Args:
        cabinets: List of dicts, each with at minimum:
            - cabinet_id (str)
            - width (float, inches)
            - height (float, inches)
            - depth (float, inches)
            - door_count (int, optional, default 1)
            - drawer_count (int, optional, default 0)
            - cabinet_type (str, optional, default "base")
        config: Construction parameters. Uses frameless defaults if None.

    Returns:
        dict with keys:
            - cabinets: list of per-cabinet part breakdowns
            - all_parts: flat list of every Part
            - summary: material totals by type
    """
    cfg = config or ConstructionConfig()
    all_cabinets = []
    all_parts: List[Part] = []

    for cab in cabinets:
        cab_id = cab.get("cabinet_id", cab.get("section_id", "unknown"))
        cp = CabinetParts(
            cabinet_width=cab["width"],
            cabinet_height=cab.get("height", 34.5),
            cabinet_depth=cab.get("depth", 24.0),
            door_count=cab.get("door_count", 1),
            drawer_count=cab.get("drawer_count", 0),
            config=cfg,
            cabinet_id=cab_id,
            cabinet_type=cab.get("cabinet_type", "base"),
        )

        cabinet_entry = {
            "cabinet_id": cab_id,
            "nominal": {
                "width": cab["width"],
                "height": cab.get("height", 34.5),
                "depth": cab.get("depth", 24.0),
            },
            "parts": cp.parts,
            "part_count": sum(p.quantity for p in cp.parts),
            "total_area_sqft": sum(p.total_area_sqft for p in cp.parts),
        }
        all_cabinets.append(cabinet_entry)
        all_parts.extend(cp.parts)

    # Summarize by material
    material_totals: Dict[str, float] = {}
    for part in all_parts:
        key = f"{part.material} ({part.thickness}\")"
        material_totals[key] = material_totals.get(key, 0.0) + part.total_area_sqft

    return {
        "cabinets": all_cabinets,
        "all_parts": all_parts,
        "summary": {
            "total_cabinets": len(cabinets),
            "total_parts": sum(p.quantity for p in all_parts),
            "material_sqft": material_totals,
            "construction_type": cfg.construction_type,
        },
    }


# ===== MAIN =====

if __name__ == "__main__":
    # Sample: 3-cabinet run — base 24", base 36", tall pantry 24"x84"
    sample_cabinets = [
        {"cabinet_id": "base_1", "width": 24, "height": 34.5, "depth": 24, "door_count": 1, "cabinet_type": "base"},
        {"cabinet_id": "base_2", "width": 36, "height": 34.5, "depth": 24, "door_count": 2, "cabinet_type": "base"},
        {"cabinet_id": "tall_1", "width": 24, "height": 84, "depth": 24, "door_count": 2, "cabinet_type": "tall"},
    ]

    print("=" * 70)
    print("FRAMELESS CUT LIST")
    print("=" * 70)
    result = generate_cut_list(sample_cabinets)
    for cab in result["cabinets"]:
        print(f"\n--- {cab['cabinet_id']} ({cab['nominal']['width']}W x {cab['nominal']['height']}H x {cab['nominal']['depth']}D) ---")
        for part in cab["parts"]:
            eb_edges = [k for k, v in part.edge_banding.items() if v]
            eb_str = f"  EB: {','.join(eb_edges)}" if eb_edges else ""
            print(f"  {part.quantity}x {part.name:<20s}  {part.blank_width:.4f}\" x {part.blank_length:.4f}\"  [{part.material}]{eb_str}")
    print(f"\n--- SUMMARY ---")
    print(f"  Total cabinets: {result['summary']['total_cabinets']}")
    print(f"  Total parts:    {result['summary']['total_parts']}")
    for mat, sqft in result["summary"]["material_sqft"].items():
        print(f"  {mat}: {sqft:.2f} sqft")

    print("\n" + "=" * 70)
    print("FACE FRAME CUT LIST")
    print("=" * 70)
    ff_config = ConstructionConfig(construction_type="face_frame")
    result_ff = generate_cut_list(sample_cabinets, config=ff_config)
    for cab in result_ff["cabinets"]:
        print(f"\n--- {cab['cabinet_id']} ---")
        for part in cab["parts"]:
            eb_edges = [k for k, v in part.edge_banding.items() if v]
            eb_str = f"  EB: {','.join(eb_edges)}" if eb_edges else ""
            print(f"  {part.quantity}x {part.name:<20s}  {part.blank_width:.4f}\" x {part.blank_length:.4f}\"  [{part.material}]{eb_str}")
