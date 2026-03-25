import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { STANDARD_WIDTHS, generateId, defaultCabinet } from "../state/specHelpers";
import WidthGrid from "./WidthGrid";

// ── Constants ───────────────────────────────────────────────────
const DEFAULT_PIX_PER_INCH = 3;
const MIN_PIX = 1;
const MAX_PIX = 8;
const RULER_SIZE = 28;

const BASE_Y = 400;   // top-of-base-row in inch-space
const WALL_Y = 80;    // top-of-wall-row in inch-space
const ROW_GAP = 40;   // visual gap between rows (inches)

const COLORS = {
  bg: "#fafafa",
  gridMinor: "#e8e8e8",
  gridMajor: "#ccc",
  baseFill: "#f5e6e0",
  baseStroke: "#D94420",
  wallFill: "#e0e8f5",
  wallStroke: "#1a6fbf",
  selectedFill: "#fff8e0",
  gapStroke: "#aaa",
  rulerText: "#666",
  rulerLine: "#999",
};

const EDGE_GRAB = 6; // px tolerance for edge-drag resize

// ── Helpers ─────────────────────────────────────────────────────

function buildRowItems(spec, row) {
  const layoutKey = row === "base" ? "base_layout" : "wall_layout";
  const layout = spec[layoutKey] || [];
  const cabMap = {};
  spec.cabinets.forEach(c => { cabMap[c.id] = c; });

  const items = [];
  let x = 0;
  layout.forEach((item, layoutIdx) => {
    if (item.ref) {
      const cab = cabMap[item.ref];
      if (cab) {
        items.push({ kind: "cabinet", id: cab.id, cab, x, w: cab.width, layoutIdx });
        x += cab.width;
      }
    } else {
      const w = item.width || 30;
      items.push({ kind: "gap", id: item.id || `gap_${layoutIdx}`, item, x, w, layoutIdx });
      x += w;
    }
  });
  return { items, totalWidth: x };
}

function snapToStandard(inches) {
  let best = STANDARD_WIDTHS[0], bestDist = Infinity;
  for (const sw of STANDARD_WIDTHS) {
    const d = Math.abs(inches - sw);
    if (d < bestDist) { bestDist = d; best = sw; }
  }
  return best;
}

function faceSummary(cab) {
  if (!cab.face?.sections?.length) return "";
  return cab.face.sections.map(s => {
    let t = s.type === "false_front" ? "FF" : s.type === "glass_door" ? "GD" : s.type[0].toUpperCase();
    if (s.count > 1) t += s.count;
    return t;
  }).join("+");
}

// ── Main Component ──────────────────────────────────────────────

