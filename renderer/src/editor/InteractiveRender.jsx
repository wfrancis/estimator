import { useCallback, useState, useRef } from "react";

// ── Shared rendering constants (mirrored from App.jsx Render) ──
const SC = 2.5;
const IDX = 0.42;
const IDY = -0.32;
function dp(depth) { const v = depth || 0; return { x: v * SC * IDX, y: v * SC * IDY }; }

function Box3D({ cx, cy, w, h, depth, front, top, side, stroke, sw, dash }) {
  const cw = Math.max((w || 1) * SC, 1), ch = Math.max((h || 1) * SC, 1);
  const dd = dp(depth);
  return (
    <g>
      <polygon points={`${cx},${cy} ${cx + dd.x},${cy + dd.y} ${cx + cw + dd.x},${cy + dd.y} ${cx + cw},${cy}`}
        fill={top || "#f2f2f2"} stroke={stroke || "#333"} strokeWidth={(sw || 1.2) * 0.6} strokeDasharray={dash || ""}
        style={{ pointerEvents: "none" }} />
      <polygon points={`${cx + cw},${cy} ${cx + cw + dd.x},${cy + dd.y} ${cx + cw + dd.x},${cy + ch + dd.y} ${cx + cw},${cy + ch}`}
        fill={side || "#e4e4e4"} stroke={stroke || "#333"} strokeWidth={(sw || 1.2) * 0.6} strokeDasharray={dash || ""}
        style={{ pointerEvents: "none" }} />
      <polygon points={`${cx},${cy} ${cx + cw},${cy} ${cx + cw},${cy + ch} ${cx},${cy + ch}`}
        fill={front || "#fff"} stroke={stroke || "#333"} strokeWidth={sw || 1.2} strokeDasharray={dash || ""} />
    </g>
  );
}

function Face({ cab, cx, cy, w, h }) {
  const secs = Array.isArray(cab?.face?.sections) ? cab.face.sections : [];
  if (!secs.length) return null;
  const cw = w * SC, ch = h * SC, m = 3;
  const fixH = secs.reduce((s, sec) => s + (sec.height || 0) * SC, 0);
  const flexN = secs.filter(s => !s.height).length;
  const flexH = flexN > 0 ? Math.max(0, (ch - fixH) / flexN) : 0;
  const els = [];
  let sy = cy, si = 0;
  secs.forEach(sec => {
    const sh = Math.max(sec.height ? sec.height * SC : flexH, 2);
    if (sec.type === "drawer" || sec.type === "false_front") {
      els.push(<rect key={si + "r"} x={cx + m} y={sy + m} width={Math.max(cw - m * 2, 1)} height={Math.max(sh - m * 2, 1)} fill="none" stroke="#666" strokeWidth={0.8} rx={1} />);
      els.push(<line key={si + "p"} x1={cx + cw / 2 - 7} y1={sy + sh / 2} x2={cx + cw / 2 + 7} y2={sy + sh / 2} stroke="#999" strokeWidth={1.3} strokeLinecap="round" />);
    } else if (sec.type === "door" || sec.type === "glass_door") {
      const n = Math.max(sec.count || 1, 1), dw = (cw - m * 2) / n;
      if (dw >= 4) for (let di = 0; di < n; di++) {
        const dx = cx + m + di * dw;
        els.push(<rect key={`${si}d${di}`} x={dx + 1} y={sy + m} width={Math.max(dw - 2, 1)} height={Math.max(sh - m * 2, 1)} fill="none" stroke="#666" strokeWidth={0.8} rx={1} />);
        if (dw > 14) els.push(<rect key={`${si}d${di}i`} x={dx + 5} y={sy + m + 4} width={Math.max(dw - 10, 1)} height={Math.max(sh - m * 2 - 8, 1)} fill="none" stroke="#ccc" strokeWidth={0.4} rx={1} />);
        let px = n === 1 ? (sec.hinge_side === "left" ? dx + dw - 9 : dx + 9) : (di === 0 ? dx + dw - 9 : dx + 9);
        const pl = Math.min(10, sh * 0.15);
        const py = cab.row === "wall" ? sy + sh - m - 8 - pl : sy + m + 6;
        els.push(<line key={`${si}d${di}h`} x1={px} y1={py} x2={px} y2={py + pl} stroke="#999" strokeWidth={1.3} strokeLinecap="round" />);
      }
    }
    sy += sh; si++;
  });
  return <>{els}</>;
}

