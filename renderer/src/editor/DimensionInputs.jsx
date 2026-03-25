import { useState } from "react";
import { STANDARD_WIDTHS, WALL_HEIGHTS, BASE_HEIGHT, BASE_DEPTH, WALL_DEPTH } from "../state/specHelpers";

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

const selectStyle = {
  ...inputStyle,
  width: 64,
  cursor: "pointer",
  appearance: "auto",
};

const customInputStyle = {
  ...inputStyle,
  width: 48,
};

const labelStyle = {
  color: "#666",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.05em",
  fontFamily: "'JetBrains Mono',monospace",
};

function DimensionSelect({ label, value, presets, dispatch, cabId, field }) {
  const isStandard = presets.includes(value);
  const [custom, setCustom] = useState(!isStandard);

  const handleSelect = (e) => {
    const v = e.target.value;
    if (v === "custom") {
      setCustom(true);
      return;
    }
    setCustom(false);
    dispatch({ type: "SET_DIMENSION", id: cabId, field, value: parseFloat(v) });
  };

  const handleCustom = (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v > 0) {
      dispatch({ type: "SET_DIMENSION", id: cabId, field, value: v });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        <select
          value={custom ? "custom" : value}
          onChange={handleSelect}
          style={selectStyle}
        >
          {presets.map((p) => (
            <option key={p} value={p}>
              {p}"
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
        {custom && (
          <input
            type="number"
            value={value}
            onChange={handleCustom}
            step="0.5"
            min="1"
            style={customInputStyle}
          />
        )}
      </div>
    </div>
  );
}

export default function DimensionInputs({ cab, dispatch }) {
  const isWall = cab.row === "wall";

  const heightPresets = isWall ? WALL_HEIGHTS : [BASE_HEIGHT];
  const depthPresets = isWall ? [WALL_DEPTH] : [BASE_DEPTH];

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "4px 0" }}>
      <DimensionSelect
        label="WIDTH"
        value={cab.width}
        presets={STANDARD_WIDTHS}
        dispatch={dispatch}
        cabId={cab.id}
        field="width"
      />
      <DimensionSelect
        label="HEIGHT"
        value={cab.height}
        presets={heightPresets}
        dispatch={dispatch}
        cabId={cab.id}
        field="height"
      />
      <DimensionSelect
        label="DEPTH"
        value={cab.depth}
        presets={depthPresets}
        dispatch={dispatch}
        cabId={cab.id}
        field="depth"
      />
    </div>
  );
}
