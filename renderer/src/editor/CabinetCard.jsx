import { useState } from "react";
import DimensionInputs from "./DimensionInputs";
import { BASE_TYPES, WALL_TYPES, TALL_TYPES } from "../state/specHelpers";

const btnStyle = {
  background: "#1a1a2a",
  border: "1px solid #2a2a3a",
  color: "#999",
  padding: "3px 8px",
  borderRadius: 4,
  fontSize: 10,
  cursor: "pointer",
  fontFamily: "'JetBrains Mono',monospace",
};

function sectionBadge(sec, i) {
  const colors = {
    drawer: { bg: "#f972161a", fg: "#f97216" },
    false_front: { bg: "#8b5cf61a", fg: "#8b5cf6" },
    glass_door: { bg: "#06b6d41a", fg: "#06b6d4" },
    open: { bg: "#a3a3a31a", fg: "#a3a3a3" },
  };
  const c = colors[sec.type] || { bg: "#22c55e1a", fg: "#22c55e" };
  return (
    <span
      key={i}
      style={{
        display: "inline-block",
        fontSize: 9,
        padding: "1px 5px",
        marginRight: 3,
        borderRadius: 3,
        fontFamily: "'JetBrains Mono',monospace",
        background: c.bg,
        color: c.fg,
      }}
    >
      {sec.type}
      {sec.count > 1 ? `x${sec.count}` : ""}
      {sec.height ? ` ${sec.height}"` : ""}
      {sec.hinge_side ? ` ${sec.hinge_side}` : ""}
    </span>
  );
}

export default function CabinetCard({ cab, color, dispatch, isFirst, isLast }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(cab.label || "");

  const typeOptions =
    cab.row === "wall" ? WALL_TYPES : cab.row === "tall" ? TALL_TYPES : BASE_TYPES;

  const handleTypeChange = (e) => {
    dispatch({ type: "CHANGE_TYPE", id: cab.id, newType: e.target.value });
  };

  const handleMove = (direction) => {
    dispatch({ type: "MOVE_CABINET", id: cab.id, direction });
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    dispatch({ type: "DELETE_CABINET", id: cab.id });
  };

  const commitLabel = () => {
    setEditingLabel(false);
    // Label is cosmetic — we dispatch SET_DIMENSION with a hack,
    // but the reducer doesn't handle "label". We need to use a
    // direct approach. For now, labels are read-only display.
    // A CHANGE_LABEL action would be needed in the reducer.
    // We'll leave the editing UI but note it's display-only until
    // the reducer is extended.
  };

  return (
    <div
      style={{
        background: "#0c0c14",
        borderRadius: 8,
        padding: "8px 10px",
        marginBottom: 4,
        border: "1px solid #1a1a2a",
        borderLeft: `3px solid ${color}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            color,
            fontWeight: 700,
            fontSize: 13,
            fontFamily: "'JetBrains Mono',monospace",
            minWidth: 28,
          }}
        >
          {cab.id}
        </span>

        <select
          value={cab.type}
          onChange={handleTypeChange}
          style={{
            background: "#14141e",
            border: "1px solid #2a2a3a",
            color: "#888",
            borderRadius: 4,
            padding: "2px 4px",
            fontSize: 10,
            fontFamily: "'JetBrains Mono',monospace",
            cursor: "pointer",
            appearance: "auto",
          }}
        >
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <span
          style={{
            flex: 1,
            textAlign: "right",
            fontSize: 9,
            color: "#444",
            fontFamily: "'JetBrains Mono',monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={cab.label}
        >
          {cab.label}
        </span>
      </div>

      {/* Dimensions */}
      <DimensionInputs cab={cab} dispatch={dispatch} />

      {/* Face sections */}
      {cab.face?.sections?.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {cab.face.sections.map(sectionBadge)}
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginTop: 6,
          alignItems: "center",
        }}
      >
        <button
          onClick={() => handleMove("left")}
          disabled={isFirst}
          style={{
            ...btnStyle,
            opacity: isFirst ? 0.3 : 1,
            cursor: isFirst ? "default" : "pointer",
          }}
        >
          &larr;
        </button>
        <button
          onClick={() => handleMove("right")}
          disabled={isLast}
          style={{
            ...btnStyle,
            opacity: isLast ? 0.3 : 1,
            cursor: isLast ? "default" : "pointer",
          }}
        >
          &rarr;
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleDelete}
          onBlur={() => setConfirmDelete(false)}
          style={{
            ...btnStyle,
            color: confirmDelete ? "#fff" : "#e04040",
            background: confirmDelete ? "#e04040" : "none",
            border: confirmDelete ? "1px solid #e04040" : "1px solid transparent",
            fontSize: confirmDelete ? 9 : 10,
          }}
        >
          {confirmDelete ? "Confirm?" : "Delete"}
        </button>
      </div>
    </div>
  );
}
