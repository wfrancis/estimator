import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { STANDARD_WIDTHS } from "../state/specHelpers";

// ── Constants ────────────────────────────────────────────────
const SCALE = 3; // 3px per inch
const MINOR = 1; // minor grid = 1 inch
const MAJOR = 6; // major grid = 6 inches
const MINOR3 = 3; // 3" ticks
const BLOCK_H_BASE = 60;
const BLOCK_H_WALL = 50;
const HANDLE_W = 6;

const COLORS = {
  bg: "#0a0a14",
  minorGrid: "#1a1a2a",
  majorGrid: "#2a2a3a",
  minor3Grid: "#222230",
  rulerText: "#3a3a4a",
  rulerMinor3: "#2a2a3a",
  base: "#D94420",
  baseFill: "rgba(217,68,32,0.18)",
  wall: "#1a6fbf",
  wallFill: "rgba(26,111,191,0.18)",
  gap: "#555",
  gapFill: "rgba(85,85,85,0.08)",
  gapSelected: "#888",
  gapSelectedFill: "rgba(120,120,120,0.18)",
  gapDash: "6,3",
  selected: "#fff",
  label: "#ccc",
  dimLabel: "#888",
  handleHover: "rgba(255,255,255,0.25)",
  tooltip: "#ffcc00",
  ghost: "rgba(255,255,255,0.20)",
  ghostStroke: "rgba(255,255,255,0.9)",
  rowTotal: "#444",
};

function snapToStandard(inches) {
  let best = STANDARD_WIDTHS[0], bestDist = Infinity;
  for (const w of STANDARD_WIDTHS) {
    const d = Math.abs(inches - w);
    if (d < bestDist) { bestDist = d; best = w; }
  }
  return best;
}

// ── Build layout items with x-positions ─────────────────────
function buildRow(layout, cabMap, scale) {
  const items = [];
  let x = 0;
  for (let i = 0; i < layout.length; i++) {
    const entry = layout[i];
    const id = entry.ref || entry.id;
    const cab = entry.ref ? cabMap[entry.ref] : null;
    const w = cab ? cab.width : (entry.width || 30);
    const isGap = !entry.ref;
    items.push({ id, cab, entry, w, x, idx: i, isGap, row: cab?.row });
    x += w * scale;
  }
  return { items, totalW: x };
}

// ── Context menu ─────────────────────────────────────────────
function ContextMenu({ x, y, item, rowName, onClose, onDuplicate, onDelete, onSetWidth, onSpaceLeft, onSpaceRight }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const menuStyle = {
    position: "fixed",
    left: x,
    top: y,
    background: "#14141e",
    border: "1px solid #2a2a3a",
    borderRadius: 6,
    boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
    zIndex: 1000,
    minWidth: 150,
    fontFamily: "'DM Sans',sans-serif",
    fontSize: 12,
    overflow: "hidden",
  };

  const itemStyle = {
    padding: "8px 14px",
    cursor: "pointer",
    color: "#ccc",
    borderBottom: "1px solid #1a1a2a",
    userSelect: "none",
  };

  const dangerStyle = { ...itemStyle, color: "#e04040", borderBottom: "none" };

  return (
    <div ref={menuRef} style={menuStyle}>
      <div style={{ ...itemStyle, color: "#555", fontSize: 10, fontFamily: "'JetBrains Mono',monospace", cursor: "default" }}>
        {item.id} — {item.w}"
      </div>
      <div style={itemStyle}
        onMouseEnter={e => e.target.style.background = "#1a1a2a"}
        onMouseLeave={e => e.target.style.background = ""}
        onMouseDown={() => { onDuplicate(); onClose(); }}>
        Duplicate
      </div>
      <div style={itemStyle}
        onMouseEnter={e => e.target.style.background = "#1a1a2a"}
        onMouseLeave={e => e.target.style.background = ""}
        onMouseDown={() => { onSetWidth(); onClose(); }}>
        Set Width…
      </div>
      <div style={itemStyle}
        onMouseEnter={e => e.target.style.background = "#1a1a2a"}
        onMouseLeave={e => e.target.style.background = ""}
        onMouseDown={() => { onSpaceLeft(); onClose(); }}>
        + Space Left
      </div>
      <div style={itemStyle}
        onMouseEnter={e => e.target.style.background = "#1a1a2a"}
        onMouseLeave={e => e.target.style.background = ""}
        onMouseDown={() => { onSpaceRight(); onClose(); }}>
        + Space Right
      </div>
      <div style={dangerStyle}
        onMouseEnter={e => e.target.style.background = "#1a1a2a"}
        onMouseLeave={e => e.target.style.background = ""}
        onMouseDown={() => { onDelete(); onClose(); }}>
        Delete
      </div>
    </div>
  );
}

