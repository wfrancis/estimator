import { useState, useRef, useEffect } from "react";
import { SECTION_TYPES, BASE_TYPES, WALL_TYPES, TALL_TYPES, STANDARD_WIDTHS, generateId, defaultCabinet } from "../state/specHelpers";

const MONO = "'JetBrains Mono',monospace";
const SANS = "'DM Sans',sans-serif";

const TYPE_MAP = { base: BASE_TYPES, wall: WALL_TYPES, tall: TALL_TYPES };

const SEC_LABELS = {
  drawer: "Drawer",
  door: "Door",
  false_front: "False Front",
  glass_door: "Glass Door",
  open: "Open",
};

const SEC_COLORS = {
  drawer: { bg: "#f972161a", fg: "#f97216" },
  door: { bg: "#22c55e1a", fg: "#22c55e" },
  false_front: { bg: "#8b5cf61a", fg: "#8b5cf6" },
  glass_door: { bg: "#3b82f61a", fg: "#3b82f6" },
  open: { bg: "#6b72801a", fg: "#6b7280" },
};

function sectionSummary(sec) {
  let s = SEC_LABELS[sec.type] || sec.type;
  if (sec.count > 1) s += ` x${sec.count}`;
  if (sec.height) s += ` ${sec.height}"`;
  if (sec.hinge_side) s += ` (${sec.hinge_side[0].toUpperCase()})`;
  return s;
}

