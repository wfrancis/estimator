import { useState, useRef, useEffect, useCallback } from "react";
import { Routes, Route, useParams, useNavigate, useSearchParams } from "react-router-dom";
import useSpecState from "./state/useSpecState";
import InteractiveRender from "./editor/InteractiveRender";
import GridEditor from "./editor/GridEditor";
import CabinetEditBar from "./editor/CabinetEditBar";
import { defaultCabinet, generateId } from "./state/specHelpers";
import ProjectList from "./pages/ProjectList";
import * as api from "./api";

// ═══════════════════════════════════════════════════════════
// PRE-EXTRACTED SPEC — from the uploaded wireframe image
// ═══════════════════════════════════════════════════════════
const WIREFRAME_SPEC = {
  base_layout: [
    { ref: "B1" },
    { ref: "B2" },
    { type: "appliance", id: "range", label: "Range", width: 30 },
    { ref: "B3" },
    { ref: "B4" },
    { ref: "B5" }
  ],
  wall_layout: [
    { ref: "W1" },
    { ref: "W2" },
    { ref: "W3" },
    { ref: "W4" },
    { ref: "W5" },
    { ref: "W6" },
    { ref: "W7" }
  ],
  alignment: [
    { wall: "W1", base: "B1" },
    { wall: "W4", base: "B3" }
  ],
  cabinets: [
    { id: "B1", type: "base", label: "Drawer over single door", row: "base", width: 18, height: 34.5, depth: 24,
      face: { sections: [{ type: "drawer", count: 1, height: 6 }, { type: "door", count: 1, hinge_side: "left" }] } },
    { id: "B2", type: "base", label: "Single door tall", row: "base", width: 21, height: 34.5, depth: 24,
      face: { sections: [{ type: "door", count: 1, hinge_side: "right" }] } },
    { id: "B3", type: "base_sink", label: "Sink base", row: "base", width: 36, height: 34.5, depth: 24,
      face: { sections: [{ type: "false_front", count: 1, height: 6 }, { type: "door", count: 2 }] } },
    { id: "B4", type: "base", label: "Drawer over double door", row: "base", width: 24, height: 34.5, depth: 24,
      face: { sections: [{ type: "drawer", count: 1, height: 6 }, { type: "door", count: 2 }] } },
    { id: "B5", type: "base_pullout", label: "Spice/wine pullout", row: "base", width: 9, height: 34.5, depth: 24,
      face: { sections: [{ type: "door", count: 1, hinge_side: "right" }] } },
    { id: "W1", type: "wall", label: "Tall single left", row: "wall", width: 15, height: 42, depth: 12,
      face: { sections: [{ type: "door", count: 1, hinge_side: "right" }] } },
    { id: "W2", type: "wall", label: "Tall single right", row: "wall", width: 15, height: 42, depth: 12,
      face: { sections: [{ type: "door", count: 1, hinge_side: "left" }] } },
    { id: "W3", type: "wall", label: "Double door wide", row: "wall", width: 33, height: 30, depth: 12,
      face: { sections: [{ type: "door", count: 2 }] } },
    { id: "W4", type: "wall", label: "Double door over sink", row: "wall", width: 33, height: 30, depth: 12,
      face: { sections: [{ type: "door", count: 2 }] } },
    { id: "W5", type: "wall", label: "Single door", row: "wall", width: 18, height: 30, depth: 12,
      face: { sections: [{ type: "door", count: 1, hinge_side: "left" }] } },
    { id: "W6", type: "wall", label: "Short square left", row: "wall", width: 15, height: 18, depth: 12,
      face: { sections: [{ type: "door", count: 1, hinge_side: "right" }] } },
    { id: "W7", type: "wall", label: "Short square right", row: "wall", width: 15, height: 18, depth: 12,
      face: { sections: [{ type: "door", count: 1, hinge_side: "left" }] } }
  ]
};

// ═══════════════════════════════════════════════════════════
// RENDERER
// ═══════════════════════════════════════════════════════════
const SC = 2.5;
const IDX = 0.42;
const IDY = -0.32;
function dp(depth) { const v = depth||0; return { x:v*SC*IDX, y:v*SC*IDY }; }

function Box3D({ cx, cy, w, h, depth, front, top, side, stroke, sw, dash }) {
  const cw = Math.max((w||1)*SC, 1), ch = Math.max((h||1)*SC, 1);
  const dd = dp(depth);
  return (
    <g>
      <polygon points={`${cx},${cy} ${cx+dd.x},${cy+dd.y} ${cx+cw+dd.x},${cy+dd.y} ${cx+cw},${cy}`}
        fill={top||"#f2f2f2"} stroke={stroke||"#333"} strokeWidth={(sw||1.2)*0.6} strokeDasharray={dash||""} />
      <polygon points={`${cx+cw},${cy} ${cx+cw+dd.x},${cy+dd.y} ${cx+cw+dd.x},${cy+ch+dd.y} ${cx+cw},${cy+ch}`}
        fill={side||"#e4e4e4"} stroke={stroke||"#333"} strokeWidth={(sw||1.2)*0.6} strokeDasharray={dash||""} />
      <polygon points={`${cx},${cy} ${cx+cw},${cy} ${cx+cw},${cy+ch} ${cx},${cy+ch}`}
        fill={front||"#fff"} stroke={stroke||"#333"} strokeWidth={sw||1.2} strokeDasharray={dash||""} />
    </g>
  );
}

function Face({ cab, cx, cy, w, h }) {
  const secs = Array.isArray(cab?.face?.sections) ? cab.face.sections : [];
  if (!secs.length) return null;
  const cw = w*SC, ch = h*SC, m = 3;
  const fixH = secs.reduce((s, sec) => s + (sec.height||0)*SC, 0);
  const flexN = secs.filter(s => !s.height).length;
  const flexH = flexN > 0 ? Math.max(0, (ch - fixH) / flexN) : 0;
  const els = [];
  let sy = cy, si = 0;
  secs.forEach(sec => {
    const sh = Math.max(sec.height ? sec.height*SC : flexH, 2);
    if (sec.type === "drawer" || sec.type === "false_front") {
      els.push(<rect key={si+"r"} x={cx+m} y={sy+m} width={Math.max(cw-m*2,1)} height={Math.max(sh-m*2,1)} fill="none" stroke="#666" strokeWidth={0.8} rx={1}/>);
      els.push(<line key={si+"p"} x1={cx+cw/2-7} y1={sy+sh/2} x2={cx+cw/2+7} y2={sy+sh/2} stroke="#999" strokeWidth={1.3} strokeLinecap="round"/>);
    } else if (sec.type === "door" || sec.type === "glass_door") {
      const n = Math.max(sec.count||1, 1), dw = (cw-m*2)/n;
      if (dw >= 4) for (let di = 0; di < n; di++) {
        const dx = cx+m+di*dw;
        els.push(<rect key={`${si}d${di}`} x={dx+1} y={sy+m} width={Math.max(dw-2,1)} height={Math.max(sh-m*2,1)} fill="none" stroke="#666" strokeWidth={0.8} rx={1}/>);
        if (dw > 14) els.push(<rect key={`${si}d${di}i`} x={dx+5} y={sy+m+4} width={Math.max(dw-10,1)} height={Math.max(sh-m*2-8,1)} fill="none" stroke="#ccc" strokeWidth={0.4} rx={1}/>);
        let px = n===1 ? (sec.hinge_side==="left" ? dx+dw-9 : dx+9) : (di===0 ? dx+dw-9 : dx+9);
        const pl = Math.min(10, sh*0.15);
        const py = cab.row==="wall" ? sy+sh-m-8-pl : sy+m+6;
        els.push(<line key={`${si}d${di}h`} x1={px} y1={py} x2={px} y2={py+pl} stroke="#999" strokeWidth={1.3} strokeLinecap="round"/>);
      }
    }
    sy += sh; si++;
  });
  return <>{els}</>;
}

