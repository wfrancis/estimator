/**
 * Pure reducer for cabinet spec state.
 * Deep-clones state on every action to guarantee immutability.
 */

function clone(obj) {
  return typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
}

function getLayoutKey(row) {
  if (row === "base") return "base_layout";
  if (row === "wall") return "wall_layout";
  return null;
}

function findCabinetIndex(spec, id) {
  return spec.cabinets.findIndex((c) => c.id === id);
}

function findRefIndex(layout, id) {
  return layout.findIndex((item) => item.ref === id);
}

function rowForCabinet(spec, id) {
  if (spec.base_layout.some((item) => item.ref === id)) return "base";
  if (spec.wall_layout.some((item) => item.ref === id)) return "wall";
  return null;
}

export default function specReducer(state, action) {
  const spec = clone(state);

  switch (action.type) {
    // ── Cabinet operations ──────────────────────────────────────────

    case "ADD_CABINET": {
      const layoutKey = getLayoutKey(action.row);
      if (!layoutKey) return spec;
      spec.cabinets.push(action.cabinet);
      const pos = Math.min(action.position, spec[layoutKey].length);
      spec[layoutKey].splice(pos, 0, { ref: action.cabinet.id });
      return spec;
    }

    case "DELETE_CABINET": {
      const cabIdx = findCabinetIndex(spec, action.id);
      if (cabIdx !== -1) spec.cabinets.splice(cabIdx, 1);

      for (const key of ["base_layout", "wall_layout"]) {
        const refIdx = findRefIndex(spec[key], action.id);
        if (refIdx !== -1) spec[key].splice(refIdx, 1);
      }

      spec.alignment = spec.alignment.filter(
        (a) => a.wall !== action.id && a.base !== action.id
      );
      return spec;
    }

    case "MOVE_CABINET": {
      const row = rowForCabinet(spec, action.id);
      if (!row) return spec;
      const layoutKey = getLayoutKey(row);
      const layout = spec[layoutKey];
      const idx = findRefIndex(layout, action.id);
      if (idx === -1) return spec;

      const swapIdx = action.direction === "left" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= layout.length) return spec;

      [layout[idx], layout[swapIdx]] = [layout[swapIdx], layout[idx]];
      return spec;
    }

    case "REORDER_CABINET": {
      const row = rowForCabinet(spec, action.id);
      if (!row) return spec;
      const layoutKey = getLayoutKey(row);
      const layout = spec[layoutKey];
      const fromIdx = findRefIndex(layout, action.id);
      if (fromIdx === -1) return spec;
      const toIdx = Math.max(0, Math.min(action.toIndex, layout.length - 1));
      if (fromIdx === toIdx) return spec;
      const [item] = layout.splice(fromIdx, 1);
      layout.splice(toIdx, 0, item);
      return spec;
    }

    case "SET_DIMENSION": {
      const cab = spec.cabinets.find((c) => c.id === action.id);
      if (cab && (action.field === "width" || action.field === "height" || action.field === "depth")) {
        cab[action.field] = action.value;
      }
      return spec;
    }

    case "CHANGE_TYPE": {
      const cab = spec.cabinets.find((c) => c.id === action.id);
      if (cab) cab.type = action.newType;
      return spec;
    }

    case "DUPLICATE_CABINET": {
      const srcIdx = findCabinetIndex(spec, action.id);
      if (srcIdx === -1) return spec;

      const dup = clone(spec.cabinets[srcIdx]);
      dup.id = action.newId;
      spec.cabinets.push(dup);

      const row = rowForCabinet(spec, action.id);
      if (!row) return spec;
      const layoutKey = getLayoutKey(row);
      const refIdx = findRefIndex(spec[layoutKey], action.id);
      if (refIdx !== -1) {
        spec[layoutKey].splice(refIdx + 1, 0, { ref: action.newId });
      }
      return spec;
    }

    case "SPLIT_CABINET": {
      const srcIdx = findCabinetIndex(spec, action.id);
      if (srcIdx === -1) return spec;
      const original = spec.cabinets[srcIdx];

      const leftCab = clone(original);
      leftCab.id = action.leftId;
      leftCab.width = action.leftWidth;

      const rightCab = clone(original);
      rightCab.id = action.rightId;
      rightCab.width = action.rightWidth;

      // Remove original from cabinets
      spec.cabinets.splice(srcIdx, 1);

      // Add the two new cabinets
      spec.cabinets.push(leftCab, rightCab);

      // Replace ref in layout
      const row = rowForCabinet(state, action.id); // use original state since we already removed from spec
      if (!row) {
        // Fallback: check both layouts in spec clone before splice
        for (const key of ["base_layout", "wall_layout"]) {
          const refIdx = findRefIndex(spec[key], action.id);
          if (refIdx !== -1) {
            spec[key].splice(refIdx, 1, { ref: action.leftId }, { ref: action.rightId });
            break;
          }
        }
      } else {
        const layoutKey = getLayoutKey(row);
        const refIdx = findRefIndex(spec[layoutKey], action.id);
        if (refIdx !== -1) {
          spec[layoutKey].splice(refIdx, 1, { ref: action.leftId }, { ref: action.rightId });
        }
      }

      // Update alignments that referenced the original
      spec.alignment = spec.alignment.map((a) => {
        if (a.wall === action.id) return { ...a, wall: action.leftId };
        if (a.base === action.id) return { ...a, base: action.leftId };
        return a;
      });
      return spec;
    }

    // ── Face operations ─────────────────────────────────────────────

    case "ADD_SECTION": {
      const cab = spec.cabinets.find((c) => c.id === action.cabId);
      if (!cab) return spec;
      if (!cab.face) cab.face = { sections: [] };
      if (!cab.face.sections) cab.face.sections = [];
      cab.face.sections.push(action.section);
      return spec;
    }

    case "REMOVE_SECTION": {
      const cab = spec.cabinets.find((c) => c.id === action.cabId);
      if (!cab?.face?.sections) return spec;
      if (action.sectionIndex >= 0 && action.sectionIndex < cab.face.sections.length) {
        cab.face.sections.splice(action.sectionIndex, 1);
      }
      return spec;
    }

    case "UPDATE_SECTION": {
      const cab = spec.cabinets.find((c) => c.id === action.cabId);
      if (!cab?.face?.sections) return spec;
      const section = cab.face.sections[action.sectionIndex];
      if (section) {
        Object.assign(section, action.updates);
      }
      return spec;
    }

    // ── Gap operations ──────────────────────────────────────────────

    case "ADD_GAP": {
      const layoutKey = getLayoutKey(action.row);
      if (!layoutKey) return spec;
      const pos = Math.min(action.position, spec[layoutKey].length);
      spec[layoutKey].splice(pos, 0, action.gap);
      return spec;
    }

    case "DELETE_GAP": {
      const layoutKey = getLayoutKey(action.row);
      if (!layoutKey) return spec;
      const item = spec[layoutKey][action.position];
      // Only delete if it's a gap (not a ref)
      if (item && !item.ref) {
        spec[layoutKey].splice(action.position, 1);
      }
      return spec;
    }

    case "UPDATE_GAP": {
      const layoutKey = getLayoutKey(action.row);
      if (!layoutKey) return spec;
      const item = spec[layoutKey][action.position];
      if (item && !item.ref) {
        Object.assign(item, action.updates);
      }
      return spec;
    }

    // ── Alignment ───────────────────────────────────────────────────

    case "SET_ALIGNMENT": {
      const existing = spec.alignment.findIndex((a) => a.wall === action.wall);
      if (existing !== -1) {
        spec.alignment[existing].base = action.base;
      } else {
        spec.alignment.push({ wall: action.wall, base: action.base });
      }
      return spec;
    }

    case "REMOVE_ALIGNMENT": {
      spec.alignment = spec.alignment.filter((a) => a.wall !== action.wall);
      return spec;
    }

    // ── Meta ────────────────────────────────────────────────────────

    case "LOAD_SPEC": {
      return clone(action.spec);
    }

    default:
      return spec;
  }
}
