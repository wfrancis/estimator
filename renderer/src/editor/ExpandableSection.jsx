import { useState, useRef, useEffect } from "react";

const COLORS = {
  base: "#D94420",
  wall: "#1a6fbf",
  bg: "#06060c",
  card: "#0c0c14",
  cardBorder: "#1a1a2a",
  text: "#e0e0e0",
  textDim: "#666",
  selected: "#ffd700",
};
const FONT = "'JetBrains Mono', monospace";

export default function ExpandableSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [children, open]);

  return (
    <div style={{ borderTop: `1px solid ${COLORS.cardBorder}`, marginTop: 4 }}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: COLORS.textDim,
          fontSize: 10,
          fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: 10,
            transition: "transform 0.15s ease",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            lineHeight: 1,
          }}
        >
          {"\u25B8"}
        </span>
        {title}
      </button>
      <div
        style={{
          maxHeight: open ? contentHeight + 20 : 0,
          overflow: "hidden",
          transition: "max-height 0.2s ease",
        }}
      >
        <div ref={contentRef} style={{ paddingBottom: 8 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