export default function GridWorkspace({ spec, dispatch, selectedId, onSelect, undo, redo, canUndo, canRedo }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  // ViewBox state
  const [viewBox, setViewBox] = useState({ x: -RULER_SIZE, y: 0, w: 900, h: 600 });
  const [containerSize, setContainerSize] = useState({ w: 900, h: 600 });

  // Interaction state
  const [dragState, setDragState] = useState(null);
  // dragState: { type: "pan"|"move"|"resize", ... }
  const [contextMenu, setContextMenu] = useState(null);
  const [hoverEdge, setHoverEdge] = useState(null); // { id, side: "left"|"right" }
  const [resizeTooltip, setResizeTooltip] = useState(null);

  // Derived pixel-per-inch from viewBox + container
  const pixPerInch = containerSize.w / viewBox.w;

  // ── Resize observer ──────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Build layout ─────────────────────────────────────────────
  const baseRow = useMemo(() => buildRowItems(spec, "base"), [spec]);
  const wallRow = useMemo(() => buildRowItems(spec, "wall"), [spec]);

  // Position rows: wall at top, base below
  const baseDepth = 24;
  const wallDepth = 12;
  const wallRowY = WALL_Y;
  const baseRowY = wallRowY + wallDepth + ROW_GAP + 60; // gap for labels

  // ── Coordinate conversion ────────────────────────────────────
  const svgPoint = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const sx = (clientX - rect.left) / rect.width;
    const sy = (clientY - rect.top) / rect.height;
    return {
      x: viewBox.x + sx * viewBox.w,
      y: viewBox.y + sy * viewBox.h,
    };
  }, [viewBox]);

  // ── Zoom ─────────────────────────────────────────────────────
  const zoom = useCallback((factor, centerX, centerY) => {
    setViewBox(vb => {
      const newW = Math.max(containerSize.w / MAX_PIX, Math.min(containerSize.w / MIN_PIX, vb.w * factor));
      const newH = newW * (containerSize.h / containerSize.w);
      // Keep center point stationary
      const cx = centerX ?? (vb.x + vb.w / 2);
      const cy = centerY ?? (vb.y + vb.h / 2);
      const ratioX = (cx - vb.x) / vb.w;
      const ratioY = (cy - vb.y) / vb.h;
      return {
        x: cx - ratioX * newW,
        y: cy - ratioY * newH,
        w: newW,
        h: newH,
      };
    });
  }, [containerSize]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const pt = svgPoint(e.clientX, e.clientY);
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    zoom(factor, pt.x, pt.y);
  }, [svgPoint, zoom]);

  // Attach wheel with passive:false
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const fitAll = useCallback(() => {
    const maxW = Math.max(baseRow.totalWidth, wallRow.totalWidth, 72) + 48;
    const totalH = baseDepth + wallDepth + ROW_GAP + 60 + 80;
    const aspect = containerSize.h / containerSize.w;
    let w = maxW + 48;
    let h = w * aspect;
    if (h < totalH + 60) {
      h = totalH + 60;
      w = h / aspect;
    }
    setViewBox({
      x: -RULER_SIZE - 12,
      y: wallRowY - 30,
      w,
      h,
    });
  }, [baseRow, wallRow, containerSize, wallRowY]);

  // Fit on first load
  useEffect(() => { fitAll(); }, [spec.cabinets.length > 0]); // eslint-disable-line

  // ── Hit testing ──────────────────────────────────────────────
  const hitTest = useCallback((pt) => {
    // Check base items
    for (const item of baseRow.items) {
      if (item.kind !== "cabinet") continue;
      const depth = item.cab.depth || 24;
      if (pt.x >= item.x && pt.x <= item.x + item.w &&
          pt.y >= baseRowY && pt.y <= baseRowY + depth) {
        return { row: "base", ...item };
      }
    }
    // Check wall items
    for (const item of wallRow.items) {
      if (item.kind !== "cabinet") continue;
      const depth = item.cab.depth || 12;
      if (pt.x >= item.x && pt.x <= item.x + item.w &&
          pt.y >= wallRowY && pt.y <= wallRowY + depth) {
        return { row: "wall", ...item };
      }
    }
    return null;
  }, [baseRow, wallRow, baseRowY, wallRowY]);

  // Check if near edge of a cabinet
  const edgeTest = useCallback((pt) => {
    const tol = EDGE_GRAB / pixPerInch; // convert px to inches
    const rows = [
      { items: baseRow.items, y: baseRowY, defaultDepth: 24 },
      { items: wallRow.items, y: wallRowY, defaultDepth: 12 },
    ];
    for (const { items, y, defaultDepth } of rows) {
      for (const item of items) {
        if (item.kind !== "cabinet") continue;
        const depth = item.cab.depth || defaultDepth;
        if (pt.y >= y && pt.y <= y + depth) {
          if (Math.abs(pt.x - item.x) < tol) return { id: item.id, side: "left", item };
          if (Math.abs(pt.x - (item.x + item.w)) < tol) return { id: item.id, side: "right", item };
        }
      }
    }
    return null;
  }, [baseRow, wallRow, baseRowY, wallRowY, pixPerInch]);

  // ── Insert zone detection ────────────────────────────────────
  const insertZones = useMemo(() => {
    const zones = [];
    const buildZones = (items, row, rowY, defaultDepth) => {
      // Before first
      const firstX = items.length > 0 ? items[0].x : 0;
      zones.push({ row, x: firstX - 3, y: rowY, h: defaultDepth, position: 0 });
      items.forEach((item, i) => {
        // After each
        zones.push({ row, x: item.x + item.w - 3, y: rowY, h: defaultDepth, position: i + 1 });
      });
    };
    buildZones(baseRow.items, "base", baseRowY, 24);
    buildZones(wallRow.items, "wall", wallRowY, 12);
    return zones;
  }, [baseRow, wallRow, baseRowY, wallRowY]);

  // ── Mouse handlers ───────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (e.button === 2) return; // right-click handled separately
    setContextMenu(null);

    const pt = svgPoint(e.clientX, e.clientY);

    // Check for edge resize
    const edge = edgeTest(pt);
    if (edge) {
      e.preventDefault();
      setDragState({
        type: "resize",
        id: edge.id,
        side: edge.side,
        startX: pt.x,
        origWidth: edge.item.w,
      });
      return;
    }

    // Check for cabinet hit
    const hit = hitTest(pt);
    if (hit && hit.kind === "cabinet") {
      e.preventDefault();
      onSelect(hit.id);
      setDragState({
        type: "move",
        id: hit.id,
        row: hit.row,
        startX: pt.x,
        origX: hit.x,
        layoutIdx: hit.layoutIdx,
        moved: false,
      });
      return;
    }

    // Pan
    onSelect(null);
    setDragState({
      type: "pan",
      startClientX: e.clientX,
      startClientY: e.clientY,
      startVB: { ...viewBox },
    });
  }, [svgPoint, edgeTest, hitTest, onSelect, viewBox]);

  const handleMouseMove = useCallback((e) => {
    const pt = svgPoint(e.clientX, e.clientY);

    if (!dragState) {
      // Hover edge detection for cursor
      const edge = edgeTest(pt);
      setHoverEdge(edge);
      return;
    }

    if (dragState.type === "pan") {
      const dx = (e.clientX - dragState.startClientX) / pixPerInch;
      const dy = (e.clientY - dragState.startClientY) / pixPerInch;
      setViewBox({
        x: dragState.startVB.x - dx,
        y: dragState.startVB.y - dy,
        w: dragState.startVB.w,
        h: dragState.startVB.h,
      });
    } else if (dragState.type === "resize") {
      const deltaInches = pt.x - dragState.startX;
      const rawWidth = dragState.side === "right"
        ? dragState.origWidth + deltaInches
        : dragState.origWidth - deltaInches;
      const snapped = snapToStandard(Math.max(6, rawWidth));
      setResizeTooltip({ x: pt.x, y: pt.y - 8, width: snapped });
    } else if (dragState.type === "move") {
      const dx = Math.abs(pt.x - dragState.startX);
      if (dx > 2) {
        setDragState(prev => ({ ...prev, moved: true, currentX: pt.x }));
      }
    }
  }, [dragState, svgPoint, edgeTest, pixPerInch]);

  const handleMouseUp = useCallback((e) => {
    if (!dragState) return;

    if (dragState.type === "resize") {
      const pt = svgPoint(e.clientX, e.clientY);
      const deltaInches = pt.x - dragState.startX;
      const rawWidth = dragState.side === "right"
        ? dragState.origWidth + deltaInches
        : dragState.origWidth - deltaInches;
      const snapped = snapToStandard(Math.max(6, rawWidth));
      if (snapped !== dragState.origWidth) {
        dispatch({ type: "SET_DIMENSION", id: dragState.id, field: "width", value: snapped });
      }
      setResizeTooltip(null);
    } else if (dragState.type === "move" && dragState.moved) {
      // Calculate drop position
      const pt = svgPoint(e.clientX, e.clientY);
      const row = dragState.row;
      const items = row === "base" ? baseRow.items : wallRow.items;
      let dropIdx = items.length;
      for (let i = 0; i < items.length; i++) {
        if (pt.x < items[i].x + items[i].w / 2) {
          dropIdx = i;
          break;
        }
      }
      // Adjust for the item being moved
      if (dropIdx > dragState.layoutIdx) dropIdx--;
      if (dropIdx !== dragState.layoutIdx) {
        dispatch({ type: "REORDER_CABINET", id: dragState.id, toIndex: dropIdx });
      }
    }

    setDragState(null);
  }, [dragState, svgPoint, dispatch, baseRow, wallRow]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const pt = svgPoint(e.clientX, e.clientY);
    const hit = hitTest(pt);
    if (hit && hit.kind === "cabinet") {
      onSelect(hit.id);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        id: hit.id,
        row: hit.row,
      });
    }
  }, [svgPoint, hitTest, onSelect]);

  const handleInsert = useCallback((row, position) => {
    const newId = generateId(row, spec);
    const newCab = defaultCabinet(row);
    newCab.id = newId;
    dispatch({ type: "ADD_CABINET", row, position, cabinet: newCab });
    onSelect(newId);
  }, [spec, dispatch, onSelect]);

  const handleDelete = useCallback((id) => {
    dispatch({ type: "DELETE_CABINET", id });
    if (selectedId === id) onSelect(null);
    setContextMenu(null);
  }, [dispatch, selectedId, onSelect]);

  const handleDuplicate = useCallback((id) => {
    const cab = spec.cabinets.find(c => c.id === id);
    if (!cab) return;
    const newId = generateId(cab.row, spec);
    dispatch({ type: "DUPLICATE_CABINET", id, newId });
    onSelect(newId);
    setContextMenu(null);
  }, [spec, dispatch, onSelect]);

  const handleSplit = useCallback((id) => {
    const cab = spec.cabinets.find(c => c.id === id);
    if (!cab) return;
    const half = Math.round(cab.width / 2);
    const leftW = snapToStandard(half);
    const rightW = snapToStandard(cab.width - half);
    const leftId = generateId(cab.row, spec);
    // Temporarily add left to get next id
    const tempSpec = { ...spec, cabinets: [...spec.cabinets, { id: leftId, row: cab.row }] };
    const rightId = generateId(cab.row, tempSpec);
    dispatch({ type: "SPLIT_CABINET", id, leftId, rightId, leftWidth: leftW, rightWidth: rightW });
    onSelect(leftId);
    setContextMenu(null);
  }, [spec, dispatch, onSelect]);

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  // ── Keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && !e.target.closest("input,textarea,select")) {
          e.preventDefault();
          handleDelete(selectedId);
        }
      }
      if (e.key === "Escape") {
        onSelect(null);
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, handleDelete, onSelect]);

  // ── Cursor style ─────────────────────────────────────────────
  let cursor = "default";
  if (dragState?.type === "pan") cursor = "grabbing";
  else if (dragState?.type === "move") cursor = "move";
  else if (dragState?.type === "resize" || hoverEdge) cursor = "ew-resize";
  else if (!dragState) cursor = "crosshair";

  // ── Render ───────────────────────────────────────────────────
  const selectedCab = selectedId ? spec.cabinets.find(c => c.id === selectedId) : null;

  // Grid interval: show every inch above 2px/in, every 3" below
  const showEveryInch = pixPerInch >= 2;
  const minorGrid = showEveryInch ? 1 : 3;
  const majorGrid = 12;

  return (
    <div style={{ display: "flex", height: "100%", background: "#fafafa" }}>
      {/* ── SVG Canvas ──────────────────────────────────────── */}
      <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          style={{ display: "block", cursor, userSelect: "none" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { if (dragState) handleMouseUp({ clientX: 0, clientY: 0 }); }}
          onContextMenu={handleContextMenu}
        >
          <defs>
            {/* Minor grid */}
            <pattern id="minorGrid" width={minorGrid} height={minorGrid} patternUnits="userSpaceOnUse">
              <path d={`M ${minorGrid} 0 L 0 0 0 ${minorGrid}`} fill="none" stroke={COLORS.gridMinor} strokeWidth={0.15} />
            </pattern>
            {/* Major grid (12") */}
            <pattern id="majorGrid" width={majorGrid} height={majorGrid} patternUnits="userSpaceOnUse">
              <rect width={majorGrid} height={majorGrid} fill="url(#minorGrid)" />
              <path d={`M ${majorGrid} 0 L 0 0 0 ${majorGrid}`} fill="none" stroke={COLORS.gridMajor} strokeWidth={0.3} />
            </pattern>
          </defs>

          {/* Background grid */}
          <rect x={viewBox.x - 100} y={viewBox.y - 100} width={viewBox.w + 200} height={viewBox.h + 200} fill="url(#majorGrid)" />

          {/* Row labels */}
          <text x={-RULER_SIZE + 2} y={wallRowY - 4} fontSize={4} fill={COLORS.wallStroke} fontWeight={700} fontFamily="'JetBrains Mono',monospace">WALL</text>
          <text x={-RULER_SIZE + 2} y={baseRowY - 4} fontSize={4} fill={COLORS.baseStroke} fontWeight={700} fontFamily="'JetBrains Mono',monospace">BASE</text>

          {/* ── Ruler marks (top) ────────────────────────────── */}
          {(() => {
            const startX = Math.floor(viewBox.x / majorGrid) * majorGrid;
            const endX = viewBox.x + viewBox.w;
            const marks = [];
            for (let x = startX; x <= endX; x += majorGrid) {
              if (x < 0) continue;
              const ft = Math.round(x / 12);
              marks.push(
                <g key={`rx${x}`}>
                  <line x1={x} y1={viewBox.y} x2={x} y2={viewBox.y + 3} stroke={COLORS.rulerLine} strokeWidth={0.2} />
                  <text x={x + 0.5} y={viewBox.y + 6} fontSize={3} fill={COLORS.rulerText} fontFamily="'JetBrains Mono',monospace">{ft}'</text>
                </g>
              );
            }
            return marks;
          })()}

          {/* ── Ruler marks (left) ───────────────────────────── */}
          {(() => {
            const startY = Math.floor(viewBox.y / majorGrid) * majorGrid;
            const endY = viewBox.y + viewBox.h;
            const marks = [];
            for (let y = startY; y <= endY; y += majorGrid) {
              const inches = y;
              marks.push(
                <g key={`ry${y}`}>
                  <line x1={viewBox.x} y1={y} x2={viewBox.x + 3} y2={y} stroke={COLORS.rulerLine} strokeWidth={0.2} />
                  <text x={viewBox.x + 4} y={y + 1.2} fontSize={2.5} fill={COLORS.rulerText} fontFamily="'JetBrains Mono',monospace">{inches}"</text>
                </g>
              );
            }
            return marks;
          })()}

          {/* ── Wall cabinets ────────────────────────────────── */}
          {wallRow.items.map((item) => {
            if (item.kind === "gap") {
              return (
                <g key={`wg-${item.id}`}>
                  <rect x={item.x} y={wallRowY} width={item.w} height={wallDepth}
                    fill="none" stroke={COLORS.gapStroke} strokeWidth={0.3} strokeDasharray="2,1" />
                  <text x={item.x + item.w / 2} y={wallRowY + wallDepth / 2 + 1.2}
                    textAnchor="middle" fontSize={3} fill="#999" fontFamily="'JetBrains Mono',monospace">
                    {(item.item.label || "OPENING").toUpperCase()} {item.w}"
                  </text>
                </g>
              );
            }
            const cab = item.cab;
            const isSelected = cab.id === selectedId;
            const depth = cab.depth || 12;
            return (
              <g key={`w-${cab.id}`}>
                <rect x={item.x} y={wallRowY} width={item.w} height={depth}
                  fill={isSelected ? COLORS.selectedFill : COLORS.wallFill}
                  stroke={COLORS.wallStroke}
                  strokeWidth={isSelected ? 0.8 : 0.4}
                  rx={0.5}
                />
                {/* Door lines */}
                {renderDoorLines(cab, item.x, wallRowY, item.w, depth)}
                {/* Label */}
                <text x={item.x + item.w / 2} y={wallRowY + depth / 2 - 1}
                  textAnchor="middle" fontSize={3} fill={COLORS.wallStroke} fontWeight={700}
                  fontFamily="'JetBrains Mono',monospace" pointerEvents="none">
                  {cab.id}
                </text>
                <text x={item.x + item.w / 2} y={wallRowY + depth / 2 + 2.5}
                  textAnchor="middle" fontSize={2.2} fill="#888"
                  fontFamily="'JetBrains Mono',monospace" pointerEvents="none">
                  {cab.width}x{cab.height || 30}
                </text>
                {/* Width dimension line above */}
                <line x1={item.x} y1={wallRowY - 2} x2={item.x + item.w} y2={wallRowY - 2}
                  stroke={COLORS.wallStroke} strokeWidth={0.15} />
                <line x1={item.x} y1={wallRowY - 3} x2={item.x} y2={wallRowY - 1}
                  stroke={COLORS.wallStroke} strokeWidth={0.15} />
                <line x1={item.x + item.w} y1={wallRowY - 3} x2={item.x + item.w} y2={wallRowY - 1}
                  stroke={COLORS.wallStroke} strokeWidth={0.15} />
                <text x={item.x + item.w / 2} y={wallRowY - 3}
                  textAnchor="middle" fontSize={2.2} fill={COLORS.wallStroke}
                  fontFamily="'JetBrains Mono',monospace" pointerEvents="none">
                  {cab.width}"
                </text>
              </g>
            );
          })}

          {/* ── Base cabinets ────────────────────────────────── */}
          {baseRow.items.map((item) => {
            if (item.kind === "gap") {
              return (
                <g key={`bg-${item.id}`}>
                  <rect x={item.x} y={baseRowY} width={item.w} height={baseDepth}
                    fill="none" stroke={COLORS.gapStroke} strokeWidth={0.3} strokeDasharray="2,1" />
                  <text x={item.x + item.w / 2} y={baseRowY + baseDepth / 2 + 1.2}
                    textAnchor="middle" fontSize={3} fill="#999" fontFamily="'JetBrains Mono',monospace">
                    {(item.item.label || "OPENING").toUpperCase()} {item.w}"
                  </text>
                </g>
              );
            }
            const cab = item.cab;
            const isSelected = cab.id === selectedId;
            const depth = cab.depth || 24;
            const isDragging = dragState?.type === "move" && dragState.id === cab.id && dragState.moved;
            const dragOffsetX = isDragging ? (dragState.currentX - dragState.startX) : 0;
            return (
              <g key={`b-${cab.id}`} transform={isDragging ? `translate(${dragOffsetX},0)` : undefined}
                 opacity={isDragging ? 0.7 : 1}>
                <rect x={item.x} y={baseRowY} width={item.w} height={depth}
                  fill={isSelected ? COLORS.selectedFill : COLORS.baseFill}
                  stroke={COLORS.baseStroke}
                  strokeWidth={isSelected ? 0.8 : 0.4}
                  rx={0.5}
                />
                {/* Door lines */}
                {renderDoorLines(cab, item.x, baseRowY, item.w, depth)}
                {/* Label */}
                <text x={item.x + item.w / 2} y={baseRowY + depth / 2 - 1}
                  textAnchor="middle" fontSize={3} fill={COLORS.baseStroke} fontWeight={700}
                  fontFamily="'JetBrains Mono',monospace" pointerEvents="none">
                  {cab.id}
                </text>
                <text x={item.x + item.w / 2} y={baseRowY + depth / 2 + 2.5}
                  textAnchor="middle" fontSize={2.2} fill="#888"
                  fontFamily="'JetBrains Mono',monospace" pointerEvents="none">
                  {cab.width}x{cab.height || 34.5}
                </text>
                {/* Width dimension line below */}
                <line x1={item.x} y1={baseRowY + depth + 2} x2={item.x + item.w} y2={baseRowY + depth + 2}
                  stroke={COLORS.baseStroke} strokeWidth={0.15} />
                <line x1={item.x} y1={baseRowY + depth + 1} x2={item.x} y2={baseRowY + depth + 3}
                  stroke={COLORS.baseStroke} strokeWidth={0.15} />
                <line x1={item.x + item.w} y1={baseRowY + depth + 1} x2={item.x + item.w} y2={baseRowY + depth + 3}
                  stroke={COLORS.baseStroke} strokeWidth={0.15} />
                <text x={item.x + item.w / 2} y={baseRowY + depth + 5}
                  textAnchor="middle" fontSize={2.2} fill={COLORS.baseStroke}
                  fontFamily="'JetBrains Mono',monospace" pointerEvents="none">
                  {cab.width}"
                </text>
              </g>
            );
          })}

          {/* ── Insert zones ([+] buttons) ───────────────────── */}
          {insertZones.map((zone, i) => {
            const row = zone.row;
            const color = row === "base" ? COLORS.baseStroke : COLORS.wallStroke;
            const size = 4;
            const cy = zone.y + zone.h / 2;
            return (
              <g key={`iz-${row}-${i}`}
                onClick={(e) => { e.stopPropagation(); handleInsert(zone.row, zone.position); }}
                style={{ cursor: "pointer" }}
                opacity={0.4}
                onMouseEnter={(e) => e.currentTarget.setAttribute("opacity", "1")}
                onMouseLeave={(e) => e.currentTarget.setAttribute("opacity", "0.4")}
              >
                <circle cx={zone.x + 3} cy={cy} r={size / 2} fill="white" stroke={color} strokeWidth={0.3} />
                <text x={zone.x + 3} y={cy + 1} textAnchor="middle" fontSize={3} fill={color} fontWeight={700}
                  fontFamily="sans-serif" pointerEvents="none">+</text>
              </g>
            );
          })}

          {/* ── Total run dimensions ─────────────────────────── */}
          {baseRow.totalWidth > 0 && (
            <g>
              <line x1={0} y1={baseRowY + baseDepth + 10} x2={baseRow.totalWidth} y2={baseRowY + baseDepth + 10}
                stroke={COLORS.baseStroke} strokeWidth={0.2} />
              <text x={baseRow.totalWidth / 2} y={baseRowY + baseDepth + 14}
                textAnchor="middle" fontSize={3} fill={COLORS.baseStroke} fontWeight={700}
                fontFamily="'JetBrains Mono',monospace">
                Total: {baseRow.totalWidth}" ({(baseRow.totalWidth / 12).toFixed(1)}')
              </text>
            </g>
          )}
          {wallRow.totalWidth > 0 && (
            <g>
              <line x1={0} y1={wallRowY - 8} x2={wallRow.totalWidth} y2={wallRowY - 8}
                stroke={COLORS.wallStroke} strokeWidth={0.2} />
              <text x={wallRow.totalWidth / 2} y={wallRowY - 10}
                textAnchor="middle" fontSize={3} fill={COLORS.wallStroke} fontWeight={700}
                fontFamily="'JetBrains Mono',monospace">
                Total: {wallRow.totalWidth}" ({(wallRow.totalWidth / 12).toFixed(1)}')
              </text>
            </g>
          )}

          {/* ── Resize tooltip ───────────────────────────────── */}
          {resizeTooltip && (
            <g>
              <rect x={resizeTooltip.x - 6} y={resizeTooltip.y - 4} width={12} height={5}
                fill="#333" rx={1} />
              <text x={resizeTooltip.x} y={resizeTooltip.y - 0.5}
                textAnchor="middle" fontSize={3} fill="#fff"
                fontFamily="'JetBrains Mono',monospace" fontWeight={700}>
                {resizeTooltip.width}"
              </text>
            </g>
          )}
        </svg>

        {/* ── Zoom controls (HTML overlay) ──────────────────── */}
        <div style={{
          position: "absolute", bottom: 12, right: 12,
          display: "flex", gap: 4, alignItems: "center",
        }}>
          <ZoomBtn label="-" onClick={() => zoom(1.3)} />
          <span style={{
            fontSize: 11, color: "#666", fontFamily: "'JetBrains Mono',monospace",
            background: "rgba(255,255,255,0.9)", padding: "2px 6px", borderRadius: 4,
            border: "1px solid #ddd",
          }}>
            {pixPerInch.toFixed(1)} px/in
          </span>
          <ZoomBtn label="+" onClick={() => zoom(0.7)} />
          <ZoomBtn label="Fit" onClick={fitAll} wide />
        </div>

        {/* ── Toolbar (HTML overlay, top-left) ──────────────── */}
        <div style={{
          position: "absolute", top: 8, left: 8,
          display: "flex", gap: 4, alignItems: "center",
        }}>
          <ToolbarBtn label="Undo" onClick={undo} disabled={!canUndo} />
          <ToolbarBtn label="Redo" onClick={redo} disabled={!canRedo} />
          <span style={{
            fontSize: 10, color: "#888", fontFamily: "'JetBrains Mono',monospace",
            background: "rgba(255,255,255,0.9)", padding: "3px 8px", borderRadius: 4,
            border: "1px solid #ddd", marginLeft: 8,
          }}>
            {spec.cabinets.filter(c => c.row === "base").length}B +{" "}
            {spec.cabinets.filter(c => c.row === "wall").length}W ={" "}
            {spec.cabinets.length} cabs
          </span>
        </div>

        {/* ── Context menu (HTML overlay) ────────────────────── */}
        {contextMenu && (
          <div style={{
            position: "fixed", left: contextMenu.x, top: contextMenu.y,
            background: "#fff", border: "1px solid #ddd", borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)", padding: 4,
            zIndex: 1000, minWidth: 140,
          }}>
            <CtxItem label="Duplicate" onClick={() => handleDuplicate(contextMenu.id)} />
            <CtxItem label="Split in Half" onClick={() => handleSplit(contextMenu.id)} />
            <div style={{ height: 1, background: "#eee", margin: "4px 0" }} />
            <CtxItem label="Delete" onClick={() => handleDelete(contextMenu.id)} danger />
          </div>
        )}
      </div>

      {/* ── Properties Panel ──────────────────────────────────── */}
      {selectedCab && (
        <PropertiesPanel
          key={selectedCab.id}
          cab={selectedCab}
          dispatch={dispatch}
          onDelete={() => handleDelete(selectedCab.id)}
          onDuplicate={() => handleDuplicate(selectedCab.id)}
          onClose={() => onSelect(null)}
        />
      )}
    </div>
  );
}

