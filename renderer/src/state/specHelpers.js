export const STANDARD_WIDTHS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48];
export const WALL_HEIGHTS = [12, 15, 18, 24, 30, 36, 42];
export const BASE_HEIGHT = 34.5;
export const BASE_DEPTH = 24;
export const WALL_DEPTH = 12;

export const BASE_TYPES = [
  "base",
  "base_sink",
  "base_drawer_bank",
  "base_pullout",
  "base_spice",
];
export const WALL_TYPES = ["wall", "wall_bridge", "wall_stacker"];
export const TALL_TYPES = ["tall_pantry", "tall_oven"];
export const SECTION_TYPES = ["drawer", "door", "false_front", "glass_door", "open"];

const PREFIX = { base: "B", wall: "W", tall: "T" };

/**
 * Scan existing cabinet ids for the highest number with the row prefix,
 * then return the next available id (e.g. "B7").
 */
export function generateId(row, spec) {
  const prefix = PREFIX[row] || "C";
  let max = 0;
  for (const cab of spec.cabinets) {
    if (cab.id.startsWith(prefix)) {
      const num = parseInt(cab.id.slice(prefix.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return `${prefix}${max + 1}`;
}

/**
 * Return a cabinet template with standard dimensions and a single-door face.
 */
export function defaultCabinet(row, type) {
  const isWall = row === "wall";
  const isTall = row === "tall";

  const width = 18;
  const height = isTall ? 84 : isWall ? 30 : BASE_HEIGHT;
  const depth = isWall ? WALL_DEPTH : BASE_DEPTH;

  return {
    id: "", // caller must set
    type: type || (isWall ? "wall" : isTall ? "tall_pantry" : "base"),
    label: "",
    row,
    width,
    height,
    depth,
    face: {
      sections: [
        {
          type: "door",
          count: 1,
          hinge_side: "left",
        },
      ],
    },
  };
}

/**
 * Return a gap / opening object for insertion into a layout array.
 */
export function defaultGap(label = "Opening", width = 30) {
  return {
    type: "appliance",
    id: `opening_${Date.now()}`,
    label,
    width,
  };
}

/**
 * Sum all widths in a layout row (both cabinet refs and gaps).
 * Cabinet widths are looked up from spec.cabinets.
 */
export function totalRun(spec, row) {
  const layoutKey = row === "base" ? "base_layout" : "wall_layout";
  const layout = spec[layoutKey];
  if (!layout) return 0;

  let total = 0;
  for (const item of layout) {
    if (item.ref) {
      const cab = spec.cabinets.find((c) => c.id === item.ref);
      if (cab) total += cab.width;
    } else if (typeof item.width === "number") {
      total += item.width;
    }
  }
  return total;
}
