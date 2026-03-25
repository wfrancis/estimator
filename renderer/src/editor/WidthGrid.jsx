import { useState } from "react";
import { STANDARD_WIDTHS } from "../state/specHelpers";

export default function WidthGrid({ currentWidth, rowColor, onWidthChange }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");

  const btnStyle = (w) => ({
    minWidth: 48, minHeight: 44, borderRadius: 8,
    background: w === currentWidth ? rowColor : "#1a1a2a",
    border: w === currentWidth ? `2px solid ${rowColor}` : "1px solid #2a2a3a",
    color: "#fff",
    fontWeight: w === currentWidth ? 700 : 400,
    fontSize: 14,
    fontFamily: "'JetBrains Mono',monospace",
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center"
  });

  return (
    <div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6
      }}>
        {STANDARD_WIDTHS.map(w => (
          <button key={w} onClick={() => onWidthChange(w)} style={btnStyle(w)}>
            {w}"
          </button>
        ))}
      </div>
      <div style={{ marginTop: 6 }}>
        {!showCustom ? (
          <button onClick={() => { setShowCustom(true); setCustomVal(String(currentWidth)); }} style={{
            width: "100%", minHeight: 44, borderRadius: 8,
            background: !STANDARD_WIDTHS.includes(currentWidth) ? rowColor : "#14141e",
            border: "1px solid #2a2a3a", color: "#ccc",
            fontSize: 12, fontFamily: "'DM Sans',sans-serif",
            cursor: "pointer", fontWeight: !STANDARD_WIDTHS.includes(currentWidth) ? 700 : 400
          }}>
            Custom{!STANDARD_WIDTHS.includes(currentWidth) ? ` (${currentWidth}")` : ""}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="number"
              autoFocus
              value={customVal}
              onChange={e => setCustomVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const v = parseFloat(customVal);
                  if (!isNaN(v) && v > 0) { onWidthChange(v); setShowCustom(false); }
                }
              }}
              style={{
                flex: 1, minHeight: 44, background: "#14141e",
                border: `2px solid ${rowColor}`, borderRadius: 8,
                color: "#fff", fontSize: 16, textAlign: "center",
                fontFamily: "'JetBrains Mono',monospace", padding: "0 8px"
              }}
            />
            <button onClick={() => {
              const v = parseFloat(customVal);
              if (!isNaN(v) && v > 0) { onWidthChange(v); setShowCustom(false); }
            }} style={{
              minWidth: 60, minHeight: 44, borderRadius: 8,
              background: rowColor, border: "none", color: "#fff",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif"
            }}>Set</button>
            <button onClick={() => setShowCustom(false)} style={{
              minWidth: 44, minHeight: 44, borderRadius: 8,
              background: "#1a1a2a", border: "1px solid #2a2a3a", color: "#888",
              fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif"
            }}>X</button>
          </div>
        )}
      </div>
    </div>
  );
}