// ── Door line rendering inside cabinet rectangles ──────────────

function renderDoorLines(cab, x, y, w, depth) {
  const secs = cab.face?.sections || [];
  if (!secs.length) return null;

  const els = [];
  const margin = 1;
  // For top-down view, we show door lines as vertical splits
  secs.forEach((sec, si) => {
    if (sec.type === "door" || sec.type === "glass_door") {
      const n = sec.count || 1;
      if (n > 1) {
        // Draw vertical divider lines for multi-door
        const doorW = w / n;
        for (let di = 1; di < n; di++) {
          els.push(
            <line key={`dl-${si}-${di}`}
              x1={x + di * doorW} y1={y + margin}
              x2={x + di * doorW} y2={y + depth - margin}
              stroke="#999" strokeWidth={0.15} strokeDasharray="1,0.5"
              pointerEvents="none" />
          );
        }
      }
    } else if (sec.type === "drawer") {
      // Show horizontal line near front (bottom of top-down rect) for drawer
      const drawH = Math.min(4, depth * 0.2);
      els.push(
        <line key={`dr-${si}`}
          x1={x + margin} y1={y + depth - drawH}
          x2={x + w - margin} y2={y + depth - drawH}
          stroke="#999" strokeWidth={0.15} strokeDasharray="1,0.5"
          pointerEvents="none" />
      );
    } else if (sec.type === "false_front") {
      els.push(
        <line key={`ff-${si}`}
          x1={x + margin} y1={y + depth - 2}
          x2={x + w - margin} y2={y + depth - 2}
          stroke="#bbb" strokeWidth={0.1} strokeDasharray="0.5,0.5"
          pointerEvents="none" />
      );
    }
  });
  return els;
}

