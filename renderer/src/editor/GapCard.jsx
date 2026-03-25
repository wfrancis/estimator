import { useState } from "react";

const GAP_LABELS = ["Range", "Fridge", "DW", "Opening", "Custom"];

const inputStyle = {
  background: "#14141e",
  border: "1px solid #2a2a3a",
  color: "#e0e0e0",
  borderRadius: 4,
  padding: "3px 5px",
  fontSize: 11,
  fontFamily: "'JetBrains Mono',monospace",
  textAlign: "center",
};

export default function GapCard({ item, row, position, dispatch }) {
  const [customLabel, setCustomLabel] = useState("");

  const currentLabel = item.label || "Opening";
  const isCustom = !GAP_LABELS.slice(0, -1).includes(currentLabel);

  const handleLabelChange = (e) => {
    const v = e.target.value;
    if (v === "Custom") {
      setCustomLabel(currentLabel === "Custom" ? "" : currentLabel);
      dispatch({
        type: "UPDATE_GAP",
        row,
        position,
        updates: { label: customLabel || "Custom" },
      });
      return;
    }
    dispatch({ type: "UPDATE_GAP", row, position, updates: { label: v } });
  };

  const handleCustomLabel = (e) => {
    const v = e.target.value;
    setCustomLabel(v);
    dispatch({ type: "UPDATE_GAP", row, position, updates: { label: v } });
  };

  const handleWidth = (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v > 0) {
      dispatch({ type: "UPDATE_GAP", row, position, updates: { width: v } });
    }
  };

  const handleDelete = () => {
    dispatch({ type: "DELETE_GAP", row, position });
  };

  return (
    <div
      style={{
        background: "#0c0c14",
        borderRadius: 8,
        padding: "8px 10px",
        marginBottom: 4,
        border: "1px solid #1a1a2a",
        borderLeft: "3px solid #e07020",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <select
          value={isCustom ? "Custom" : currentLabel}
          onChange={handleLabelChange}
          style={{ ...inputStyle, width: 90, cursor: "pointer", appearance: "auto" }}
        >
          {GAP_LABELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        {isCustom && (
          <input
            type="text"
            value={customLabel || currentLabel}
            onChange={handleCustomLabel}
            placeholder="Label"
            style={{ ...inputStyle, width: 80 }}
          />
        )}

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            color: "#666",
            fontSize: 10,
            fontFamily: "'JetBrains Mono',monospace",
          }}
        >
          W
          <input
            type="number"
            value={item.width}
            onChange={handleWidth}
            step="1"
            min="1"
            style={{ ...inputStyle, width: 48 }}
          />
          "
        </label>

        <button
          onClick={handleDelete}
          title="Delete opening"
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            color: "#e04040",
            fontSize: 14,
            cursor: "pointer",
            padding: "2px 6px",
            borderRadius: 4,
            lineHeight: 1,
          }}
        >
          X
        </button>
      </div>
    </div>
  );
}