// ── Gap edit bar ─────────────────────────────────────────────
function GapEditBar({ item, rowName, dispatch, onClose }) {
  const [val, setVal] = useState(String(item?.w || 0));
  if (!item) return null;
  const entry = item.entry || {};
  const commit = () => {
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) dispatch({ type: "UPDATE_GAP", row: rowName, position: item.idx, updates: { width: n } });
    onClose();
  };
  return (
    <div style={{
      flexShrink: 0, background: "#0c0c14", borderTop: "1px solid #1a1a2a",
      padding: "8px 10px", display: "flex", alignItems: "center", gap: 8
    }}>
      <span style={{ color: COLORS.gap, fontWeight: 700, fontSize: 14, fontFamily: "'JetBrains Mono',monospace" }}>
        {(entry.label || "GAP").toUpperCase()}
      </span>
      <span style={{ color: "#555", fontSize: 10 }}>opening/gap</span>
      <input
        autoFocus
        type="number"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") onClose(); }}
        onBlur={commit}
        style={{
          width: 64, height: 36, background: "#14141e", border: "2px solid #555",
          borderRadius: 6, color: "#fff", fontSize: 16, textAlign: "center",
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700
        }}
      />
      <span style={{ color: "#555", fontSize: 14, fontFamily: "'JetBrains Mono',monospace" }}>w</span>
      <span style={{ flex: 1 }} />
      <span style={{ color: "#444", fontSize: 10, fontFamily: "'DM Sans',sans-serif" }}>Esc to close</span>
      <button onClick={() => {
        dispatch({ type: "DELETE_GAP", row: rowName, position: item.idx });
        onClose();
      }} style={{
        height: 32, padding: "0 10px", borderRadius: 6, background: "#1a1a2a",
        border: "1px solid #2a2a3a", color: "#e04040", fontWeight: 600, fontSize: 11,
        cursor: "pointer", fontFamily: "'DM Sans',sans-serif"
      }}>Del</button>
      <button onClick={onClose} style={{
        height: 32, padding: "0 10px", borderRadius: 6, background: "#1a1a2a",
        border: "1px solid #2a2a3a", color: "#666", fontWeight: 600, fontSize: 11,
        cursor: "pointer", fontFamily: "'DM Sans',sans-serif"
      }}>Close</button>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────
export default function GridEditor({ spec, selectedId, onSelect, dispatch, widthInputRef, onGapSelect, selectedGapItem, undo, redo }) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 0 });
  const [hoverId, setHoverId] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(false); // true when near right edge
  const [flashId, setFlashId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, item, rowName }
  const [tooltip, setTooltip] = useState(null); // { x, y, item }

  const scale = SCALE * zoom;

  // Build cab lookup
  const cabMap = useMemo(() => {
    const m = {};
    (spec.cabinets || []).forEach(c => { m[c.id] = c; });
    return m;
  }, [spec.cabinets]);

  // Build rows
  const baseRow = useMemo(() => buildRow(spec.base_layout || [], cabMap, scale), [spec.base_layout, cabMap, scale]);
  const wallRow = useMemo(() => buildRow(spec.wall_layout || [], cabMap, scale), [spec.wall_layout, cabMap, scale]);

  // SVG dimensions
  const contentW = Math.max(baseRow.totalW, wallRow.totalW, 300);
  const svgW = contentW + 160;
  const svgH = BLOCK_H_WALL + BLOCK_H_BASE + 100;

  // Row Y positions
  const rulerH = 20;
  const wallY = rulerH + 16;
  const baseY = wallY + BLOCK_H_WALL + 40;

  // ── Flash effect when width changes ──────────────────────
  const prevWidthRef = useRef({});
  useEffect(() => {
    (spec.cabinets || []).forEach(c => {
      if (prevWidthRef.current[c.id] !== undefined && prevWidthRef.current[c.id] !== c.width) {
        setFlashId(c.id);
        setTimeout(() => setFlashId(null), 500);
      }
      prevWidthRef.current[c.id] = c.width;
    });
  }, [spec.cabinets]);

  // ── Keyboard shortcuts (window-level) ────────────────────
  useEffect(() => {
    const handler = (e) => {
      // Don't capture if focus is on an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

      if (e.key === "Escape") {
        onSelect(null);
        if (onGapSelect) onGapSelect(null);
        return;
      }
      if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (e.shiftKey) { if (redo) redo(); }
        else { if (undo) undo(); }
        return;
      }

      if (selectedId) {
        const cabMap2 = {};
        (spec.cabinets || []).forEach(c => { cabMap2[c.id] = c; });
        const sel = cabMap2[selectedId];
        if (!sel) return;

        if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (e.metaKey || e.ctrlKey) {
            // Cmd+Arrow = reorder (swap position in layout)
            dispatch({ type: "MOVE_CABINET", id: selectedId, direction: "left" });
          } else {
            // Arrow = nudge position (shrink gap before cabinet)
            const step = e.shiftKey ? 0.5 : 1;
            dispatch({ type: "NUDGE_CABINET", id: selectedId, amount: -step });
          }
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          if (e.metaKey || e.ctrlKey) {
            dispatch({ type: "MOVE_CABINET", id: selectedId, direction: "right" });
          } else {
            const step = e.shiftKey ? 0.5 : 1;
            dispatch({ type: "NUDGE_CABINET", id: selectedId, amount: step });
          }
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          dispatch({ type: "DELETE_CABINET", id: selectedId });
          onSelect(null);
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          // Select next cabinet in layout order
          const allItems = [...(spec.base_layout || []), ...(spec.wall_layout || [])].filter(i => i.ref);
          const idx = allItems.findIndex(i => i.ref === selectedId);
          if (idx !== -1) {
            const next = allItems[(idx + 1) % allItems.length];
            if (next) onSelect(next.ref);
          }
          return;
        }
        if ((e.key === "d" || e.key === "D") && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          // Duplicate
          const newId = sel.row === "base"
            ? `B${Date.now() % 10000}`
            : `W${Date.now() % 10000}`;
          dispatch({ type: "DUPLICATE_CABINET", id: selectedId, newId });
          onSelect(newId);
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, spec, dispatch, onSelect, onGapSelect]);

  // ── Pointer → SVG viewBox coords ─────────────────────────
  const toSvg = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  // ── Wheel zoom ────────────────────────────────────────────
  const onWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.5, Math.min(6, z * (1 - e.deltaY * 0.001))));
  }, []);

  // ── Pointer handlers ──────────────────────────────────────
  const onPointerDownBlock = useCallback((e, item, row) => {
    e.stopPropagation();
    if (item.isGap) {
      // Gap selected — attach rowName so App.jsx can call UPDATE_GAP with the right row
      if (onGapSelect) onGapSelect({ ...item, rowName: row });
      onSelect(null);
      return;
    }
    onSelect(item.id);
    if (onGapSelect) onGapSelect(null);
    const pt = toSvg(e);
    const blockRight = pan.x + item.x + item.w * scale;
    const nearHandle = Math.abs(pt.x - blockRight) < HANDLE_W * 2;

    if (nearHandle && item.id === selectedId) {
      setDrag({ type: "resize", cabId: item.id, startX: pt.x, startWidth: item.w, row });
    } else {
      setDrag({ type: "move", cabId: item.id, startX: pt.x, origX: item.x, row, idx: item.idx, liveIdx: item.idx, dx: 0 });
    }
  }, [onSelect, onGapSelect, toSvg, pan.x, scale, selectedId]);

  // Hover detection (non-drag) on SVG
  const onSvgPointerMove = useCallback((e) => {
    if (drag) return; // handled by window listener during drag
    const pt = toSvg(e);
    const allRows = [
      { items: wallRow.items, rowY: wallY, blockH: BLOCK_H_WALL },
      { items: baseRow.items, rowY: baseY, blockH: BLOCK_H_BASE },
    ];
    let foundHover = null;
    let foundEdge = false;
    for (const { items, rowY, blockH } of allRows) {
      for (const item of items) {
        if (item.isGap) continue;
        const bx = pan.x + item.x;
        const bw = item.w * scale;
        if (pt.x >= bx && pt.x <= bx + bw && pt.y >= rowY && pt.y <= rowY + blockH) {
          foundHover = item.id;
          foundEdge = item.id === selectedId && Math.abs(pt.x - (bx + bw)) < HANDLE_W * 2;
          break;
        }
      }
    }
    setHoverId(foundHover);
    setHoverEdge(foundEdge);
  }, [drag, toSvg, wallRow.items, baseRow.items, pan.x, scale, selectedId, wallY, baseY]);

  // Keep dragRef in sync so handleUp can read latest state
  useEffect(() => { dragRef.current = drag; }, [drag]);

  // Window-level drag handlers — always receive events regardless of pointer capture
  useEffect(() => {
    if (!drag) return;
    const handleMove = (e) => {
      const pt = toSvg(e);
      const d = dragRef.current;
      if (!d) return;
      const dx = pt.x - d.startX;
      if (d.type === "resize") {
        const rawW = d.startWidth + dx / scale;
        const clamped = Math.max(6, Math.min(60, rawW));
        setDrag(prev => prev ? { ...prev, liveW: clamped } : null);
      } else if (d.type === "move") {
        const layout = d.row === "wall" ? wallRow.items : baseRow.items;
        const offsetX = d.origX + dx;
        const centerX = offsetX + (cabMap[d.cabId]?.width || 18) * scale / 2;
        let targetIdx = 0;
        for (let i = 0; i < layout.length; i++) {
          const mid = layout[i].x + layout[i].w * scale / 2;
          if (centerX > mid) targetIdx = i + 1;
        }
        if (targetIdx > d.idx) targetIdx = Math.min(targetIdx - 1, layout.length - 1);
        else targetIdx = Math.max(targetIdx, 0);
        setDrag(prev => prev ? { ...prev, liveIdx: targetIdx, dx } : null);
      }
    };
    const handleUp = () => {
      const d = dragRef.current;
      if (!d) { setDrag(null); return; }
      if (d.type === "resize" && d.liveW != null) {
        const snapped = Math.round(d.liveW);
        dispatch({ type: "SET_DIMENSION", id: d.cabId, field: "width", value: Math.max(3, snapped) });
      } else if (d.type === "move") {
        if (d.liveIdx !== d.idx) {
          dispatch({ type: "REORDER_CABINET", id: d.cabId, toIndex: d.liveIdx });
        } else if (d.dx) {
          const nudgeInches = Math.round(d.dx / scale);
          if (nudgeInches !== 0) {
            dispatch({ type: "NUDGE_CABINET", id: d.cabId, amount: nudgeInches });
          }
        }
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [drag, toSvg, scale, wallRow.items, baseRow.items, cabMap, dispatch]);

  // Double-click: focus width input for cabinets, or prompt for gaps
  const onDblClickBlock = useCallback((e, item, row) => {
    e.stopPropagation();
    if (item.isGap) {
      const raw = prompt(`Gap width (inches):`, String(item.w));
      if (raw == null) return;
      const val = parseFloat(raw);
      if (isNaN(val) || val <= 0) return;
      dispatch({ type: "UPDATE_GAP", row, position: item.idx, updates: { width: val } });
      return;
    }
    // Focus width input in parent bottom bar
    if (widthInputRef?.current) {
      widthInputRef.current.focus();
      widthInputRef.current.select();
    }
  }, [dispatch, widthInputRef]);

  // Right-click context menu
  const onContextMenu = useCallback((e, item, rowName) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.isGap) return;
    onSelect(item.id);
    setContextMenu({ x: e.clientX, y: e.clientY, item, rowName });
  }, [onSelect]);

  // Click background to deselect
  const onSvgPointerDown = useCallback((e) => {
    if (e.target.tagName === 'svg' || (e.target.tagName === 'rect' && !e.target.closest?.('g'))) {
      onSelect(null);
      if (onGapSelect) onGapSelect(null);
    }
    setContextMenu(null);
  }, [onSelect, onGapSelect]);

  // Tooltip on hover (only when nothing selected)
  const onBlockMouseEnter = useCallback((e, item) => {
    if (selectedId || item.isGap) return;
    const cab = item.cab;
    if (!cab) return;
    setTooltip({
      clientX: e.clientX,
      clientY: e.clientY,
      item,
    });
  }, [selectedId]);

  const onBlockMouseMove = useCallback((e, item) => {
    if (!tooltip || item.isGap) return;
    setTooltip(t => t ? { ...t, clientX: e.clientX, clientY: e.clientY } : null);
  }, [tooltip]);

  const onBlockMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // ── Ruler + grid ──────────────────────────────────────────
  const gridW = Math.ceil(svgW / (MINOR * scale)) * MINOR;
  const gridLines = [];
  for (let i = 0; i <= gridW; i += MINOR) {
    const x = pan.x + i * scale;
    if (x < 0 || x > svgW) continue;
    const isMajor = i % MAJOR === 0;
    const isMinor3 = !isMajor && i % MINOR3 === 0;

    gridLines.push(
      <line key={`g${i}`} x1={x} y1={rulerH} x2={x} y2={svgH}
        stroke={isMajor ? COLORS.majorGrid : isMinor3 ? COLORS.minor3Grid : COLORS.minorGrid}
        strokeWidth={isMajor ? 1 : 0.5} />
    );
    if (isMajor) {
      gridLines.push(
        <text key={`r${i}`} x={x} y={14} fill={COLORS.rulerText}
          fontSize={9} textAnchor="middle" fontFamily="'JetBrains Mono',monospace">
          {i}"
        </text>
      );
    } else if (isMinor3) {
      // Minor 3" tick on ruler bar
      gridLines.push(
        <line key={`r3${i}`} x1={x} y1={rulerH - 5} x2={x} y2={rulerH}
          stroke={COLORS.rulerMinor3} strokeWidth={0.5} />
      );
    }
  }

  // ── Row labels ────────────────────────────────────────────
  const rowLabels = (
    <>
      <text x={8} y={wallY + BLOCK_H_WALL / 2 + 4} fill={COLORS.wall} fontSize={10}
        fontWeight={700} fontFamily="'JetBrains Mono',monospace">WALL</text>
      <text x={8} y={baseY + BLOCK_H_BASE / 2 + 4} fill={COLORS.base} fontSize={10}
        fontWeight={700} fontFamily="'JetBrains Mono',monospace">BASE</text>
    </>
  );

  // ── Row totals at right end ───────────────────────────────
  const baseTotalIn = (spec.base_layout || []).reduce((s, i) => {
    if (i.ref) { const c = cabMap[i.ref]; return s + (c?.width || 0); }
    return s + (i.width || 0);
  }, 0);
  const wallTotalIn = (spec.wall_layout || []).reduce((s, i) => {
    if (i.ref) { const c = cabMap[i.ref]; return s + (c?.width || 0); }
    return s + (i.width || 0);
  }, 0);

  const rowTotals = (
    <>
      {wallRow.totalW > 0 && (
        <text
          x={pan.x + wallRow.totalW + 6}
          y={wallY + BLOCK_H_WALL / 2 + 4}
          fill={COLORS.rowTotal} fontSize={9} textAnchor="start"
          fontFamily="'JetBrains Mono',monospace">
          {wallTotalIn}"
        </text>
      )}
      {baseRow.totalW > 0 && (
        <text
          x={pan.x + baseRow.totalW + 6}
          y={baseY + BLOCK_H_BASE / 2 + 4}
          fill={COLORS.rowTotal} fontSize={9} textAnchor="start"
          fontFamily="'JetBrains Mono',monospace">
          {baseTotalIn}"
        </text>
      )}
    </>
  );

  // ── Render a row of blocks ────────────────────────────────
  function renderRow(items, rowY, blockH, rowName) {
    const isWall = rowName === "wall";
    const color = isWall ? COLORS.wall : COLORS.base;
    const fill = isWall ? COLORS.wallFill : COLORS.baseFill;

    return items.map((item) => {
      const bx = pan.x + item.x;
      const bw = item.w * scale;
      const isSelected = item.id === selectedId && !item.isGap;
      const isGapSelected = item.isGap && selectedGapItem?.idx === item.idx && selectedGapItem?.isGap && selectedGapItem?.rowName === rowName;
      const isDragging = drag != null && drag.cabId === item.id;
      const isResizing = isDragging && drag?.type === "resize";
      const isMoving = isDragging && drag?.type === "move";
      const isHovered = hoverId === item.id && !isSelected;
      const isFlashing = flashId === item.id;

      let displayW = item.w;
      let displayBw = bw;
      if (isResizing && drag.liveW != null) {
        displayW = drag.liveW;
        displayBw = drag.liveW * scale;
      }

      let offsetX = 0;
      if (isMoving && drag.dx != null) {
        offsetX = drag.dx;
      }

      if (item.isGap) {
        const gColor = isGapSelected ? COLORS.gapSelected : COLORS.gap;
        const gFill = isGapSelected ? COLORS.gapSelectedFill : COLORS.gapFill;
        const hasLabel = item.entry.label && item.entry.label.length > 0;
        const isSpacer = !hasLabel; // auto-created spacer from nudging
        return (
          <g key={`gap-${rowName}-${item.idx}`}
            onPointerDown={(e) => onPointerDownBlock(e, item, rowName)}
            onDoubleClick={(e) => onDblClickBlock(e, item, rowName)}
            onContextMenu={(e) => e.preventDefault()}
            style={{ cursor: "pointer" }}>
            {isSpacer ? (
              /* Minimal spacer — just a thin dashed outline with width label */
              <>
                <rect x={bx} y={rowY} width={bw} height={blockH}
                  fill="transparent" stroke={isGapSelected ? COLORS.gapSelected : "#222"}
                  strokeWidth={isGapSelected ? 2 : 0.5}
                  strokeDasharray="4,4" rx={2} />
                <text x={bx + bw / 2} y={rowY + blockH / 2 + 3}
                  fill={isGapSelected ? COLORS.gapSelected : "#333"} fontSize={9} textAnchor="middle"
                  fontFamily="'JetBrains Mono',monospace">
                  {item.w}"
                </text>
              </>
            ) : (
              /* Named gap (Range, Hood, etc.) — full dashed box */
              <>
                <rect x={bx} y={rowY} width={bw} height={blockH}
                  fill={gFill} stroke={gColor}
                  strokeWidth={isGapSelected ? 2 : 1}
                  strokeDasharray={COLORS.gapDash} rx={3} />
                <text x={bx + bw / 2} y={rowY + blockH / 2 - 4}
                  fill={gColor} fontSize={8} textAnchor="middle"
                  fontFamily="'JetBrains Mono',monospace">
                  {item.entry.label.toUpperCase()}
                </text>
                <text x={bx + bw / 2} y={rowY + blockH / 2 + 10}
                  fill={COLORS.dimLabel} fontSize={9} textAnchor="middle"
                  fontFamily="'JetBrains Mono',monospace">
                  {item.w}"
                </text>
              </>
            )}
          </g>
        );
      }

      // Determine cursor
      let cursor = "grab";
      if (isMoving) cursor = "grabbing";
      else if (isSelected && hoverEdge && hoverId === item.id) cursor = "col-resize";

      return (
        <g key={`cab-${item.id}`}
          transform={isMoving ? `translate(${offsetX},0)` : ""}
          style={{ cursor, opacity: isMoving ? 0.8 : 1 }}
          onPointerDown={(e) => onPointerDownBlock(e, item, rowName)}
          onDoubleClick={(e) => onDblClickBlock(e, item, rowName)}
          onContextMenu={(e) => onContextMenu(e, item, rowName)}
          onMouseEnter={(e) => onBlockMouseEnter(e, item)}
          onMouseMove={(e) => onBlockMouseMove(e, item)}
          onMouseLeave={onBlockMouseLeave}>

          {/* Block rect */}
          <rect x={bx} y={rowY} width={displayBw} height={blockH}
            fill={fill}
            stroke={isFlashing ? "#fff" : (isSelected ? COLORS.selected : (isHovered ? color : color))}
            strokeWidth={isFlashing ? 3 : (isSelected ? 2 : (isHovered ? 1.5 : 1))}
            rx={3}
            filter={isSelected ? "url(#glowPulse)" : undefined} />

          {/* ID label */}
          <text x={bx + displayBw / 2} y={rowY + blockH / 2 - 5}
            fill={color} fontSize={12} fontWeight={700} textAnchor="middle"
            fontFamily="'JetBrains Mono',monospace"
            style={{ pointerEvents: "none" }}>
            {item.id}
          </text>

          {/* Width label */}
          <text x={bx + displayBw / 2} y={rowY + blockH / 2 + 9}
            fill={COLORS.dimLabel} fontSize={10} textAnchor="middle"
            fontFamily="'JetBrains Mono',monospace"
            style={{ pointerEvents: "none" }}>
            {Math.round(displayW)}"
          </text>

          {/* Face summary — e.g. "Dr+2D" for drawer + 2 doors */}
          {item.cab?.face?.sections?.length > 0 && displayBw > 30 && (
            <text x={bx + displayBw / 2} y={rowY + blockH / 2 + 22}
              fill={isWall ? "rgba(26,111,191,0.5)" : "rgba(217,68,32,0.5)"} fontSize={7} textAnchor="middle"
              fontFamily="'JetBrains Mono',monospace"
              style={{ pointerEvents: "none" }}>
              {item.cab.face.sections.map(s => {
                const c = s.count > 1 ? s.count : "";
                if (s.type === "drawer") return c + "Dr";
                if (s.type === "door") return c + "D";
                if (s.type === "false_front") return "FF";
                if (s.type === "glass_door") return c + "G";
                return s.type.substring(0, 2);
              }).join("+")}
            </text>
          )}

          {/* Resize handle (only on selected) */}
          {isSelected && (
            <rect x={bx + displayBw - HANDLE_W / 2} y={rowY + 4}
              width={HANDLE_W} height={blockH - 8}
              fill={COLORS.handleHover} rx={2}
              style={{ cursor: "col-resize" }} />
          )}

          {/* Live resize tooltip */}
          {isResizing && drag.liveW != null && (
            <text x={bx + displayBw + 8} y={rowY + blockH / 2 + 4}
              fill={COLORS.tooltip} fontSize={11} fontWeight={700}
              fontFamily="'JetBrains Mono',monospace"
              style={{ pointerEvents: "none" }}>
              {"\u2192"} {Math.round(drag.liveW)}"
            </text>
          )}
        </g>
      );
    });
  }

  // ── Ghost drop indicator ──────────────────────────────────
  let ghostEl = null;
  if (drag?.type === "move" && drag.liveIdx !== drag.idx) {
    const layout = drag.row === "wall" ? wallRow.items : baseRow.items;
    const rowY = drag.row === "wall" ? wallY : baseY;
    const blockH = drag.row === "wall" ? BLOCK_H_WALL : BLOCK_H_BASE;
    let ghostX = 0;
    if (drag.liveIdx < layout.length) {
      ghostX = layout[drag.liveIdx].x;
    } else if (layout.length > 0) {
      const last = layout[layout.length - 1];
      ghostX = last.x + last.w * scale;
    }
    const cab = cabMap[drag.cabId];
    const ghostW = (cab?.width || 18) * scale;
    ghostEl = (
      <rect x={pan.x + ghostX} y={rowY} width={ghostW} height={blockH}
        fill={COLORS.ghost} stroke={COLORS.ghostStroke} strokeWidth={2.5}
        strokeDasharray="6,3" rx={3} style={{ pointerEvents: "none" }} />
    );
  }

  const zoomIn = () => setZoom(z => Math.min(6, z * 1.3));
  const zoomOut = () => setZoom(z => Math.max(0.5, z / 1.3));
  const zoomReset = () => setZoom(1);

  // Determine SVG cursor
  let svgCursor = "default";
  if (drag) {
    svgCursor = drag.type === "resize" ? "col-resize" : "grabbing";
  } else if (hoverId) {
    svgCursor = hoverEdge ? "col-resize" : "grab";
  }

  return (
    <div style={{ background: COLORS.bg, overflow: "auto", position: "relative", height: "100%" }} onWheel={onWheel}>
      {/* Total width badges */}
      <div style={{
        position: "absolute", top: 6, right: 12, display: "flex", gap: 10, zIndex: 2,
        fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 600
      }}>
        <span style={{ color: COLORS.wall }}>Wall: {wallTotalIn}"</span>
        <span style={{ color: COLORS.base }}>Base: {baseTotalIn}"</span>
      </div>

      {/* Zoom controls */}
      <div style={{ position: "absolute", bottom: 8, right: 12, display: "flex", gap: 4, zIndex: 2 }}>
        <button onClick={zoomOut} style={{ width: 28, height: 28, borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: "#888", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>-</button>
        <button onClick={zoomReset} style={{ height: 28, borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: "#666", fontSize: 9, cursor: "pointer", padding: "0 6px", fontFamily: "'JetBrains Mono',monospace" }}>{Math.round(zoom * 100)}%</button>
        <button onClick={zoomIn} style={{ width: 28, height: 28, borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: "#888", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>+</button>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${svgW} ${svgH}`}
        preserveAspectRatio="xMinYMin meet"
        style={{ display: "block", minWidth: svgW, minHeight: svgH, cursor: svgCursor }}
        onWheel={onWheel}
        onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgPointerMove}
      >
        <defs>
          {/* Pulse animation for selected block glow */}
          <filter id="glowPulse">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={COLORS.selected} floodOpacity="0.6">
              <animate attributeName="stdDeviation" values="3;7;3" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="floodOpacity" values="0.4;0.9;0.4" dur="1.8s" repeatCount="indefinite" />
            </feDropShadow>
          </filter>
        </defs>

        {/* Background */}
        <rect width={svgW} height={svgH} fill={COLORS.bg} />

        {/* Ruler bar */}
        <rect x={0} y={0} width={svgW} height={rulerH} fill="#0e0e18" />

        {/* Grid lines */}
        {gridLines}

        {/* Horizontal row dividers (faint) */}
        <line x1={0} y1={wallY - 4} x2={svgW} y2={wallY - 4} stroke={COLORS.minorGrid} strokeWidth={0.5} />
        <line x1={0} y1={wallY + BLOCK_H_WALL + 4} x2={svgW} y2={wallY + BLOCK_H_WALL + 4} stroke={COLORS.minorGrid} strokeWidth={0.5} />
        <line x1={0} y1={baseY - 4} x2={svgW} y2={baseY - 4} stroke={COLORS.minorGrid} strokeWidth={0.5} />
        <line x1={0} y1={baseY + BLOCK_H_BASE + 4} x2={svgW} y2={baseY + BLOCK_H_BASE + 4} stroke={COLORS.minorGrid} strokeWidth={0.5} />

        {/* Row labels */}
        {rowLabels}

        {/* Row totals at end */}
        {rowTotals}

        {/* Ghost drop indicator */}
        {ghostEl}

        {/* Wall row */}
        {renderRow(wallRow.items, wallY, BLOCK_H_WALL, "wall")}

        {/* Base row */}
        {renderRow(baseRow.items, baseY, BLOCK_H_BASE, "base")}
      </svg>

      {/* Hover tooltip (only when nothing selected) */}
      {tooltip && !selectedId && (
        <div style={{
          position: "fixed",
          left: tooltip.clientX + 14,
          top: tooltip.clientY - 10,
          background: "#14141e",
          border: "1px solid #2a2a3a",
          borderRadius: 6,
          padding: "6px 10px",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          color: "#aaa",
          pointerEvents: "none",
          zIndex: 100,
          whiteSpace: "nowrap",
          boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
        }}>
          <div style={{ color: "#fff", fontWeight: 700, marginBottom: 2 }}>{tooltip.item.id}</div>
          <div style={{ color: "#888" }}>{tooltip.item.cab?.type?.replace(/_/g, " ")}</div>
          <div>{tooltip.item.w}" × {tooltip.item.cab?.height}" × {tooltip.item.cab?.depth}"</div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          rowName={contextMenu.rowName}
          onClose={() => setContextMenu(null)}
          onDuplicate={() => {
            const sel = contextMenu.item;
            const newId = sel.cab?.row === "base"
              ? `B${Date.now() % 10000}`
              : `W${Date.now() % 10000}`;
            dispatch({ type: "DUPLICATE_CABINET", id: sel.id, newId });
            onSelect(newId);
          }}
          onDelete={() => {
            dispatch({ type: "DELETE_CABINET", id: contextMenu.item.id });
            onSelect(null);
          }}
          onSetWidth={() => {
            if (widthInputRef?.current) {
              widthInputRef.current.focus();
              widthInputRef.current.select();
            }
          }}
          onSpaceLeft={() => {
            const item = contextMenu.item;
            const row = item.cab?.row || contextMenu.rowName;
            const layoutKey = row === "base" ? "base_layout" : "wall_layout";
            const layout = spec[layoutKey] || [];
            const pos = layout.findIndex(i => i.ref === item.id);
            if (pos >= 0) dispatch({ type: "ADD_GAP", row, position: pos, gap: { type: "filler", label: "Filler", width: 3 } });
          }}
          onSpaceRight={() => {
            const item = contextMenu.item;
            const row = item.cab?.row || contextMenu.rowName;
            const layoutKey = row === "base" ? "base_layout" : "wall_layout";
            const layout = spec[layoutKey] || [];
            const pos = layout.findIndex(i => i.ref === item.id);
            if (pos >= 0) dispatch({ type: "ADD_GAP", row, position: pos + 1, gap: { type: "filler", label: "Filler", width: 3 } });
          }}
        />
      )}
    </div>
  );
}

// Export GapEditBar so App.jsx can use it in the bottom bar
export { GapEditBar };