function Render({ spec }) {
  if (!spec?.cabinets?.length) return <div style={{color:"#555",padding:20,textAlign:"center"}}>No cabinets loaded</div>;
  const cabMap = {}; spec.cabinets.forEach(c => { cabMap[c.id] = c; });
  const PAD=45, FLOOR=450, TOE=4.5*SC, CTH=1.5*SC, GAP=18*SC;
  const CTTOP = FLOOR-TOE-34.5*SC-CTH, WBOT = CTTOP-GAP;

  const baseItems = []; let bx = PAD;
  (spec.base_layout||[]).forEach(item => {
    const id = item.ref||item.id, cab = cabMap[id], w = cab?cab.width:(item.width||30);
    baseItems.push({ id, x:bx, w, cab, item }); bx += w*SC;
  });
  const bMap = {}; baseItems.forEach(b => { bMap[b.id] = b; });

  const aMap = {}; (spec.alignment||[]).forEach(a => { aMap[a.wall] = a.base; });
  const wallItems = []; let wx = PAD; let prevWasGap = false;
  (spec.wall_layout||[]).forEach(item => {
    const id = item.ref||item.id, cab = cabMap[id], w = cab?cab.width:(item.width||30);
    // Only apply alignment if no explicit filler/gap precedes this cabinet
    // Never move backwards — alignment can only push right, not overlap previous items
    if (!prevWasGap && aMap[id] && bMap[aMap[id]]) {
      const alignX = bMap[aMap[id]].x;
      if (alignX >= wx) wx = alignX;
    }
    wallItems.push({ id, x:wx, w, cab, item }); wx += w*SC;
    prevWasGap = !item.ref;
  });

  const maxWH = Math.max(...wallItems.filter(w=>w.cab).map(w=>(w.cab.height||30)), 30)*SC;
  const WTOP = WBOT - maxWH;
  const ddMax = dp(24);
  const svgW = Math.max(bx,wx) + PAD + ddMax.x + 20;
  const svgH = 530;

  const lastCabItem = (spec.base_layout||[]).filter(i=>i.ref).slice(-1)[0];
  const lastB = lastCabItem ? bMap[lastCabItem.ref] : null;
  const ctR = lastB ? lastB.x + lastB.w*SC : bx;
  const ctW = (ctR-PAD)/SC;

  return (
    <div style={{background:"#fff",borderRadius:10,overflow:"auto",border:"1px solid rgba(26,26,46,0.12)",padding:10}}>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{display:"block",maxWidth:"100%",minWidth:svgW}}>
        <Box3D cx={PAD} cy={CTTOP} w={ctW} h={1.5} depth={25.5} front="none" top="none" side="none" stroke="#888" sw={0.8}/>

        {(() => {
          const baseEls = [];
          const baseLabelPos = [];
          baseItems.forEach(bi => {
            if (!bi.cab) {
              const isFiller = bi.item?.type === "filler";
              if (isFiller) {
                const cy = FLOOR-TOE-34.5*SC;
                baseEls.push(<g key={`f-${bi.id}-${bi.x}`}>
                  <line x1={bi.x+bi.w*SC/2} y1={cy} x2={bi.x+bi.w*SC/2} y2={FLOOR} stroke="#ccc" strokeWidth={0.5} strokeDasharray="3,3"/>
                  <text x={bi.x+bi.w*SC/2} y={FLOOR+13} textAnchor="middle" fontSize={6} fill="#bbb" fontFamily="monospace">{bi.w}"</text>
                </g>);
              } else {
                const isFridge = bi.id==="fridge"||bi.item?.label?.toLowerCase()?.includes("fridge");
                const h = isFridge?70:34.5, cy = isFridge?(FLOOR-h*SC):(FLOOR-TOE-34.5*SC);
                baseEls.push(<g key={`a-${bi.id}`}>
                  <Box3D cx={bi.x} cy={cy} w={bi.w} h={h} depth={isFridge?28:24} front="#f8f8f8" top="#eee" side="#e0e0e0" stroke="#aaa" sw={0.7} dash="5,3"/>
                  <text x={bi.x+bi.w*SC/2} y={cy+(h*SC)/2+3} textAnchor="middle" fontSize={8} fill="#aaa" fontFamily="monospace">{(bi.item?.label||bi.id).toUpperCase()}</text>
                  <text x={bi.x+bi.w*SC/2} y={FLOOR+13} textAnchor="middle" fontSize={7} fill="#aaa" fontFamily="monospace">{bi.w}"</text>
                </g>);
              }
              return;
            }
            const c = bi.cab, ch = c.height||34.5, d = c.depth||24, cy = FLOOR-TOE-ch*SC;
            const labelX = bi.x + c.width*SC/2;
            const tooClose = baseLabelPos.some(px => Math.abs(labelX - px) < 45);
            const labelYOff = tooClose ? 33 : 23;
            baseLabelPos.push(labelX);
            baseEls.push(<g key={`b-${bi.id}`}>
              <Box3D cx={bi.x} cy={cy} w={c.width} h={ch} depth={d}/>
              <rect x={bi.x+2*SC} y={FLOOR-TOE} width={Math.max(0,c.width*SC-4*SC)} height={TOE} fill="none" stroke="#ccc" strokeWidth={0.4}/>
              <Face cab={c} cx={bi.x} cy={cy} w={c.width} h={ch}/>
              <text x={labelX} y={FLOOR+13} textAnchor="middle" fontSize={9} fill="#D94420" fontWeight={700} fontFamily="monospace">{bi.id}</text>
              <text x={labelX} y={FLOOR+labelYOff} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{c.width}w {ch}h {d}d</text>
            </g>);
          });
          return baseEls;
        })()}

        <Box3D cx={PAD} cy={CTTOP} w={ctW} h={1.5} depth={25.5} front="none" top="none" side="none" stroke="#444" sw={1.3}/>

        {(() => {
          // Render wall items with collision-free labels
          const wallEls = [];
          const labelPositions = []; // track label x positions for staggering
          wallItems.forEach((wi, idx) => {
            if (!wi.cab) {
              const isFiller = wi.item?.type === "filler";
              if (isFiller) {
                wallEls.push(<g key={`wf-${wi.id}-${wi.x}`}>
                  <line x1={wi.x+wi.w*SC/2} y1={WTOP} x2={wi.x+wi.w*SC/2} y2={WBOT} stroke="#ccc" strokeWidth={0.5} strokeDasharray="3,3"/>
                  <text x={wi.x+wi.w*SC/2} y={WTOP-5} textAnchor="middle" fontSize={6} fill="#bbb" fontFamily="monospace">{wi.w}"</text>
                </g>);
              } else {
                const hh=16, hy=WBOT+8;
                wallEls.push(<g key={`h-${wi.id}`}>
                  <rect x={wi.x+6} y={hy} width={Math.max(wi.w*SC-12,1)} height={hh} fill="#f4f4f4" stroke="#aaa" strokeWidth={0.7} rx={3}/>
                  <text x={wi.x+wi.w*SC/2} y={hy+11} textAnchor="middle" fontSize={7} fill="#aaa" fontFamily="monospace">HOOD</text>
                </g>);
              }
              return;
            }
            const c = wi.cab, ch = c.height||30, d = c.depth||12;
            const labelX = wi.x + c.width*SC/2;
            // Check if this label overlaps with a previous one (within 40px)
            const tooClose = labelPositions.some(px => Math.abs(labelX - px) < 40);
            const labelYOff = tooClose ? -25 : -15;
            labelPositions.push(labelX);
            wallEls.push(<g key={`w-${wi.id}`}>
              <Box3D cx={wi.x} cy={WTOP} w={c.width} h={ch} depth={d} front="#fff" top="#eee" side="#ddd"/>
              <Face cab={c} cx={wi.x} cy={WTOP} w={c.width} h={ch}/>
              <text x={labelX} y={WTOP-5} textAnchor="middle" fontSize={9} fill="#1a6fbf" fontWeight={700} fontFamily="monospace">{wi.id}</text>
              <text x={labelX} y={WTOP+labelYOff} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{c.width}x{ch}x{d}</text>
            </g>);
          });
          return wallEls;
        })()}

        {wallItems.length > 0 && (() => {
          const mn = Math.min(...wallItems.map(p=>p.x)), mx = Math.max(...wallItems.map(p=>p.x+p.w*SC)), dd = dp(12);
          return <g><line x1={mn} y1={WTOP} x2={mx} y2={WTOP} stroke="#444" strokeWidth={1}/><line x1={mx} y1={WTOP} x2={mx+dd.x} y2={WTOP+dd.y} stroke="#666" strokeWidth={0.5}/></g>;
        })()}
        <line x1={0} y1={FLOOR} x2={svgW} y2={FLOOR} stroke="#e0e0e0" strokeWidth={0.5}/>
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
const EMPTY_SPEC = { base_layout: [], wall_layout: [], alignment: [], cabinets: [] };

function EditorApp({ roomId, projectId, projectName, onBack }) {
  const { spec, dispatch, undo, redo, canUndo, canRedo } = useSpecState(EMPTY_SPEC);
  const [tab, setTab] = useState("render");
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState(null);
  const [mode, setMode] = useState("home"); // home | loaded
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [wireframePreview, setWireframePreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [wireframeFile, setWireframeFile] = useState(null);
  const [dragTarget, setDragTarget] = useState(null); // "photo" | "wireframe" | null
  const photoInputRef = useRef(null);
  const wireInputRef = useRef(null);

  const [selectedId, setSelectedId] = useState(null);
  const [selectedGapItem, setSelectedGapItem] = useState(null);
  const [renderCtxMenu, setRenderCtxMenu] = useState(null); // { x, y, id, row }
  const [isDragging, setIsDragging] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [exampleHover, setExampleHover] = useState(false);

  // Ref to the width input in the bottom bar — passed to GridEditor for double-click focus
  const widthInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Auto-save (when inside a project/room context) ──
  // ── Auto-save — uses refs to avoid re-render cascades ──
  const specVersionRef = useRef(0);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const saveTimer = useRef(null);
  const pendingSave = useRef(false);
  const lastSaveTime = useRef(Date.now());
  const specRef = useRef(spec);
  const modeRef = useRef(mode);
  specRef.current = spec;
  modeRef.current = mode;

  // Load spec from DB when a roomId is provided
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      try {
        const r = await api.getRoom(roomId);
        if (r.spec) {
          r.spec.cabinets?.forEach(c => {
            if (!c.depth) c.depth = c.row === "wall" ? 12 : 24;
            if (!c.height) c.height = c.row === "wall" ? 30 : 34.5;
            if (!c.width) c.width = 24;
          });
          dispatch({ type: "LOAD_SPEC", spec: r.spec });
          setMode("loaded"); setTab("render");
        }
        specVersionRef.current = r.spec_version || 0;
        if (r.photo_url) setPhotoPreview(api.imageUrl(r.photo_url));
        if (r.wireframe_url) setWireframePreview(api.imageUrl(r.wireframe_url));
      } catch (e) { console.error("Failed to load room:", e); }
    })();
  }, [roomId]);

  // doSave reads from refs — no spec/version in deps, no re-render cascade
  const doSave = useCallback(async () => {
    if (!roomId || modeRef.current !== "loaded") return;
    pendingSave.current = false;
    setSaveState("saving");
    try {
      const result = await api.saveRoomSpec(roomId, specRef.current, specVersionRef.current);
      specVersionRef.current = result.version;
      setSaveState("saved");
      lastSaveTime.current = Date.now();
      try { localStorage.setItem(`room_spec_${roomId}`, JSON.stringify({ spec: specRef.current, version: result.version, ts: Date.now() })); } catch {}
      setTimeout(() => setSaveState("idle"), 3000);
    } catch (e) {
      setSaveState("error");
      console.error("Auto-save failed:", e);
    }
  }, [roomId]); // only depends on roomId — stable across spec changes

  // Watch spec changes — just set a debounce timer, no re-render
  useEffect(() => {
    if (!roomId || mode !== "loaded") return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(), 1000);
    pendingSave.current = true;
    return () => clearTimeout(saveTimer.current);
  }, [spec, roomId, mode, doSave]);

  // Flush save on unmount (room switch / navigate away)
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
      if (pendingSave.current && roomId) {
        api.beaconSaveSpec(roomId, specRef.current, specVersionRef.current);
      }
    };
  }, [roomId]);

  // Ctrl+S force save
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (roomId && modeRef.current === "loaded") doSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doSave, roomId]);

  // Global keyboard handler for Render tab — arrow keys to nudge/reorder cabinets
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (tab !== "render") return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT" || document.activeElement?.tagName === "TEXTAREA") return;
      if ((e.metaKey||e.ctrlKey) && e.key === "z") { e.preventDefault(); if(e.shiftKey) redo(); else undo(); return; }
      if (!selectedId) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) dispatch({ type: "MOVE_CABINET", id: selectedId, direction: "left" });
        else dispatch({ type: "NUDGE_CABINET", id: selectedId, amount: e.shiftKey ? -0.5 : -1 });
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) dispatch({ type: "MOVE_CABINET", id: selectedId, direction: "right" });
        else dispatch({ type: "NUDGE_CABINET", id: selectedId, amount: e.shiftKey ? 0.5 : 1 });
        return;
      }
      if (e.key === "Escape") { setSelectedId(null); setSelectedGapItem(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        dispatch({ type: "DELETE_CABINET", id: selectedId }); setSelectedId(null); return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const allItems = [...(spec.base_layout || []), ...(spec.wall_layout || [])].filter(i => i.ref);
        const idx = allItems.findIndex(i => i.ref === selectedId);
        if (idx !== -1) {
          const next = e.shiftKey
            ? allItems[(idx - 1 + allItems.length) % allItems.length]
            : allItems[(idx + 1) % allItems.length];
          if (next) setSelectedId(next.ref);
        }
        return;
      }
      if ((e.key === "d" || e.key === "D") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const cabMap2 = {}; (spec.cabinets || []).forEach(c => { cabMap2[c.id] = c; });
        const sel2 = cabMap2[selectedId]; if (!sel2) return;
        const newId = sel2.row === "base" ? `B${Date.now() % 10000}` : `W${Date.now() % 10000}`;
        dispatch({ type: "DUPLICATE_CABINET", id: selectedId, newId });
        setSelectedId(newId);
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tab, selectedId, spec, dispatch, undo, redo]);

  const loadWireframe = () => { dispatch({ type: "LOAD_SPEC", spec: JSON.parse(JSON.stringify(WIREFRAME_SPEC)) }); setMode("loaded"); setTab("render"); };

  const loadJSON = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!parsed.cabinets?.length) throw new Error("No cabinets array found");
      parsed.cabinets.forEach(c => { if(!c.depth) c.depth = c.row==="wall"?12:24; if(!c.height) c.height = c.row==="wall"?30:34.5; if(!c.width) c.width=24; });
      dispatch({ type: "LOAD_SPEC", spec: parsed });
      setMode("loaded");
      setTab("render");
      setJsonError(null);
    } catch(e) { setJsonError(String(e.message)); }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target?.files?.[0] || e;
    if (!file || !(file instanceof File)) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setUploadStatus(""); // Clear any previous error
    if (roomId) api.uploadImage(roomId, file, "photo").catch(err => console.error("Photo upload:", err));
  };

  const handleWireframeUpload = (e) => {
    const file = e.target?.files?.[0] || e;
    if (!file || !(file instanceof File)) return;
    setWireframeFile(file);
    setWireframePreview(URL.createObjectURL(file));
    setUploadStatus(""); // Clear any previous error
    if (roomId) api.uploadImage(roomId, file, "wireframe").catch(err => console.error("Wireframe upload:", err));
  };

  const handleExtract = () => {
    if (wireframeFile && photoFile) runExtraction(wireframeFile, photoFile);
  };

  const handleCardDrop = (which) => (e) => {
    e.preventDefault(); e.stopPropagation(); setDragTarget(null);
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (which === "photo") handlePhotoUpload(file);
    else handleWireframeUpload(file);
  };

  const handleCardDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleCardDragEnter = (which) => (e) => { e.preventDefault(); e.stopPropagation(); setDragTarget(which); };
  const handleCardDragLeave = (which) => (e) => { e.preventDefault(); e.stopPropagation(); if (dragTarget === which) setDragTarget(null); };

  const runExtraction = async (wireframe, photo) => {
    if (!wireframe) return;
    setUploading(true);
    setUploadStatus("Uploading...");
    setJsonError(null);
    try {
      setUploadStatus(photo ? "Analyzing photo + wireframe with AI..." : "Analyzing wireframe with AI...");
      const formData = new FormData();
      formData.append("image", wireframe);
      if (photo) formData.append("photo", photo);
      const resp = await fetch("http://localhost:8001/api/extract", { method: "POST", body: formData });
      if (!resp.ok) {
        let detail = "";
        try { const j = await resp.json(); detail = j.detail || JSON.stringify(j); } catch { detail = await resp.text(); }
        throw new Error(detail || `Server error ${resp.status}`);
      }
      const extracted = await resp.json();
      setUploadStatus(`Extracted ${extracted.cabinets?.length || 0} cabinets`);
      extracted.cabinets?.forEach(c => { if(!c.depth) c.depth = c.row==="wall"?12:24; if(!c.height) c.height = c.row==="wall"?30:34.5; if(!c.width) c.width=24; });
      dispatch({ type: "LOAD_SPEC", spec: extracted });
      setMode("loaded"); setTab("render");
    } catch(err) { setUploadStatus(`Error: ${err.message}`); }
    finally { setUploading(false); }
  };

  const reset = () => {
    dispatch({ type: "LOAD_SPEC", spec: { base_layout: [], wall_layout: [], alignment: [], cabinets: [] } });
    setMode("home"); setJsonInput(""); setJsonError(null); setWireframePreview(null); setWireframeFile(null); setPhotoFile(null); setPhotoPreview(null); setUploadStatus(""); setDragTarget(null);
    setSelectedId(null); setSelectedGapItem(null);
  };

  const handleSelect = (id) => {
    setSelectedId(id);
    if (id) setSelectedGapItem(null);
  };

  const handleGapSelect = (item) => {
    setSelectedGapItem(item);
    if (item) setSelectedId(null);
  };

  const hasSpec = mode === "loaded" && spec;

  // Count cabinets (refs in layouts, not appliances)
  const cabCount = hasSpec
    ? [...(spec.base_layout||[]), ...(spec.wall_layout||[])].filter(i => i.ref).length
    : 0;

  return (
    <div style={{minHeight:"100vh",background:"#06060c",color:"#ddd",fontFamily:"'DM Sans',-apple-system,sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        textarea{font-family:'JetBrains Mono',monospace}
      `}</style>

      <div style={{padding:"16px 20px 12px",borderBottom:"1px solid #1a1a2a",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        {onBack ? (
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span onClick={onBack} style={{color:"#666",fontSize:12,cursor:"pointer"}}
              onMouseEnter={e=>e.target.style.color="#ddd"} onMouseLeave={e=>e.target.style.color="#666"}>← Projects</span>
            <span style={{width:1,height:16,background:"#1a1a2a"}}/>
            <h1 style={{fontSize:16,fontWeight:700,margin:0,letterSpacing:"-0.02em",color:"#eee"}}>{projectName || "Project"}</h1>
            {saveState === "saving" && <span style={{fontSize:10,color:"#888",fontFamily:"'JetBrains Mono',monospace"}}>Saving...</span>}
            {saveState === "saved" && <span style={{fontSize:10,color:"#22c55e",opacity:0.6,fontFamily:"'JetBrains Mono',monospace"}}>✓ Saved</span>}
            {saveState === "error" && <span style={{fontSize:10,color:"#e04040",fontFamily:"'JetBrains Mono',monospace"}}>Save failed</span>}
          </div>
        ) : (
          <h1 style={{fontSize:16,fontWeight:700,margin:0,letterSpacing:"-0.02em",color:"#eee"}}>Cabinet Spec Tool</h1>
        )}
        {hasSpec && (
          <div style={{display:"flex",gap:3}}>
            {["render","plan","json"].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{
                background:tab===t?"#1a1a2a":"transparent",color:tab===t?"#fff":"#555",
                border:`1px solid ${tab===t?"#2a2a3a":"transparent"}`,
                padding:"4px 10px",borderRadius:5,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"
              }}>{t==="render"?"Render":t==="plan"?"Plan":"JSON"}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{padding:"14px 20px"}}>
        {mode === "home" && (
          <div style={{maxWidth:640,margin:"0 auto"}}>
            {/* Hero */}
            <div style={{textAlign:"center",paddingTop:40,paddingBottom:24}}>
              <div style={{fontSize:22,fontWeight:700,color:"#eee",letterSpacing:"-0.03em",marginBottom:6}}>New Extraction</div>
              <div style={{fontSize:13,color:"#555"}}>Upload both images to extract cabinet specs</div>
            </div>

            {/* Step indicators */}
            <div style={{display:"flex",justifyContent:"center",gap:0,marginBottom:24,fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:22,height:22,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,
                  background:photoPreview?"#22c55e":"#1a1a2a",color:photoPreview?"#000":"#555",border:!photoPreview?"1px solid #2a2a3a":"none"}}>
                  {photoPreview?"✓":"1"}
                </span>
                <span style={{color:photoPreview?"#22c55e":"#888",fontWeight:600}}>Photo</span>
              </div>
              <span style={{color:"#333",margin:"0 12px",alignSelf:"center"}}>→</span>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:22,height:22,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,
                  background:wireframePreview?"#22c55e":"#1a1a2a",color:wireframePreview?"#000":"#555",border:!wireframePreview?"1px solid #2a2a3a":"none"}}>
                  {wireframePreview?"✓":"2"}
                </span>
                <span style={{color:wireframePreview?"#22c55e":"#888",fontWeight:600}}>Wireframe</span>
              </div>
              <span style={{color:"#333",margin:"0 12px",alignSelf:"center"}}>→</span>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:22,height:22,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,
                  background:uploading?"#D94420":"#1a1a2a",color:uploading?"#fff":"#555",border:!uploading?"1px solid #2a2a3a":"none"}}>
                  3
                </span>
                <span style={{color:uploading?"#D94420":"#888",fontWeight:600}}>Extract</span>
              </div>
            </div>

            {/* Two upload cards */}
            <div style={{display:"flex",gap:14,marginBottom:16,flexWrap:"wrap"}}>
              {/* Photo Card */}
              <div
                onClick={()=>!uploading && photoInputRef.current?.click()}
                onDragOver={handleCardDragOver} onDragEnter={handleCardDragEnter("photo")} onDragLeave={handleCardDragLeave("photo")} onDrop={handleCardDrop("photo")}
                style={{
                  flex:1,minWidth:240,minHeight:220,background:"#0c0c14",cursor:"pointer",
                  border:photoPreview?"2px solid #22c55e":dragTarget==="photo"?"2px dashed #D94420":"2px dashed #2a2a3a",
                  borderRadius:12,padding:"20px 16px",textAlign:"center",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  transition:"border-color 0.15s"
                }}
              >
                <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} style={{display:"none"}} />
                {photoPreview ? (
                  <>
                    <img src={photoPreview} style={{maxWidth:"100%",maxHeight:140,borderRadius:8,border:"1px solid #2a2a3a",objectFit:"cover",boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}} />
                    <div style={{marginTop:8,fontSize:11,color:"#22c55e",fontWeight:600}}>✓ Photo ready</div>
                    <div onClick={(e)=>{e.stopPropagation();setPhotoFile(null);setPhotoPreview(null);}} style={{marginTop:4,fontSize:10,color:"#666",textDecoration:"underline",cursor:"pointer"}}>Change</div>
                  </>
                ) : (
                  <>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{marginBottom:10,opacity:0.5}}>
                      <rect x="3" y="3" width="18" height="18" rx="3" stroke={dragTarget==="photo"?"#D94420":"#666"} strokeWidth="1.5"/>
                      <circle cx="8.5" cy="8.5" r="2" stroke={dragTarget==="photo"?"#D94420":"#666"} strokeWidth="1.5"/>
                      <path d="M3 16l5-5 4 4 3-3 6 6" stroke={dragTarget==="photo"?"#D94420":"#666"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div style={{fontSize:13,fontWeight:600,color:dragTarget==="photo"?"#D94420":"#bbb"}}>Drop photo here</div>
                    <div style={{fontSize:11,color:"#555",marginTop:4}}>or click to browse</div>
                    <div style={{fontSize:10,color:"#444",marginTop:10,fontFamily:"'JetBrains Mono',monospace"}}>Original room photo</div>
                  </>
                )}
              </div>

              {/* Wireframe Card */}
              <div
                onClick={()=>!uploading && wireInputRef.current?.click()}
                onDragOver={handleCardDragOver} onDragEnter={handleCardDragEnter("wireframe")} onDragLeave={handleCardDragLeave("wireframe")} onDrop={handleCardDrop("wireframe")}
                style={{
                  flex:1,minWidth:240,minHeight:220,background:"#0c0c14",cursor:"pointer",
                  border:wireframePreview?"2px solid #22c55e":dragTarget==="wireframe"?"2px dashed #D94420":"2px dashed #2a2a3a",
                  borderRadius:12,padding:"20px 16px",textAlign:"center",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  transition:"border-color 0.15s"
                }}
              >
                <input ref={wireInputRef} type="file" accept="image/*" onChange={handleWireframeUpload} disabled={uploading} style={{display:"none"}} />
                {wireframePreview ? (
                  <>
                    <img src={wireframePreview} style={{maxWidth:"100%",maxHeight:140,borderRadius:8,border:"1px solid #2a2a3a",objectFit:"cover",boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}} />
                    <div style={{marginTop:8,fontSize:11,color:"#22c55e",fontWeight:600}}>✓ Wireframe ready</div>
                    <div onClick={(e)=>{e.stopPropagation();setWireframeFile(null);setWireframePreview(null);}} style={{marginTop:4,fontSize:10,color:"#666",textDecoration:"underline",cursor:"pointer"}}>Change</div>
                  </>
                ) : (
                  <>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{marginBottom:10,opacity:0.5}}>
                      <rect x="3" y="3" width="18" height="18" rx="2" stroke={dragTarget==="wireframe"?"#D94420":"#666"} strokeWidth="1.5"/>
                      <line x1="3" y1="9" x2="21" y2="9" stroke={dragTarget==="wireframe"?"#D94420":"#666"} strokeWidth="1"/>
                      <line x1="9" y1="9" x2="9" y2="21" stroke={dragTarget==="wireframe"?"#D94420":"#666"} strokeWidth="1"/>
                      <line x1="15" y1="9" x2="15" y2="21" stroke={dragTarget==="wireframe"?"#D94420":"#666"} strokeWidth="1"/>
                    </svg>
                    <div style={{fontSize:13,fontWeight:600,color:dragTarget==="wireframe"?"#D94420":"#bbb"}}>Drop wireframe here</div>
                    <div style={{fontSize:11,color:"#555",marginTop:4}}>or click to browse</div>
                    <div style={{fontSize:10,color:"#444",marginTop:10,fontFamily:"'JetBrains Mono',monospace"}}>Cabinet layout drawing</div>
                  </>
                )}
              </div>
            </div>

            {/* Extract Button */}
            {uploading ? (
              <div style={{textAlign:"center",padding:"14px 0",marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:600,color:"#D94420",animation:"pulse 1.5s infinite"}}>{uploadStatus}</div>
              </div>
            ) : (uploadStatus?.startsWith("Error") || jsonError) ? (
              <div style={{textAlign:"center",padding:"8px 0",marginBottom:12}}>
                <div style={{fontSize:12,color:"#e04040",fontWeight:600}}>{uploadStatus || jsonError}</div>
              </div>
            ) : (
              <button onClick={handleExtract} disabled={!photoFile || !wireframeFile || uploading}
                style={{
                  width:"100%",padding:"14px 0",borderRadius:10,fontSize:14,fontWeight:700,cursor:photoFile&&wireframeFile?"pointer":"default",
                  fontFamily:"inherit",border:"none",marginBottom:16,transition:"all 0.15s",letterSpacing:"-0.01em",
                  background:photoFile&&wireframeFile?"#D94420":"#1a1a2a",
                  color:photoFile&&wireframeFile?"#fff":"#444",
                  opacity:photoFile&&wireframeFile?1:0.6
                }}>
                {photoFile && wireframeFile ? "Extract Cabinets with AI" : "Upload both images to continue"}
              </button>
            )}

            {/* Divider + secondary options */}
            <div style={{borderTop:"1px solid #1a1a2a",paddingTop:16,display:"flex",gap:10,alignItems:"center",marginBottom:16}}>
              <button onClick={loadWireframe} onMouseEnter={()=>setExampleHover(true)} onMouseLeave={()=>setExampleHover(false)} style={{
                background:"transparent",color:"#888",border:exampleHover?"1px solid #D94420":"1px solid #2a2a3a",
                padding:"8px 16px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"border-color 0.15s"
              }}>
                Try the Example
              </button>
              <span style={{fontSize:10,color:"#444",fontFamily:"'JetBrains Mono',monospace"}}>12 cabs · 2 rows · range opening</span>
              <span style={{flex:1}}/>
              <span onClick={()=>setJsonOpen(!jsonOpen)} style={{fontSize:11,color:"#555",cursor:"pointer",textDecoration:"underline"}}>
                {jsonOpen ? "Hide" : "Import"} JSON
              </span>
            </div>

            {/* JSON Accordion */}
            {jsonOpen && (
              <div style={{paddingBottom:16}}>
                <textarea
                  value={jsonInput}
                  onChange={e=>setJsonInput(e.target.value)}
                  placeholder='{"base_layout":[...],"wall_layout":[...],"alignment":[...],"cabinets":[...]}'
                  style={{width:"100%",height:100,background:"#0a0a14",border:"1px solid #1a1a2a",borderRadius:8,
                    color:"#aaa",padding:10,fontSize:11,resize:"vertical",fontFamily:"'JetBrains Mono',monospace"}}
                />
                <button onClick={loadJSON} disabled={!jsonInput.trim()} style={{
                  marginTop:8,background:jsonInput.trim()?"#1a6fbf":"#1a1a2a",color:"#fff",border:"none",
                  padding:"8px 16px",borderRadius:6,fontSize:12,fontWeight:600,cursor:jsonInput.trim()?"pointer":"default",fontFamily:"inherit"
                }}>
                  Load JSON
                </button>
                {jsonError && <div style={{marginTop:6,fontSize:11,color:"#e04040"}}>{jsonError}</div>}
              </div>
            )}
          </div>
        )}

        {hasSpec && tab === "render" && (() => {
          const cabMap = {};
          (spec.cabinets || []).forEach(c => { cabMap[c.id] = c; });
          const sel = selectedId ? cabMap[selectedId] : null;
          const selColor = sel?.row === "wall" ? "#1a6fbf" : "#D94420";
          const baseRun = (spec.base_layout||[]).reduce((s,i)=>s+(i.ref?cabMap[i.ref]?.width||0:i.width||0),0);
          const wallRun = (spec.wall_layout||[]).reduce((s,i)=>s+(i.ref?cabMap[i.ref]?.width||0:i.width||0),0);

          return (
            <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 50px)",margin:"-14px -20px 0",padding:0}}>
              {/* Toolbar */}
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"#06060c",borderBottom:"1px solid #1a1a2a",flexShrink:0,fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>
                <button onClick={undo} disabled={!canUndo} style={{background:canUndo?"#1a1a2a":"transparent",border:"1px solid #2a2a3a",color:canUndo?"#e0e0e0":"#333",padding:"4px 10px",borderRadius:4,fontSize:11,cursor:canUndo?"pointer":"default",fontWeight:600}}>Undo</button>
                <button onClick={redo} disabled={!canRedo} style={{background:canRedo?"#1a1a2a":"transparent",border:"1px solid #2a2a3a",color:canRedo?"#e0e0e0":"#333",padding:"4px 10px",borderRadius:4,fontSize:11,cursor:canRedo?"pointer":"default",fontWeight:600}}>Redo</button>
                <span style={{flex:1}}/>
                <span style={{color:"#555",fontWeight:600}}>{cabCount} cabs</span>
                <span style={{color:"#333"}}>|</span>
                <span style={{color:"#D94420",fontWeight:600}}>B:{baseRun}"</span>
                <span style={{color:"#333"}}>|</span>
                <span style={{color:"#1a6fbf",fontWeight:600}}>W:{wallRun}"</span>
              </div>

              {/* Interactive 3D Render */}
              <div style={{flex:"1 1 auto",overflow:"auto",background:"#fff"}} onClick={()=>setRenderCtxMenu(null)}>
                <InteractiveRender spec={spec} selectedId={selectedId} onSelect={(id)=>{handleSelect(id);setRenderCtxMenu(null);}}
                  onDoubleClick={(id)=>{setSelectedId(id);setTimeout(()=>{if(widthInputRef.current){widthInputRef.current.focus();widthInputRef.current.select();}},50);}}
                  onContextMenu={(ctx)=>setRenderCtxMenu(ctx)}
                  onGapSelect={(item)=>{
                    setSelectedId(null);setRenderCtxMenu(null);
                    // Enrich with rowName/idx like Plan tab does
                    const bIdx=(spec.base_layout||[]).indexOf(item);
                    const wIdx=bIdx===-1?(spec.wall_layout||[]).indexOf(item):-1;
                    const rowName=bIdx!==-1?"base":"wall";
                    const idx=bIdx!==-1?bIdx:wIdx;
                    setSelectedGapItem({...item, entry:item, rowName, idx, w:item.width||0});
                  }}
                  onNudge={(id,amount)=>dispatch({type:"NUDGE_CABINET",id,amount})}
                />
                {/* Context menu */}
                {renderCtxMenu && (()=>{
                  const cabMap2={}; (spec.cabinets||[]).forEach(c=>{cabMap2[c.id]=c;});
                  const ctxCab=cabMap2[renderCtxMenu.id];
                  if(!ctxCab) return null;
                  const items=[
                    {label:"Duplicate (⌘D)",action:()=>{const newId=ctxCab.row==="base"?`B${Date.now()%10000}`:`W${Date.now()%10000}`;dispatch({type:"DUPLICATE_CABINET",id:renderCtxMenu.id,newId});setSelectedId(newId);setRenderCtxMenu(null);}},
                    {label:"Set Width…",action:()=>{setSelectedId(renderCtxMenu.id);setRenderCtxMenu(null);setTimeout(()=>{if(widthInputRef.current){widthInputRef.current.focus();widthInputRef.current.select();}},50);}},
                    {label:"+ Space Left",action:()=>{const layout=spec[ctxCab.row==="base"?"base_layout":"wall_layout"]||[];const pos=layout.findIndex(i=>i.ref===renderCtxMenu.id);dispatch({type:"ADD_GAP",row:ctxCab.row,position:Math.max(pos,0),gap:{type:"filler",label:"Filler",width:3}});setRenderCtxMenu(null);}},
                    {label:"+ Space Right",action:()=>{const layout=spec[ctxCab.row==="base"?"base_layout":"wall_layout"]||[];const pos=layout.findIndex(i=>i.ref===renderCtxMenu.id);dispatch({type:"ADD_GAP",row:ctxCab.row,position:pos+1,gap:{type:"filler",label:"Filler",width:3}});setRenderCtxMenu(null);}},
                    {label:"Delete",action:()=>{dispatch({type:"DELETE_CABINET",id:renderCtxMenu.id});setSelectedId(null);setRenderCtxMenu(null);},color:"#e04040"},
                  ];
                  return <div style={{position:"fixed",left:renderCtxMenu.x,top:renderCtxMenu.y,background:"#1a1a2a",border:"1px solid #2a2a3a",borderRadius:8,padding:4,zIndex:9999,minWidth:160,boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}
                    onClick={e=>e.stopPropagation()}>
                    {items.map((it,i)=><div key={i} onClick={it.action}
                      style={{padding:"6px 12px",fontSize:12,color:it.color||"#ddd",cursor:"pointer",borderRadius:4,fontFamily:"'DM Sans',sans-serif"}}
                      onMouseEnter={e=>e.target.style.background="#2a2a3a"} onMouseLeave={e=>e.target.style.background="transparent"}>
                      {it.label}
                    </div>)}
                  </div>;
                })()}
              </div>

              {/* Bottom bar — cabinet selected */}
              {sel && !selectedGapItem && (
                <CabinetEditBar
                  cab={sel} spec={spec} dispatch={dispatch} selColor={selColor}
                  widthInputRef={widthInputRef}
                  onSelectNext={() => {
                    const allRefs=[...(spec.base_layout||[]),...(spec.wall_layout||[])].filter(i=>i.ref);
                    const idx=allRefs.findIndex(i=>i.ref===sel.id);
                    if(idx!==-1&&idx<allRefs.length-1){setSelectedId(allRefs[idx+1].ref);setTimeout(()=>{if(widthInputRef.current){widthInputRef.current.focus();widthInputRef.current.select();}},50);}
                  }}
                  onSelectId={setSelectedId}
                  onMoveLeft={() => dispatch({ type: "NUDGE_CABINET", id: sel.id, amount: -3 })}
                  onMoveRight={() => dispatch({ type: "NUDGE_CABINET", id: sel.id, amount: 3 })}
                  onDelete={() => { dispatch({type:"DELETE_CABINET",id:sel.id}); setSelectedId(null); }}
                  onAddGap={() => {
                    const layout=spec[sel.row==="base"?"base_layout":"wall_layout"]||[];
                    const pos=layout.findIndex(i=>i.ref===sel.id);
                    dispatch({type:"ADD_GAP",row:sel.row,position:Math.max(pos,0),gap:{type:"filler",label:"Filler",width:3}});
                  }}
                  onAddCab={() => {
                    const id=generateId(sel.row,spec),cab=defaultCabinet(sel.row);cab.id=id;
                    const layout=spec[sel.row==="base"?"base_layout":"wall_layout"]||[];
                    const pos=layout.findIndex(i=>i.ref===sel.id);
                    dispatch({type:"ADD_CABINET",row:sel.row,position:pos+1,cabinet:cab});setSelectedId(id);
                  }}
                />
              )}

              {/* Bottom bar — gap selected */}
              {!sel && selectedGapItem && (
                <div key={`gap-${selectedGapItem.rowName}-${selectedGapItem.idx}`} style={{flexShrink:0,background:"#0c0c14",borderTop:"1px solid #1a1a2a",padding:"8px 10px",display:"flex",alignItems:"center",gap:8,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>
                  <span style={{color:"#555"}}>name</span>
                  <input type="text"
                    defaultValue={selectedGapItem.entry?.label||""}
                    placeholder="Opening"
                    onBlur={e=>{const v=e.target.value.trim();dispatch({type:"UPDATE_GAP",row:selectedGapItem.rowName,position:selectedGapItem.idx,updates:{label:v}});}}
                    onKeyDown={e=>{if(e.key==="Enter")e.target.blur();}}
                    style={{width:90,height:28,background:"#0a0a14",border:"1px solid #2a2a3a",borderRadius:4,color:"#fff",textAlign:"center",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}
                  />
                  <span style={{color:"#555"}}>width</span>
                  <input type="number"
                    defaultValue={selectedGapItem.w||0}
                    onKeyDown={e=>{if(e.key==="Enter"){const v=parseFloat(e.target.value);if(!isNaN(v)&&v>0){dispatch({type:"UPDATE_GAP",row:selectedGapItem.rowName,position:selectedGapItem.idx,updates:{width:v}});e.target.blur();}}}}
                    onBlur={e=>{const v=parseFloat(e.target.value);if(!isNaN(v)&&v>0)dispatch({type:"UPDATE_GAP",row:selectedGapItem.rowName,position:selectedGapItem.idx,updates:{width:v}});}}
                    style={{width:50,height:28,background:"#0a0a14",border:"1px solid #2a2a3a",borderRadius:4,color:"#fff",textAlign:"center",fontSize:13,fontFamily:"'JetBrains Mono',monospace"}}
                  />"
                  <span style={{flex:1}}/>
                  <button onClick={()=>{dispatch({type:"DELETE_GAP",row:selectedGapItem.rowName,position:selectedGapItem.idx});setSelectedGapItem(null);}} style={{height:28,padding:"0 10px",borderRadius:4,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#e04040",fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Del</button>
                  <button onClick={()=>setSelectedGapItem(null)} style={{height:28,padding:"0 10px",borderRadius:4,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#888",fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Done</button>
                </div>
              )}

              {/* Bottom bar — nothing selected */}
              {!sel && !selectedGapItem && (
                <div style={{flexShrink:0,background:"#0c0c14",borderTop:"1px solid #1a1a2a",padding:"8px 10px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:"#444",fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>Click a cabinet to edit. <span style={{color:"#333"}}>Tab: next · ⌘D: duplicate · Right-click: more</span></span>
                  <span style={{flex:1}}/>
                  <button onClick={()=>{
                    const id=generateId("base",spec),cab=defaultCabinet("base");cab.id=id;
                    dispatch({type:"ADD_CABINET",row:"base",position:(spec.base_layout||[]).length,cabinet:cab});setSelectedId(id);
                  }} style={{height:32,padding:"0 10px",borderRadius:6,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#D94420",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>+ Base</button>
                  <button onClick={()=>{
                    const id=generateId("wall",spec),cab=defaultCabinet("wall");cab.id=id;
                    dispatch({type:"ADD_CABINET",row:"wall",position:(spec.wall_layout||[]).length,cabinet:cab});setSelectedId(id);
                  }} style={{height:32,padding:"0 10px",borderRadius:6,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#1a6fbf",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>+ Wall</button>
                  <button onClick={reset} style={{height:32,padding:"0 10px",borderRadius:6,background:"transparent",border:"1px solid #2a2a3a",color:"#555",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Start Over</button>
                </div>
              )}
            </div>
          );
        })()}

        {hasSpec && tab === "plan" && (() => {
          const cabMap = {};
          (spec.cabinets || []).forEach(c => { cabMap[c.id] = c; });
          const sel = selectedId ? cabMap[selectedId] : null;
          const selColor = sel?.row === "wall" ? "#1a6fbf" : "#D94420";
          const baseRun = (spec.base_layout||[]).reduce((s,i)=>s+(i.ref?cabMap[i.ref]?.width||0:i.width||0),0);
          const wallRun = (spec.wall_layout||[]).reduce((s,i)=>s+(i.ref?cabMap[i.ref]?.width||0:i.width||0),0);

          return (
            <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 50px)",margin:"-14px -20px 0",padding:0}}>
              {/* Toolbar — compact */}
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"#06060c",borderBottom:"1px solid #1a1a2a",flexShrink:0,fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>
                <button onClick={undo} disabled={!canUndo} style={{background:canUndo?"#1a1a2a":"transparent",border:"1px solid #2a2a3a",color:canUndo?"#e0e0e0":"#333",padding:"4px 10px",borderRadius:4,fontSize:11,cursor:canUndo?"pointer":"default",fontWeight:600}}>Undo</button>
                <button onClick={redo} disabled={!canRedo} style={{background:canRedo?"#1a1a2a":"transparent",border:"1px solid #2a2a3a",color:canRedo?"#e0e0e0":"#333",padding:"4px 10px",borderRadius:4,fontSize:11,cursor:canRedo?"pointer":"default",fontWeight:600}}>Redo</button>
                <span style={{flex:1}}/>
                {/* #3: Cabinet count */}
                <span style={{color:"#555",fontWeight:600}}>{cabCount} cabs</span>
                <span style={{color:"#333"}}>|</span>
                <span style={{color:"#D94420",fontWeight:600}}>B:{baseRun}"</span>
                <span style={{color:"#333"}}>|</span>
                <span style={{color:"#1a6fbf",fontWeight:600}}>W:{wallRun}"</span>
              </div>

              {/* Grid — the editor. Click to select. Drag to reorder. Edge-drag to resize. */}
              <div style={{flex:"1 1 auto",overflow:"auto"}}>
                <GridEditor
                  spec={spec}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  dispatch={dispatch}
                  widthInputRef={widthInputRef}
                  onGapSelect={handleGapSelect}
                  selectedGapItem={selectedGapItem}
                  undo={undo}
                  redo={redo}
                />
              </div>

              {/* Bottom bar — gap selected */}
              {selectedGapItem && !sel && (
                <div key={`gap-${selectedGapItem.rowName}-${selectedGapItem.idx}`} style={{flexShrink:0,background:"#0c0c14",borderTop:"1px solid #1a1a2a",padding:"8px 10px",display:"flex",alignItems:"center",gap:8}}>
                  <input
                    type="text"
                    defaultValue={selectedGapItem.entry?.label||"Opening"}
                    onFocus={e=>e.target.select()}
                    onBlur={e=>{const v=e.target.value.trim();if(v)dispatch({type:"UPDATE_GAP",row:selectedGapItem.rowName,position:selectedGapItem.idx,updates:{label:v}});}}
                    onKeyDown={e=>{if(e.key==="Enter"){e.target.blur();}if(e.key==="Escape")setSelectedGapItem(null);}}
                    style={{width:100,height:36,background:"#14141e",border:"1px solid #2a2a3a",borderRadius:6,color:"#888",fontSize:13,textAlign:"center",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}
                  />
                  <input
                    type="number"
                    defaultValue={selectedGapItem.w||0}
                    onFocus={e=>e.target.select()}
                    onKeyDown={e=>{
                      if(e.key==="Enter"){const v=parseFloat(e.target.value);if(!isNaN(v)&&v>0){dispatch({type:"UPDATE_GAP",row:selectedGapItem.rowName,position:selectedGapItem.idx,updates:{width:v}});e.target.blur();}}
                      if(e.key==="Escape")setSelectedGapItem(null);
                    }}
                    onBlur={e=>{const v=parseFloat(e.target.value);if(!isNaN(v)&&v>0)dispatch({type:"UPDATE_GAP",row:selectedGapItem.rowName,position:selectedGapItem.idx,updates:{width:v}});}}
                    style={{width:64,height:36,background:"#14141e",border:"2px solid #555",borderRadius:6,color:"#fff",fontSize:16,textAlign:"center",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}
                  />
                  <span style={{color:"#555",fontSize:14,fontFamily:"'JetBrains Mono',monospace"}}>w</span>
                  <span style={{flex:1}}/>
                  <button onClick={()=>{dispatch({type:"DELETE_GAP",row:selectedGapItem.rowName,position:selectedGapItem.idx});setSelectedGapItem(null);}} style={{height:32,padding:"0 10px",borderRadius:6,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#e04040",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Del</button>
                  <button onClick={()=>setSelectedGapItem(null)} style={{height:32,padding:"0 10px",borderRadius:6,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#666",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Close</button>
                </div>
              )}

              {/* Bottom bar — cabinet selected */}
              {sel && !selectedGapItem && (
                <CabinetEditBar
                  cab={sel}
                  spec={spec}
                  dispatch={dispatch}
                  selColor={selColor}
                  widthInputRef={widthInputRef}
                  onSelectNext={() => {
                    const allRefs=[...(spec.base_layout||[]),...(spec.wall_layout||[])].filter(i=>i.ref);
                    const idx=allRefs.findIndex(i=>i.ref===sel.id);
                    if(idx!==-1&&idx<allRefs.length-1){setSelectedId(allRefs[idx+1].ref);setTimeout(()=>{if(widthInputRef.current){widthInputRef.current.focus();widthInputRef.current.select();}},50);}
                  }}
                  onSelectId={setSelectedId}
                  onDelete={() => { dispatch({type:"DELETE_CABINET",id:sel.id}); setSelectedId(null); }}
                  onAddGap={() => {
                    const layout=spec[sel.row==="base"?"base_layout":"wall_layout"]||[];
                    const pos=layout.findIndex(i=>i.ref===sel.id);
                    dispatch({type:"ADD_GAP",row:sel.row,position:Math.max(pos,0),gap:{type:"filler",label:"Filler",width:3}});
                  }}
                  onAddCab={() => {
                    const id=generateId(sel.row,spec),cab=defaultCabinet(sel.row);cab.id=id;
                    const layout=spec[sel.row==="base"?"base_layout":"wall_layout"]||[];
                    const pos=layout.findIndex(i=>i.ref===sel.id);
                    dispatch({type:"ADD_CABINET",row:sel.row,position:pos+1,cabinet:cab});setSelectedId(id);
                  }}
                />
              )}

              {/* Bottom bar — nothing selected */}
              {!sel && !selectedGapItem && (
                <div style={{flexShrink:0,background:"#0c0c14",borderTop:"1px solid #1a1a2a",padding:"8px 10px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:"#444",fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>Click to edit. Drag to reorder.</span>
                  <span style={{color:"#333",fontSize:9,fontFamily:"'JetBrains Mono',monospace"}}>Esc deselect</span>
                  <span style={{flex:1}}/>
                  <button onClick={()=>{
                    const id=generateId("base",spec),cab=defaultCabinet("base");cab.id=id;
                    dispatch({type:"ADD_CABINET",row:"base",position:(spec.base_layout||[]).length,cabinet:cab});setSelectedId(id);
                  }} style={{height:32,padding:"0 10px",borderRadius:6,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#D94420",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>+ Base</button>
                  <button onClick={()=>{
                    const id=generateId("wall",spec),cab=defaultCabinet("wall");cab.id=id;
                    dispatch({type:"ADD_CABINET",row:"wall",position:(spec.wall_layout||[]).length,cabinet:cab});setSelectedId(id);
                  }} style={{height:32,padding:"0 10px",borderRadius:6,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#1a6fbf",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>+ Wall</button>
                </div>
              )}
            </div>
          );
        })()}

        {hasSpec && tab === "json" && (
          <pre style={{background:"#0a0a14",border:"1px solid #1a1a2a",borderRadius:10,
            padding:14,fontSize:10.5,lineHeight:1.5,color:"#888",
            fontFamily:"'JetBrains Mono',monospace",overflow:"auto",maxHeight:"calc(100vh - 140px)"}}>
            {JSON.stringify(spec,null,2)}
          </pre>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// PROJECT EDITOR WRAPPER — loads project context, passes to EditorApp
// ═══════════════════════════════════════════════════════════
function ProjectEditorWrapper() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState(null);
  const [activeRoomId, setActiveRoomId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.getProject(projectId);
        setProject(p);
        const roomParam = searchParams.get("room");
        if (roomParam && p.rooms?.some(r => r.id === roomParam)) {
          setActiveRoomId(roomParam);
        } else if (p.rooms?.length > 0) {
          setActiveRoomId(p.rooms[0].id);
        } else {
          // Auto-create first room
          const r = await api.createRoom(projectId);
          setProject(prev => ({ ...prev, rooms: [r] }));
          setActiveRoomId(r.id);
        }
      } catch (e) { console.error("Failed to load project:", e); }
    })();
  }, [projectId]);

  if (!project || !activeRoomId) {
    return <div style={{minHeight:"100vh",background:"#06060c",color:"#555",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>Loading...</div>;
  }

  return (
    <EditorApp
      key={activeRoomId}
      roomId={activeRoomId}
      projectId={projectId}
      projectName={project.name}
      onBack={() => navigate("/")}
    />
  );
}


// ═══════════════════════════════════════════════════════════
// APP — routing shell
// ═══════════════════════════════════════════════════════════
export default function App() {
  return (
    <Routes>
      <Route path="/" element={
        <div style={{minHeight:"100vh",background:"#06060c",color:"#ddd",fontFamily:"'DM Sans',-apple-system,sans-serif"}}>
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
            *{box-sizing:border-box}
            ::-webkit-scrollbar{width:5px}
            ::-webkit-scrollbar-track{background:transparent}
            ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
          `}</style>
          <div style={{padding:"16px 20px 12px",borderBottom:"1px solid #1a1a2a"}}>
            <h1 style={{fontSize:16,fontWeight:700,margin:0,letterSpacing:"-0.02em",color:"#eee"}}>Cabinet Spec Tool</h1>
          </div>
          <div style={{padding:"0 0 20px"}}><ProjectList /></div>
        </div>
      } />
      <Route path="/project/:projectId" element={<ProjectEditorWrapper />} />
    </Routes>
  );
}
