import { totalRun } from "../state/specHelpers";

const btnStyle = {
  background: "#1a1a2a",
  border: "1px solid #2a2a3a",
  color: "#999",
  padding: "4px 10px",
  borderRadius: 5,
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "'JetBrains Mono',monospace",
  fontWeight: 600,
};

export default function Toolbar({ spec, undo, redo, canUndo, canRedo }) {
  const baseRun = totalRun(spec, "base");
  const wallRun = totalRun(spec, "wall");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 2px",
        marginBottom: 8,
        borderBottom: "1px solid #1a1a2a",
      }}
    >
      <button
        onClick={undo}
        disabled={!canUndo}
        style={{
          ...btnStyle,
          opacity: canUndo ? 1 : 0.3,
          cursor: canUndo ? "pointer" : "default",
        }}
        title="Undo"
      >
        Undo
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        style={{
          ...btnStyle,
          opacity: canRedo ? 1 : 0.3,
          cursor: canRedo ? "pointer" : "default",
        }}
        title="Redo"
      >
        Redo
      </button>

      <div style={{ flex: 1 }} />

      <span
        style={{
          fontSize: 10,
          fontFamily: "'JetBrains Mono',monospace",
          color: "#555",
        }}
      >
        <span style={{ color: "#D94420" }}>Base: {baseRun}"</span>
        <span style={{ margin: "0 6px", color: "#2a2a3a" }}>|</span>
        <span style={{ color: "#1a6fbf" }}>Wall: {wallRun}"</span>
      </span>
    </div>
  );
}
