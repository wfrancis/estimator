import { useState } from "react";
import CabinetCard from "./CabinetCard";
import GapCard from "./GapCard";
import {
  STANDARD_WIDTHS,
  BASE_TYPES,
  WALL_TYPES,
  defaultCabinet,
  defaultGap,
  generateId,
  totalRun,
} from "../state/specHelpers";

const ROW_COLORS = { base: "#D94420", wall: "#1a6fbf" };

const btnStyle = {
  background: "#1a1a2a",
  border: "1px solid #2a2a3a",
  color: "#999",
  padding: "4px 10px",
  borderRadius: 5,
  fontSize: 10,
  cursor: "pointer",
  fontFamily: "'JetBrains Mono',monospace",
  fontWeight: 600,
};

const insertBtnStyle = {
  background: "none",
  border: "1px dashed #2a2a3a",
  color: "#444",
  width: "100%",
  padding: "1px 0",
  borderRadius: 4,
  fontSize: 10,
  cursor: "pointer",
  fontFamily: "'JetBrains Mono',monospace",
  margin: "2px 0",
  opacity: 0,
  transition: "opacity 0.15s",
};

function AddCabinetForm({ row, spec, dispatch, position, onDone }) {
  const types = row === "wall" ? WALL_TYPES : BASE_TYPES;
  const [type, setType] = useState(types[0]);
  const [width, setWidth] = useState(18);

  const handleAdd = () => {
    const cab = defaultCabinet(row, type);
    cab.id = generateId(row, spec);
    cab.width = width;
    dispatch({ type: "ADD_CABINET", row, cabinet: cab, position });
    onDone();
  };

  return (
    <div
      style={{
        background: "#0c0c14",
        border: "1px solid #2a2a3a",
        borderRadius: 6,
        padding: "6px 8px",
        marginBottom: 4,
        display: "flex",
        gap: 6,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        style={{
          background: "#14141e",
          border: "1px solid #2a2a3a",
          color: "#e0e0e0",
          borderRadius: 4,
          padding: "3px 4px",
          fontSize: 10,
          fontFamily: "'JetBrains Mono',monospace",
          cursor: "pointer",
          appearance: "auto",
        }}
      >
        {types.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select
        value={STANDARD_WIDTHS.includes(width) ? width : "custom"}
        onChange={(e) => {
          const v = e.target.value;
          if (v !== "custom") setWidth(parseInt(v, 10));
        }}
        style={{
          background: "#14141e",
          border: "1px solid #2a2a3a",
          color: "#e0e0e0",
          borderRadius: 4,
          padding: "3px 4px",
          fontSize: 10,
          fontFamily: "'JetBrains Mono',monospace",
          cursor: "pointer",
          appearance: "auto",
          width: 56,
        }}
      >
        {STANDARD_WIDTHS.map((w) => (
          <option key={w} value={w}>
            {w}"
          </option>
        ))}
      </select>

      <button
        onClick={handleAdd}
        style={{
          ...btnStyle,
          background: ROW_COLORS[row],
          color: "#fff",
          border: "none",
        }}
      >
        Add
      </button>
      <button onClick={onDone} style={{ ...btnStyle, background: "none", border: "none" }}>
        Cancel
      </button>
    </div>
  );
}

function AddGapForm({ row, dispatch, position, onDone }) {
  const gap = defaultGap();

  const handleAdd = () => {
    dispatch({ type: "ADD_GAP", row, gap, position });
    onDone();
  };

  return (
    <div
      style={{
        background: "#0c0c14",
        border: "1px solid #2a2a3a",
        borderRadius: 6,
        padding: "6px 8px",
        marginBottom: 4,
        display: "flex",
        gap: 6,
        alignItems: "center",
      }}
    >
      <span style={{ color: "#e07020", fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>
        Opening 30"
      </span>
      <button
        onClick={handleAdd}
        style={{
          ...btnStyle,
          background: "#e07020",
          color: "#fff",
          border: "none",
        }}
      >
        Add
      </button>
      <button onClick={onDone} style={{ ...btnStyle, background: "none", border: "none" }}>
        Cancel
      </button>
    </div>
  );
}

export default function RowEditor({ row, spec, dispatch }) {
  const color = ROW_COLORS[row];
  const layoutKey = row === "base" ? "base_layout" : "wall_layout";
  const layout = spec[layoutKey] || [];
  const cabMap = {};
  spec.cabinets.forEach((c) => {
    cabMap[c.id] = c;
  });

  // Track which insert position is showing an add form
  const [addingAt, setAddingAt] = useState(null); // { position, kind: "cabinet"|"gap" }
  const [showAddBottom, setShowAddBottom] = useState(null); // "cabinet"|"gap"|null
  const [hoverInsert, setHoverInsert] = useState(-1);

  const run = totalRun(spec, row);

  // Determine first/last cabinet indices for move button disabling
  const layoutIndices = layout.map((item, i) => ({ item, i }));

  const clearAdd = () => {
    setAddingAt(null);
    setShowAddBottom(null);
  };

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Row header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
          padding: "0 2px",
        }}
      >
        <span
          style={{
            color,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: "0.08em",
            fontFamily: "'JetBrains Mono',monospace",
          }}
        >
          {row.toUpperCase()}
        </span>
        <span
          style={{
            color: "#444",
            fontSize: 10,
            fontFamily: "'JetBrains Mono',monospace",
          }}
        >
          {run}"
        </span>
      </div>

      {/* Items */}
      {layout.map((item, idx) => {
        const isRef = !!item.ref;
        const cab = isRef ? cabMap[item.ref] : null;

        // For cabinet move disabling: is this the first/last in the layout?
        const isFirst = idx === 0;
        const isLast = idx === layout.length - 1;

        return (
          <div key={isRef ? item.ref : `gap-${idx}`}>
            {/* Insert button before this item */}
            <div
              onMouseEnter={() => setHoverInsert(idx)}
              onMouseLeave={() => setHoverInsert(-1)}
              style={{ height: addingAt?.position === idx ? "auto" : 14, position: "relative" }}
            >
              {addingAt?.position === idx ? (
                addingAt.kind === "cabinet" ? (
                  <AddCabinetForm
                    row={row}
                    spec={spec}
                    dispatch={dispatch}
                    position={idx}
                    onDone={clearAdd}
                  />
                ) : (
                  <AddGapForm
                    row={row}
                    dispatch={dispatch}
                    position={idx}
                    onDone={clearAdd}
                  />
                )
              ) : (
                <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                  <button
                    onClick={() => setAddingAt({ position: idx, kind: "cabinet" })}
                    style={{
                      ...insertBtnStyle,
                      opacity: hoverInsert === idx ? 0.7 : 0,
                      width: "auto",
                      padding: "0 8px",
                      flex: 1,
                    }}
                  >
                    + cab
                  </button>
                  <button
                    onClick={() => setAddingAt({ position: idx, kind: "gap" })}
                    style={{
                      ...insertBtnStyle,
                      opacity: hoverInsert === idx ? 0.7 : 0,
                      width: "auto",
                      padding: "0 8px",
                      flex: 1,
                    }}
                  >
                    + gap
                  </button>
                </div>
              )}
            </div>

            {/* The actual card */}
            {isRef && cab ? (
              <CabinetCard
                cab={cab}
                color={color}
                dispatch={dispatch}
                isFirst={isFirst}
                isLast={isLast}
              />
            ) : !isRef ? (
              <GapCard item={item} row={row} position={idx} dispatch={dispatch} />
            ) : null}
          </div>
        );
      })}

      {/* Add forms at bottom */}
      {showAddBottom === "cabinet" && (
        <AddCabinetForm
          row={row}
          spec={spec}
          dispatch={dispatch}
          position={layout.length}
          onDone={clearAdd}
        />
      )}
      {showAddBottom === "gap" && (
        <AddGapForm
          row={row}
          dispatch={dispatch}
          position={layout.length}
          onDone={clearAdd}
        />
      )}

      {/* Bottom action buttons */}
      {!showAddBottom && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button
            onClick={() => {
              setAddingAt(null);
              setShowAddBottom("cabinet");
            }}
            style={btnStyle}
          >
            + Add Cabinet
          </button>
          <button
            onClick={() => {
              setAddingAt(null);
              setShowAddBottom("gap");
            }}
            style={btnStyle}
          >
            + Add Opening
          </button>
        </div>
      )}
    </div>
  );
}