export default function InteractiveRender({ spec, selectedId, onSelect, onDoubleClick, onContextMenu: onCtxMenu, onGapSelect, onNudge }) {
  if (!spec?.cabinets?.length) return <div style={{ color: "#555", padding: 20, textAlign: "center" }}>No cabinets loaded</div>;

  const cabMap = {}; spec.cabinets.forEach(c => { cabMap[c.id] = c; });
  const PAD = 45, FLOOR = 450, TOE = 4.5 * SC, CTH = 1.5 * SC, GAP = 18 * SC;
  const CTTOP = FLOOR - TOE - 34.5 * SC - CTH, WBOT = CTTOP - GAP;

  const baseItems = []; let bx = PAD;
  (spec.base_layout || []).forEach(item => {
    const id = item.ref || item.id, cab = cabMap[id], w = cab ? cab.width : (item.width || 30);
    baseItems.push({ id, x: bx, w, cab, item }); bx += w * SC;
  });
  const bMap = {}; baseItems.forEach(b => { bMap[b.id] = b; });

  const aMap = {}; (spec.alignment || []).forEach(a => { aMap[a.wall] = a.base; });
  const wallItems = []; let wx = PAD;
  (spec.wall_layout || []).forEach(item => {
    const id = item.ref || item.id, cab = cabMap[id], w = cab ? cab.width : (item.width || 30);
    if (aMap[id] && bMap[aMap[id]]) wx = bMap[aMap[id]].x;
    wallItems.push({ id, x: wx, w, cab, item }); wx += w * SC;
  });

  const maxWH = Math.max(...wallItems.filter(w => w.cab).map(w => (w.cab.height || 30)), 30) * SC;
  const WTOP = WBOT - maxWH;
  const ddMax = dp(24);
  const svgW = Math.max(bx, wx) + PAD + ddMax.x + 20;

  // Tight viewBox: crop unused vertical whitespace
  const contentTop = wallItems.some(w => w.cab) ? WTOP - 28 : CTTOP - 12;
  const contentBottom = FLOOR + 42;
  const svgH = contentBottom - contentTop;

  const lastCabItem = (spec.base_layout || []).filter(i => i.ref).slice(-1)[0];
  const lastB = lastCabItem ? bMap[lastCabItem.ref] : null;
  const ctR = lastB ? lastB.x + lastB.w * SC : bx;
  const ctW = (ctR - PAD) / SC;

  const handleClick = useCallback((id) => (e) => {
    e.stopPropagation();
    onSelect(id);
  }, [onSelect]);

  const handleDblClick = useCallback((id) => (e) => {
    e.stopPropagation();
    if (onDoubleClick) onDoubleClick(id);
  }, [onDoubleClick]);

  const handleContextMenu = useCallback((id, row) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(id);
    if (onCtxMenu) onCtxMenu({ x: e.clientX, y: e.clientY, id, row });
  }, [onSelect, onCtxMenu]);

  const handleGapClick = useCallback((item) => (e) => {
    e.stopPropagation();
    if (onGapSelect) onGapSelect(item);
  }, [onGapSelect]);

  // ── Drag-to-move state ──
  const [drag, setDrag] = useState(null); // { id, startClientX, dx }
  const svgRef = useRef(null);
  const dragThreshold = 4; // px before drag starts

  const onPointerDown = useCallback((id) => (e) => {
    if (e.button !== 0) return; // left click only
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(id);
    setDrag({ id, startClientX: e.clientX, dx: 0, started: false });
  }, [onSelect]);

  const onPointerMove = useCallback((e) => {
    if (!drag) return;
    const rawDx = e.clientX - drag.startClientX;
    if (!drag.started && Math.abs(rawDx) < dragThreshold) return;
    // Snap dx to nearest inch in SVG coords — need to account for SVG scale
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgScale = rect.width / svg.viewBox.baseVal.width;
    const dxSvg = rawDx / svgScale; // px → SVG units
    const snapInch = Math.round(dxSvg / SC); // SVG units → inches, snapped
    const snappedDx = snapInch * SC * svgScale; // back to screen px
    setDrag(d => ({ ...d, dx: snappedDx, dxInches: snapInch, started: true }));
  }, [drag]);

  const onPointerUp = useCallback((e) => {
    if (!drag) return;
    if (drag.started && drag.dxInches && drag.dxInches !== 0 && onNudge) {
      onNudge(drag.id, drag.dxInches);
    }
    setDrag(null);
  }, [drag, onNudge]);

  const highlightRect = (x, cy, w, h, row) => {
    const color = row === "base" ? "#D94420" : "#1a6fbf";
    return (
      <rect x={x - 1.5} y={cy - 1.5} width={w * SC + 3} height={h * SC + 3}
        fill={color} fillOpacity={0.08} stroke={color} strokeWidth={2.5}
        rx={2} style={{ pointerEvents: "none" }} />
    );
  };

  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid rgba(26,26,46,0.12)", padding: 10 }}
      onClick={() => onSelect(null)}>
      <svg ref={svgRef} viewBox={`0 ${contentTop} ${svgW} ${svgH}`}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{ display: "block", width: "100%", maxWidth: svgW * 2, height: "auto", cursor: drag?.started ? "grabbing" : "pointer" }}>
        <Box3D cx={PAD} cy={CTTOP} w={ctW} h={1.5} depth={25.5} front="none" top="none" side="none" stroke="#888" sw={0.8} />

        {/* Base cabinets first (below gaps in z-order) */}
        {baseItems.filter(bi => bi.cab).map(bi => {
          const c = bi.cab, ch = c.height || 34.5, d = c.depth || 24, cy = FLOOR - TOE - ch * SC;
          const isSelected = selectedId === bi.id;
          const isDragging = drag?.started && drag.id === bi.id;
          const dragTx = isDragging ? `translate(${drag.dx / (svgRef.current ? svgRef.current.getBoundingClientRect().width / svgW : 1)}, 0)` : undefined;
          return (<g key={`b-${bi.id}`} onClick={!drag?.started ? handleClick(bi.id) : undefined} onDoubleClick={handleDblClick(bi.id)} onContextMenu={handleContextMenu(bi.id, "base")} onPointerDown={onPointerDown(bi.id)} style={{ cursor: isDragging ? "grabbing" : "grab" }} transform={dragTx}>
            <rect x={bi.x} y={cy - 4} width={c.width * SC} height={ch * SC + 8 + TOE + 30} fill="transparent" />
            {isSelected && highlightRect(bi.x, cy, c.width, ch, "base")}
            <Box3D cx={bi.x} cy={cy} w={c.width} h={ch} depth={d} />
            <rect x={bi.x + 2 * SC} y={FLOOR - TOE} width={Math.max(0, c.width * SC - 4 * SC)} height={TOE} fill="none" stroke="#ccc" strokeWidth={0.4} />
            <Face cab={c} cx={bi.x} cy={cy} w={c.width} h={ch} />
            <text x={bi.x + c.width * SC / 2} y={FLOOR + 13} textAnchor="middle" fontSize={9} fill="#D94420" fontWeight={700} fontFamily="monospace">{bi.id}</text>
            <text x={bi.x + c.width * SC / 2} y={FLOOR + 23} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{c.width < 21 ? `${c.width}w` : `${c.width}w ${ch}h ${d}d`}</text>
            {isDragging && <text x={bi.x + c.width * SC / 2} y={cy - 8} textAnchor="middle" fontSize={10} fill="#D94420" fontWeight={700} fontFamily="monospace">{drag.dxInches > 0 ? "+" : ""}{drag.dxInches}"</text>}
          </g>);
        })}
        {/* Base gaps on top (clickable) */}
        {baseItems.filter(bi => !bi.cab).map(bi => {
            const gapW = bi.w * SC, midX = bi.x + gapW / 2;
            const label = (bi.item?.label || "").toUpperCase();
            const dimY = FLOOR - TOE - 34.5 * SC / 2;
            return (<g key={`a-${bi.id}`} onClick={handleGapClick(bi.item)} style={{ cursor: "pointer" }}>
              <rect x={bi.x} y={dimY - 10} width={gapW} height={30} fill="transparent" />
              <line x1={bi.x + 1} y1={dimY - 6} x2={bi.x + 1} y2={dimY + 6} stroke="#bbb" strokeWidth={0.6} />
              <line x1={bi.x + gapW - 1} y1={dimY - 6} x2={bi.x + gapW - 1} y2={dimY + 6} stroke="#bbb" strokeWidth={0.6} />
              <line x1={bi.x + 1} y1={dimY} x2={bi.x + gapW - 1} y2={dimY} stroke="#bbb" strokeWidth={0.5} strokeDasharray="3,2" />
              <text x={midX} y={dimY - 4} textAnchor="middle" fontSize={8} fill="#999" fontWeight={600} fontFamily="monospace">{bi.w}"</text>
              {label && <text x={midX} y={dimY + 11} textAnchor="middle" fontSize={7} fill="#aaa" fontFamily="monospace">{label}</text>}
            </g>);
        })}

        <Box3D cx={PAD} cy={CTTOP} w={ctW} h={1.5} depth={25.5} front="none" top="none" side="none" stroke="#444" sw={1.3} />

        {/* Wall cabinets first — bottom-aligned (all bottoms at WBOT) */}
        {wallItems.filter(wi => wi.cab).map(wi => {
          const c = wi.cab, ch = c.height || 30, d = c.depth || 12;
          const wcy = WBOT - ch * SC; // bottom-align: shorter cabs start lower
          const isSelected = selectedId === wi.id;
          const isDragging = drag?.started && drag.id === wi.id;
          const dragTx = isDragging ? `translate(${drag.dx / (svgRef.current ? svgRef.current.getBoundingClientRect().width / svgW : 1)}, 0)` : undefined;
          return (<g key={`w-${wi.id}`} onClick={!drag?.started ? handleClick(wi.id) : undefined} onDoubleClick={handleDblClick(wi.id)} onContextMenu={handleContextMenu(wi.id, "wall")} onPointerDown={onPointerDown(wi.id)} style={{ cursor: isDragging ? "grabbing" : "grab" }} transform={dragTx}>
            <rect x={wi.x} y={wcy - 20} width={c.width * SC} height={ch * SC + 28} fill="transparent" />
            {isSelected && highlightRect(wi.x, wcy, c.width, ch, "wall")}
            <Box3D cx={wi.x} cy={wcy} w={c.width} h={ch} depth={d} front="#fff" top="#eee" side="#ddd" />
            <Face cab={c} cx={wi.x} cy={wcy} w={c.width} h={ch} />
            <text x={wi.x + c.width * SC / 2} y={wcy - 5} textAnchor="middle" fontSize={9} fill="#1a6fbf" fontWeight={700} fontFamily="monospace">{wi.id}</text>
            <text x={wi.x + c.width * SC / 2} y={wcy - 15} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{c.width < 21 ? `${c.width}w` : `${c.width}x${ch}x${d}`}</text>
            {isDragging && <text x={wi.x + c.width * SC / 2} y={wcy - 22} textAnchor="middle" fontSize={10} fill="#1a6fbf" fontWeight={700} fontFamily="monospace">{drag.dxInches > 0 ? "+" : ""}{drag.dxInches}"</text>}
          </g>);
        })}

        {/* Wall gaps on top (clickable) */}
        {wallItems.filter(wi => !wi.cab).map(wi => {
            const gapW = wi.w * SC, midX = wi.x + gapW / 2;
            const label = (wi.item?.label || "").toUpperCase();
            const dimY = WTOP + maxWH / 2;
            return (<g key={`h-${wi.id}`} onClick={handleGapClick(wi.item)} style={{ cursor: "pointer" }}>
              <rect x={wi.x} y={dimY - 10} width={gapW} height={30} fill="transparent" />
              <line x1={wi.x + 1} y1={dimY - 6} x2={wi.x + 1} y2={dimY + 6} stroke="#bbb" strokeWidth={0.6} />
              <line x1={wi.x + gapW - 1} y1={dimY - 6} x2={wi.x + gapW - 1} y2={dimY + 6} stroke="#bbb" strokeWidth={0.6} />
              <line x1={wi.x + 1} y1={dimY} x2={wi.x + gapW - 1} y2={dimY} stroke="#bbb" strokeWidth={0.5} strokeDasharray="3,2" />
              <text x={midX} y={dimY - 4} textAnchor="middle" fontSize={8} fill="#999" fontWeight={600} fontFamily="monospace">{wi.w}"</text>
              {label && <text x={midX} y={dimY + 11} textAnchor="middle" fontSize={7} fill="#aaa" fontFamily="monospace">{label}</text>}
            </g>);
        })}

        {wallItems.length > 0 && (() => {
          const mn = Math.min(...wallItems.map(p => p.x)), mx = Math.max(...wallItems.map(p => p.x + p.w * SC)), dd = dp(12);
          return <g>
            <line x1={mn} y1={WBOT} x2={mx} y2={WBOT} stroke="#bbb" strokeWidth={0.5} strokeDasharray="4,3" />
            <line x1={mn} y1={WTOP} x2={mx} y2={WTOP} stroke="#444" strokeWidth={1} />
            <line x1={mx} y1={WTOP} x2={mx + dd.x} y2={WTOP + dd.y} stroke="#666" strokeWidth={0.5} />
          </g>;
        })()}
        <line x1={0} y1={FLOOR} x2={svgW} y2={FLOOR} stroke="#e0e0e0" strokeWidth={0.5} />
      </svg>
    </div>
  );
}