// ── Properties Panel ────────────────────────────────────────────

function PropertiesPanel({ cab, dispatch, onDelete, onDuplicate, onClose }) {
  const rowColor = cab.row === "base" ? COLORS.baseStroke : COLORS.wallStroke;

  const setDim = (field, value) => {
    const v = parseFloat(value);
    if (!isNaN(v) && v > 0) {
      dispatch({ type: "SET_DIMENSION", id: cab.id, field, value: v });
    }
  };

  return (
    <div style={{
      width: 280, borderLeft: "1px solid #e0e0e0", background: "#fff",
      display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 14px", borderBottom: "1px solid #eee",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          fontSize: 18, fontWeight: 700, color: rowColor,
          fontFamily: "'JetBrains Mono',monospace",
        }}>{cab.id}</span>
        <span style={{ fontSize: 12, color: "#999" }}>{cab.type}</span>
        <span style={{ flex: 1 }} />
        <button onClick={onClose} style={{
          background: "none", border: "none", fontSize: 18, color: "#aaa",
          cursor: "pointer", padding: "0 4px",
        }}>x</button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "12px 14px" }}>
        {/* Width - big number + grid */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 6 }}>WIDTH</div>
          <div style={{
            fontSize: 36, fontWeight: 700, color: rowColor, textAlign: "center",
            fontFamily: "'JetBrains Mono',monospace", marginBottom: 8,
          }}>
            {cab.width}"
          </div>
          <WidthGrid
            currentWidth={cab.width}
            rowColor={rowColor}
            onWidthChange={(w) => setDim("width", w)}
          />
        </div>

        {/* Height & Depth */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <DimInput label="HEIGHT" value={cab.height} onChange={(v) => setDim("height", v)} />
          <DimInput label="DEPTH" value={cab.depth} onChange={(v) => setDim("depth", v)} />
        </div>

        {/* Label */}
        {cab.label && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4 }}>LABEL</div>
            <div style={{ fontSize: 12, color: "#555" }}>{cab.label}</div>
          </div>
        )}

        {/* Face sections */}
        {cab.face?.sections?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 6 }}>FACE SECTIONS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {cab.face.sections.map((sec, i) => (
                <span key={i} style={{
                  display: "inline-block", fontSize: 11, padding: "3px 8px",
                  borderRadius: 4, fontFamily: "'JetBrains Mono',monospace",
                  background: sec.type === "drawer" ? "#fff3e0" :
                              sec.type === "false_front" ? "#f3e5f5" : "#e8f5e9",
                  color: sec.type === "drawer" ? "#e65100" :
                         sec.type === "false_front" ? "#7b1fa2" : "#2e7d32",
                }}>
                  {sec.type}{sec.count > 1 ? ` x${sec.count}` : ""}
                  {sec.height ? ` ${sec.height}"` : ""}
                  {sec.hinge_side ? ` (${sec.hinge_side})` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={onDuplicate} style={{
            flex: 1, padding: "8px 0", borderRadius: 6,
            background: "#f5f5f5", border: "1px solid #ddd",
            color: "#444", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>Duplicate</button>
          <button onClick={onDelete} style={{
            flex: 1, padding: "8px 0", borderRadius: 6,
            background: "#fff5f5", border: "1px solid #ffcdd2",
            color: "#c62828", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── Small helper components ─────────────────────────────────────

function DimInput({ label, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(String(value));

  const commit = () => {
    setEditing(false);
    const v = parseFloat(raw);
    if (!isNaN(v) && v > 0) onChange(v);
  };

  if (editing) {
    return (
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4 }}>{label}</div>
        <input
          autoFocus
          type="number"
          value={raw}
          onChange={e => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); }}
          style={{
            width: "100%", padding: "6px 8px", fontSize: 16, textAlign: "center",
            border: "2px solid #1a6fbf", borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
            background: "#fafafa", outline: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => { setRaw(String(value)); setEditing(true); }}>
      <div style={{ fontSize: 11, color: "#888", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{
        padding: "6px 8px", fontSize: 16, textAlign: "center",
        border: "1px solid #e0e0e0", borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
        background: "#fafafa", color: "#333",
      }}>
        {value}"
      </div>
    </div>
  );
}

function ZoomBtn({ label, onClick, wide }) {
  return (
    <button onClick={onClick} style={{
      minWidth: wide ? 40 : 28, height: 28, borderRadius: 4,
      background: "rgba(255,255,255,0.95)", border: "1px solid #ddd",
      color: "#444", fontSize: 13, fontWeight: 600,
      cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>{label}</button>
  );
}

function ToolbarBtn({ label, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "4px 10px", borderRadius: 4,
      background: "rgba(255,255,255,0.95)", border: "1px solid #ddd",
      color: disabled ? "#ccc" : "#444",
      fontSize: 11, fontWeight: 600, cursor: disabled ? "default" : "pointer",
      fontFamily: "inherit",
    }}>{label}</button>
  );
}

function CtxItem({ label, onClick, danger }) {
  return (
    <div onClick={onClick} style={{
      padding: "6px 12px", fontSize: 12, cursor: "pointer",
      color: danger ? "#c62828" : "#333", borderRadius: 4,
    }}
    onMouseEnter={e => e.currentTarget.style.background = danger ? "#fff5f5" : "#f5f5f5"}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >{label}</div>
  );
}