export default function CabinetEditBar({ cab, spec, dispatch, selColor, widthInputRef, onSelectNext, onSelectId, onDelete, onAddGap, onAddCab, onMoveLeft, onMoveRight, onMoveUp, onMoveDown }) {
  const [editingSec, setEditingSec] = useState(null); // index of section being edited
  const [showSecPicker, setShowSecPicker] = useState(false);
  const sections = cab?.face?.sections || [];

  // Reset editing section when cabinet changes
  useEffect(() => { setEditingSec(null); }, [cab?.id]);

  if (!cab) return null;

  const types = TYPE_MAP[cab.row] || BASE_TYPES;

  const btnStyle = (active) => ({
    height: 28, padding: "0 8px", borderRadius: 4,
    background: active ? "#1a1a2a" : "transparent",
    border: active ? `1px solid ${selColor}` : "1px solid #2a2a3a",
    color: active ? selColor : "#555",
    fontWeight: 600, fontSize: 10, cursor: "pointer", fontFamily: MONO,
  });

  const inputStyle = (w, border) => ({
    width: w, height: 32, background: "#14141e",
    border: `1px solid ${border || "#2a2a3a"}`, borderRadius: 6,
    color: "#fff", fontSize: 14, textAlign: "center", fontFamily: MONO, fontWeight: 700,
  });

  const commitDim = (field, val, inputEl) => {
    let v = parseFloat(val);
    if (isNaN(v) || v <= 0) return;
    // Snap width to nearest standard size
    if (field === "width") {
      let best = STANDARD_WIDTHS[0], bestDist = Math.abs(v - best);
      for (const sw of STANDARD_WIDTHS) {
        const d = Math.abs(v - sw);
        if (d < bestDist) { best = sw; bestDist = d; }
      }
      v = best;
      if (inputEl) inputEl.value = v;
    }
    if (v !== cab[field]) {
      dispatch({ type: "SET_DIMENSION", id: cab.id, field, value: v });
    }
  };

  const editSec = editingSec !== null ? sections[editingSec] : null;

  return (
    <div style={{ flexShrink: 0, background: "#0c0c14", borderTop: "1px solid #1a1a2a" }}>
      {/* Row 1: Identity + Dimensions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid #111118" }}>
        <span style={{ color: selColor, fontWeight: 700, fontSize: 16, fontFamily: MONO }}>{cab.id}</span>
        <input
          key={cab.id + "-label"}
          type="text"
          defaultValue={cab.label || ""}
          placeholder="add label..."
          onBlur={e => { const v = e.target.value.trim(); if (v !== (cab.label || "")) dispatch({ type: "SET_LABEL", id: cab.id, label: v }); }}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { e.target.value = cab.label || ""; e.target.blur(); } }}
          style={{ width: 100, height: 24, background: "transparent", border: "1px solid transparent", borderRadius: 4, color: "#888", fontSize: 11, fontFamily: MONO, padding: "0 4px", cursor: "text" }}
          onFocus={e => { e.target.style.borderColor = "#2a2a3a"; e.target.style.background = "#14141e"; }}
          onMouseEnter={e => { if (document.activeElement !== e.target) e.target.style.borderColor = "#1a1a2a"; }}
          onMouseLeave={e => { if (document.activeElement !== e.target) e.target.style.borderColor = "transparent"; }}
        />

        {/* Type pills */}
        <div style={{ display: "flex", gap: 3 }}>
          {types.map(t => (
            <button key={t} style={btnStyle(cab.type === t)}
              onClick={() => dispatch({ type: "CHANGE_TYPE", id: cab.id, newType: t })}>
              {t.replace(/^(base|wall|tall)_?/, "").replace(/_/g, " ") || t.split("_")[0]}
            </button>
          ))}
        </div>

        <span style={{ width: 1, height: 20, background: "#1a1a2a", flexShrink: 0 }} />

        {/* Dimensions */}
        <input ref={widthInputRef} key={cab.id + "w"} type="number" defaultValue={cab.width}
          onFocus={e => e.target.select()}
          onKeyDown={e => { if (e.key === "Enter") { commitDim("width", e.target.value, e.target); e.target.blur(); } }}
          onBlur={e => commitDim("width", e.target.value, e.target)}
          style={{ ...inputStyle(56, selColor), border: `2px solid ${selColor}` }}
        />
        <span style={{ color: "#555", fontSize: 12, fontFamily: MONO }}>w</span>
        <input key={cab.id + "h"} type="number" defaultValue={cab.height}
          onFocus={e => e.target.select()}
          onKeyDown={e => { if (e.key === "Enter") { commitDim("height", e.target.value); e.target.blur(); } }}
          onBlur={e => commitDim("height", e.target.value)}
          style={{ ...inputStyle(48, selColor), border: `2px solid ${selColor}` }}
        />
        <span style={{ color: "#555", fontSize: 12, fontFamily: MONO }}>h</span>
        <input key={cab.id + "d"} type="number" defaultValue={cab.depth}
          onFocus={e => e.target.select()}
          onKeyDown={e => { if (e.key === "Enter") { commitDim("depth", e.target.value); e.target.blur(); } }}
          onBlur={e => commitDim("depth", e.target.value)}
          style={{ ...inputStyle(48, selColor), border: `2px solid ${selColor}` }}
        />
        <span style={{ color: "#555", fontSize: 12, fontFamily: MONO }}>d</span>

        <span style={{ flex: 1 }} />

        {onMoveLeft && <button onClick={onMoveLeft} title="Move left (Arrow Left)" style={{ height: 32, width: 32, padding: 0, borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2190"}</button>}
        {onMoveRight && <button onClick={onMoveRight} title="Move right (Arrow Right)" style={{ height: 32, width: 32, padding: 0, borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2192"}</button>}
        {onMoveUp && <button onClick={onMoveUp} title="Nudge up 3 inches (Arrow Up)" style={{ height: 32, width: 32, padding: 0, borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2191"}</button>}
        {onMoveDown && <button onClick={onMoveDown} title="Nudge down 3 inches (Arrow Down)" style={{ height: 32, width: 32, padding: 0, borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2193"}</button>}
        <button onClick={onAddGap} style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: "#888", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: SANS }}>Filler</button>
        <button onClick={onAddCab} style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: SANS }}>+ Cab</button>
        <button onClick={onDelete} style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: "#e04040", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: SANS }}>Del</button>
      </div>

      {/* Row 2: Face Sections */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", flexWrap: "wrap" }}>
        <span style={{ color: "#444", fontSize: 10, fontWeight: 700, fontFamily: MONO, letterSpacing: "0.06em" }}>FACE</span>

        {sections.map((sec, i) => {
          const c = SEC_COLORS[sec.type] || SEC_COLORS.open;
          const isEditing = editingSec === i;
          return (
            <button key={i}
              onClick={() => setEditingSec(isEditing ? null : i)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 4,
                background: isEditing ? c.fg + "33" : c.bg,
                border: isEditing ? `1px solid ${c.fg}` : "1px solid transparent",
                color: c.fg, fontSize: 11, fontFamily: MONO, fontWeight: 600,
                cursor: "pointer", whiteSpace: "nowrap",
              }}>
              {sectionSummary(sec)}
              <span onClick={(e) => { e.stopPropagation(); dispatch({ type: "REMOVE_SECTION", cabId: cab.id, sectionIndex: i }); if (editingSec === i) setEditingSec(null); }}
                style={{ marginLeft: 2, color: "#555", fontSize: 10, cursor: "pointer", lineHeight: 1 }}
                title="Remove section">x</span>
            </button>
          );
        })}

        <span style={{ position: "relative", display: "inline-block" }}>
          <button onClick={() => setShowSecPicker(!showSecPicker)} style={{
            padding: "3px 8px", borderRadius: 4, background: showSecPicker ? "#1a1a2a" : "transparent",
            border: "1px dashed #333", color: "#555", fontSize: 11, fontFamily: MONO,
            cursor: "pointer", fontWeight: 600,
          }}>+ Section</button>
          {showSecPicker && (
            <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 4, background: "#14141e", border: "1px solid #2a2a3a", borderRadius: 6, padding: 4, display: "flex", gap: 3, zIndex: 10 }}>
              {["door", "drawer", "false_front", "glass_door", "open"].map(t => (
                <button key={t} onClick={() => {
                  const sec = t === "drawer" ? { type: "drawer", count: 1, height: 6 } : t === "false_front" ? { type: "false_front", height: 6 } : { type: t, count: 1 };
                  dispatch({ type: "ADD_SECTION", cabId: cab.id, section: sec });
                  setShowSecPicker(false);
                  setEditingSec(sections.length);
                }} style={{
                  padding: "4px 8px", borderRadius: 4, background: "#1a1a2a", border: "1px solid #2a2a3a",
                  color: "#ccc", fontSize: 10, fontFamily: MONO, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
                }}>{SEC_LABELS[t] || t}</button>
              ))}
            </div>
          )}
        </span>

        {/* Inline section editor */}
        {editSec && (
          <>
            <span style={{ width: 1, height: 20, background: "#1a1a2a", flexShrink: 0, margin: "0 4px" }} />

            {/* Type */}
            <select
              value={editSec.type}
              onChange={e => dispatch({ type: "UPDATE_SECTION", cabId: cab.id, sectionIndex: editingSec, updates: { type: e.target.value } })}
              style={{
                height: 28, background: "#14141e", border: "1px solid #2a2a3a", borderRadius: 4,
                color: "#ddd", fontSize: 11, fontFamily: MONO, padding: "0 4px", cursor: "pointer",
              }}>
              {SECTION_TYPES.map(t => <option key={t} value={t}>{SEC_LABELS[t]}</option>)}
            </select>

            {/* Count */}
            {(editSec.type === "door" || editSec.type === "glass_door" || editSec.type === "drawer") && (
              <>
                <span style={{ color: "#444", fontSize: 10, fontFamily: MONO }}>count</span>
                <select
                  value={editSec.count || 1}
                  onChange={e => dispatch({ type: "UPDATE_SECTION", cabId: cab.id, sectionIndex: editingSec, updates: { count: parseInt(e.target.value) } })}
                  style={{
                    height: 28, width: 40, background: "#14141e", border: "1px solid #2a2a3a", borderRadius: 4,
                    color: "#ddd", fontSize: 11, fontFamily: MONO, textAlign: "center", cursor: "pointer",
                  }}>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </>
            )}

            {/* Height (for drawers and false fronts) */}
            {(editSec.type === "drawer" || editSec.type === "false_front") && (
              <>
                <span style={{ color: "#444", fontSize: 10, fontFamily: MONO }}>ht</span>
                <input
                  type="number"
                  defaultValue={editSec.height || ""}
                  placeholder="auto"
                  key={`${cab.id}-sec-${editingSec}-h`}
                  onBlur={e => {
                    const v = parseFloat(e.target.value);
                    dispatch({ type: "UPDATE_SECTION", cabId: cab.id, sectionIndex: editingSec, updates: { height: isNaN(v) ? undefined : v } });
                  }}
                  onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                  style={{
                    height: 28, width: 44, background: "#14141e", border: "1px solid #2a2a3a", borderRadius: 4,
                    color: "#ddd", fontSize: 11, fontFamily: MONO, textAlign: "center",
                  }}
                />
              </>
            )}

            {/* Hinge side (for single doors) */}
            {(editSec.type === "door" || editSec.type === "glass_door") && (editSec.count || 1) === 1 && (
              <>
                <span style={{ color: "#444", fontSize: 10, fontFamily: MONO }}>hinge</span>
                <select
                  value={editSec.hinge_side || "left"}
                  onChange={e => dispatch({ type: "UPDATE_SECTION", cabId: cab.id, sectionIndex: editingSec, updates: { hinge_side: e.target.value } })}
                  style={{
                    height: 28, background: "#14141e", border: "1px solid #2a2a3a", borderRadius: 4,
                    color: "#ddd", fontSize: 11, fontFamily: MONO, padding: "0 4px", cursor: "pointer",
                  }}>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
