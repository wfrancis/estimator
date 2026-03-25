export default function IdStrip({ spec, selectedId, onSelect, onInsert }) {
  if (!spec) return null;

  const cabMap = {};
  spec.cabinets.forEach(c => { cabMap[c.id] = c; });

  const renderRow = (label, layoutKey, row, color) => {
    const layout = spec[layoutKey] || [];
    if (!layout.length) return null;

    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, color, letterSpacing: "0.1em",
          fontFamily: "'JetBrains Mono',monospace", marginBottom: 4, paddingLeft: 4
        }}>{label}</div>
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          overflowX: "auto", WebkitOverflowScrolling: "touch",
          paddingBottom: 4, paddingLeft: 4, paddingRight: 4
        }}>
          {/* Insert button at start */}
          <button onClick={() => onInsert(row, 0)} style={{
            minWidth: 24, height: 44, background: "transparent",
            border: "1.5px dashed #333", borderRadius: 6, color: "#555",
            fontSize: 16, cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'DM Sans',sans-serif"
          }}>+</button>

          {layout.map((item, idx) => {
            const isRef = !!item.ref;
            const id = item.ref || item.id;
            const cab = isRef ? cabMap[id] : null;
            const isSelected = selectedId === id;

            return (
              <div key={`${id}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {isRef && cab ? (
                  <button onClick={() => onSelect(id)} style={{
                    minWidth: 48, height: 44, borderRadius: 8,
                    background: color,
                    border: isSelected ? "2.5px solid #fff" : "2.5px solid transparent",
                    boxShadow: isSelected ? `0 0 0 2px ${color}` : "none",
                    color: "#fff", fontWeight: 700, fontSize: 13,
                    fontFamily: "'JetBrains Mono',monospace",
                    cursor: "pointer", flexShrink: 0,
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", padding: "2px 8px", lineHeight: 1.2
                  }}>
                    <span>{id}</span>
                    <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.8 }}>{cab.width}"</span>
                  </button>
                ) : (
                  <div style={{
                    minWidth: 48, height: 44, borderRadius: 8,
                    background: "#2a2a3a", color: "#888",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", padding: "2px 8px",
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 10, flexShrink: 0, lineHeight: 1.2
                  }}>
                    <span>{(item.label || item.id || "GAP").substring(0, 5).toUpperCase()}</span>
                    <span style={{ fontSize: 9, opacity: 0.7 }}>{item.width || "?"}"</span>
                  </div>
                )}

                {/* Insert button after each item */}
                <button onClick={() => onInsert(row, idx + 1)} style={{
                  minWidth: 24, height: 44, background: "transparent",
                  border: "1.5px dashed #333", borderRadius: 6, color: "#555",
                  fontSize: 16, cursor: "pointer", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'DM Sans',sans-serif"
                }}>+</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: "#0c0c14", borderTop: "1px solid #1a1a2a",
      padding: "8px 4px 4px"
    }}>
      {renderRow("WALL", "wall_layout", "wall", "#1a6fbf")}
      {renderRow("BASE", "base_layout", "base", "#D94420")}
    </div>
  );
}
