import { useState } from "react";
import { generateId, defaultCabinet } from "../state/specHelpers";

export default function ActionRow({ cabId, spec, dispatch, onSelect }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitLeft, setSplitLeft] = useState("");
  const [splitRight, setSplitRight] = useState("");

  const cab = spec.cabinets.find(c => c.id === cabId);
  if (!cab) return null;

  const row = cab.row;
  const layoutKey = row === "base" ? "base_layout" : "wall_layout";
  const layout = spec[layoutKey] || [];
  const refIdx = layout.findIndex(item => item.ref === cabId);

  const handleAddBefore = () => {
    const newId = generateId(row, spec);
    const newCab = defaultCabinet(row);
    newCab.id = newId;
    dispatch({ type: "ADD_CABINET", row, position: Math.max(refIdx, 0), cabinet: newCab });
    if (onSelect) onSelect(newId);
  };

  const handleAddAfter = () => {
    const newId = generateId(row, spec);
    const newCab = defaultCabinet(row);
    newCab.id = newId;
    dispatch({ type: "ADD_CABINET", row, position: refIdx + 1, cabinet: newCab });
    if (onSelect) onSelect(newId);
  };

  const handleSplitStart = () => {
    const half = Math.floor(cab.width / 2);
    setSplitLeft(String(half));
    setSplitRight(String(cab.width - half));
    setSplitting(true);
  };

  const handleSplitConfirm = () => {
    const lw = parseFloat(splitLeft);
    const rw = parseFloat(splitRight);
    if (isNaN(lw) || isNaN(rw) || lw <= 0 || rw <= 0) return;
    const leftId = generateId(row, spec);
    // Generate right ID from a spec that already includes the left ID
    const tempSpec = { ...spec, cabinets: [...spec.cabinets, { id: leftId, row }] };
    const rightId = generateId(row, tempSpec);
    dispatch({
      type: "SPLIT_CABINET", id: cabId,
      leftId, rightId, leftWidth: lw, rightWidth: rw
    });
    setSplitting(false);
    if (onSelect) onSelect(leftId);
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    dispatch({ type: "DELETE_CABINET", id: cabId });
    setConfirmDelete(false);
    if (onSelect) onSelect(null);
  };

  const rowColor = row === "base" ? "#D94420" : "#1a6fbf";
  const canSplit = cab.width >= 24;
  const canMoveLeft = refIdx > 0;
  const canMoveRight = refIdx < layout.length - 1;

  const handleMoveLeft = () => {
    if (canMoveLeft) dispatch({ type: "MOVE_CABINET", id: cabId, direction: "left" });
  };
  const handleMoveRight = () => {
    if (canMoveRight) dispatch({ type: "MOVE_CABINET", id: cabId, direction: "right" });
  };

  const pillBtn = (label, onClick, bg, color, extra) => (
    <button onClick={onClick} style={{
      flex: 1, minHeight: 40, borderRadius: 8,
      background: bg, border: "1px solid #2a2a3a",
      color, fontWeight: 600, fontSize: 12,
      fontFamily: "'DM Sans',sans-serif",
      cursor: onClick ? "pointer" : "default", ...extra
    }}>{label}</button>
  );

  if (splitting) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 11, color: "#888", fontFamily: "'DM Sans',sans-serif" }}>
          Split {cabId} ({cab.width}") into two cabinets:
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="number" value={splitLeft} onChange={e => {
            setSplitLeft(e.target.value);
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) setSplitRight(String(Math.max(0, cab.width - v)));
          }} style={{
            flex: 1, minHeight: 44, background: "#14141e", border: `2px solid ${rowColor}`,
            borderRadius: 8, color: "#fff", fontSize: 16, textAlign: "center",
            fontFamily: "'JetBrains Mono',monospace"
          }} />
          <span style={{ color: "#555", fontSize: 16 }}>+</span>
          <input type="number" value={splitRight} onChange={e => {
            setSplitRight(e.target.value);
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) setSplitLeft(String(Math.max(0, cab.width - v)));
          }} style={{
            flex: 1, minHeight: 44, background: "#14141e", border: `2px solid ${rowColor}`,
            borderRadius: 8, color: "#fff", fontSize: 16, textAlign: "center",
            fontFamily: "'JetBrains Mono',monospace"
          }} />
          <span style={{ color: "#666", fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
            = {(parseFloat(splitLeft) || 0) + (parseFloat(splitRight) || 0)}"
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {pillBtn("Split", handleSplitConfirm, rowColor, "#fff")}
          {pillBtn("Cancel", () => setSplitting(false), "#1a1a2a", "#888")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {pillBtn("\u25C0 Move", canMoveLeft ? handleMoveLeft : undefined, "#1a1a2a",
          canMoveLeft ? "#ccc" : "#444", canMoveLeft ? {} : { opacity: 0.4 })}
        {pillBtn("Move \u25B6", canMoveRight ? handleMoveRight : undefined, "#1a1a2a",
          canMoveRight ? "#ccc" : "#444", canMoveRight ? {} : { opacity: 0.4 })}
        {pillBtn("Split", canSplit ? handleSplitStart : undefined, "#1a1a2a",
          canSplit ? "#ccc" : "#444", canSplit ? {} : { opacity: 0.4 })}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {pillBtn("+ Before", handleAddBefore, "#1a1a2a", rowColor)}
        {pillBtn("+ After", handleAddAfter, "#1a1a2a", rowColor)}
        {pillBtn(confirmDelete ? "Confirm?" : "Delete", handleDelete,
          confirmDelete ? "#e04040" : "#1a1a2a",
          confirmDelete ? "#fff" : "#e04040")}
      </div>
    </div>
  );
}
