import { useState, useCallback, useRef } from "react";

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
  const wallItems = []; let wx = PAD;
  (spec.wall_layout||[]).forEach(item => {
    const id = item.ref||item.id, cab = cabMap[id], w = cab?cab.width:(item.width||30);
    if (aMap[id] && bMap[aMap[id]]) wx = bMap[aMap[id]].x;
    wallItems.push({ id, x:wx, w, cab, item }); wx += w*SC;
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

        {baseItems.map(bi => {
          if (!bi.cab) {
            const isFridge = bi.id==="fridge"||bi.item?.label?.toLowerCase()?.includes("fridge");
            const h = isFridge?70:34.5, cy = isFridge?(FLOOR-h*SC):(FLOOR-TOE-34.5*SC);
            return (<g key={`a-${bi.id}`}>
              <Box3D cx={bi.x} cy={cy} w={bi.w} h={h} depth={isFridge?28:24} front="#f8f8f8" top="#eee" side="#e0e0e0" stroke="#aaa" sw={0.7} dash="5,3"/>
              <text x={bi.x+bi.w*SC/2} y={cy+(h*SC)/2+3} textAnchor="middle" fontSize={8} fill="#aaa" fontFamily="monospace">{(bi.item?.label||bi.id).toUpperCase()}</text>
              <text x={bi.x+bi.w*SC/2} y={FLOOR+13} textAnchor="middle" fontSize={7} fill="#aaa" fontFamily="monospace">{bi.w}"</text>
            </g>);
          }
          const c = bi.cab, ch = c.height||34.5, d = c.depth||24, cy = FLOOR-TOE-ch*SC;
          return (<g key={`b-${bi.id}`}>
            <Box3D cx={bi.x} cy={cy} w={c.width} h={ch} depth={d}/>
            <rect x={bi.x+2*SC} y={FLOOR-TOE} width={Math.max(0,c.width*SC-4*SC)} height={TOE} fill="none" stroke="#ccc" strokeWidth={0.4}/>
            <Face cab={c} cx={bi.x} cy={cy} w={c.width} h={ch}/>
            <text x={bi.x+c.width*SC/2} y={FLOOR+13} textAnchor="middle" fontSize={9} fill="#D94420" fontWeight={700} fontFamily="monospace">{bi.id}</text>
            <text x={bi.x+c.width*SC/2} y={FLOOR+23} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{c.width}w {ch}h {d}d</text>
          </g>);
        })}

        <Box3D cx={PAD} cy={CTTOP} w={ctW} h={1.5} depth={25.5} front="none" top="none" side="none" stroke="#444" sw={1.3}/>

        {wallItems.map(wi => {
          if (!wi.cab) {
            const hh=16, hy=WBOT+8;
            return (<g key={`h-${wi.id}`}>
              <rect x={wi.x+6} y={hy} width={Math.max(wi.w*SC-12,1)} height={hh} fill="#f4f4f4" stroke="#aaa" strokeWidth={0.7} rx={3}/>
              <text x={wi.x+wi.w*SC/2} y={hy+11} textAnchor="middle" fontSize={7} fill="#aaa" fontFamily="monospace">HOOD</text>
            </g>);
          }
          const c = wi.cab, ch = c.height||30, d = c.depth||12;
          return (<g key={`w-${wi.id}`}>
            <Box3D cx={wi.x} cy={WTOP} w={c.width} h={ch} depth={d} front="#fff" top="#eee" side="#ddd"/>
            <Face cab={c} cx={wi.x} cy={WTOP} w={c.width} h={ch}/>
            <text x={wi.x+c.width*SC/2} y={WTOP-5} textAnchor="middle" fontSize={9} fill="#1a6fbf" fontWeight={700} fontFamily="monospace">{wi.id}</text>
            <text x={wi.x+c.width*SC/2} y={WTOP-15} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{c.width}x{ch}x{d}</text>
          </g>);
        })}

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
// EDITOR
// ═══════════════════════════════════════════════════════════
function Editor({ spec, onChange }) {
  const [ed, setEd] = useState({});
  const gv = (id,f,cur) => { const k=`${id}.${f}`; return k in ed ? ed[k] : cur; };
  const onF = (id,f,v) => setEd(p=>({...p,[`${id}.${f}`]:String(v)}));
  const onB = (id,f) => setEd(p=>{ const n={...p}; delete n[`${id}.${f}`]; return n; });
  const onC = (id,f,raw) => { setEd(p=>({...p,[`${id}.${f}`]:raw})); const v=parseFloat(raw); if(!isNaN(v)&&v>0){const s=JSON.parse(JSON.stringify(spec));const c=s.cabinets.find(x=>x.id===id);if(c){c[f]=v;onChange(s);}}};

  const inp = (id,f,cur,label) => (
    <label key={f} style={{display:"flex",alignItems:"center",gap:3,color:"#888",fontSize:10}}>
      {label}
      <input type="number" value={gv(id,f,cur)} onFocus={()=>onF(id,f,cur)} onChange={e=>onC(id,f,e.target.value)} onBlur={()=>onB(id,f)}
        style={{width:42,background:"#14141e",border:"1px solid #2a2a3a",borderRadius:4,color:"#e0e0e0",padding:"2px 4px",fontSize:11,fontFamily:"'JetBrains Mono',monospace",textAlign:"center"}}/>
    </label>
  );

  const badge = (sec,i) => (
    <span key={i} style={{display:"inline-block",fontSize:9,padding:"1px 5px",marginRight:3,borderRadius:3,fontFamily:"'JetBrains Mono',monospace",
      background:sec.type==="drawer"?"#f972161a":sec.type==="false_front"?"#8b5cf61a":"#22c55e1a",
      color:sec.type==="drawer"?"#f97216":sec.type==="false_front"?"#8b5cf6":"#22c55e"}}>
      {sec.type}{sec.count>1?`x${sec.count}`:""}{sec.height?` ${sec.height}"`:""}{sec.hinge_side?` ${sec.hinge_side}`:""}
    </span>
  );

  const card = (cab,color) => (
    <div key={cab.id} style={{background:"#0c0c14",borderRadius:8,padding:"8px 10px",marginBottom:5,border:"1px solid #1a1a2a"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
        <span style={{color,fontWeight:700,fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>{cab.id}</span>
        <span style={{color:"#555",fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>{cab.type}</span>
        <span style={{color:"#333",flex:1,textAlign:"right",fontSize:9}}>{cab.label}</span>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {inp(cab.id,"width",cab.width,"W")}{inp(cab.id,"height",cab.height,"H")}{inp(cab.id,"depth",cab.depth,"D")}
      </div>
      <div style={{marginTop:4}}>{(cab.face?.sections||[]).map(badge)}</div>
    </div>
  );

  return (
    <div style={{fontSize:12,overflow:"auto",maxHeight:"calc(100vh - 140px)"}}>
      <div style={{color:"#D94420",fontWeight:700,fontSize:10,letterSpacing:"0.08em",marginBottom:5,fontFamily:"'JetBrains Mono',monospace"}}>BASE</div>
      {spec.cabinets.filter(c=>c.row==="base").map(c=>card(c,"#D94420"))}
      {(spec.base_layout||[]).filter(i=>!i.ref).length>0 && <div style={{color:"#e07020",fontWeight:700,fontSize:10,letterSpacing:"0.08em",margin:"8px 0 5px",fontFamily:"'JetBrains Mono',monospace"}}>APPLIANCES</div>}
      {(spec.base_layout||[]).filter(i=>!i.ref).map((a,i)=>(
        <div key={i} style={{background:"#0c0c14",borderRadius:8,padding:"6px 10px",marginBottom:5,border:"1px solid #1a1a2a",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>
          <span style={{color:"#e07020"}}>{(a.label||a.id).toUpperCase()}</span><span style={{color:"#555",marginLeft:8}}>{a.width}"</span>
        </div>
      ))}
      <div style={{color:"#1a6fbf",fontWeight:700,fontSize:10,letterSpacing:"0.08em",margin:"8px 0 5px",fontFamily:"'JetBrains Mono',monospace"}}>WALL</div>
      {spec.cabinets.filter(c=>c.row==="wall").map(c=>card(c,"#1a6fbf"))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [spec, setSpec] = useState(null);
  const [tab, setTab] = useState("render");
  const [ver, setVer] = useState(0);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState(null);
  const [mode, setMode] = useState("home"); // home | loaded

  const update = (s) => { setSpec(s); setVer(v=>v+1); };

  const loadWireframe = () => { setSpec(JSON.parse(JSON.stringify(WIREFRAME_SPEC))); setMode("loaded"); setTab("render"); };

  const loadJSON = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!parsed.cabinets?.length) throw new Error("No cabinets array found");
      parsed.cabinets.forEach(c => { if(!c.depth) c.depth = c.row==="wall"?12:24; if(!c.height) c.height = c.row==="wall"?30:34.5; if(!c.width) c.width=24; });
      setSpec(parsed);
      setMode("loaded");
      setTab("render");
      setJsonError(null);
    } catch(e) { setJsonError(String(e.message)); }
  };

  const reset = () => { setSpec(null); setMode("home"); setJsonInput(""); setJsonError(null); setVer(0); };

  const hasSpec = spec?.cabinets?.length > 0;

  return (
    <div style={{minHeight:"100vh",background:"#06060c",color:"#ddd",fontFamily:"'DM Sans',-apple-system,sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        textarea{font-family:'JetBrains Mono',monospace}
      `}</style>

      <div style={{padding:"16px 20px 12px",borderBottom:"1px solid #1a1a2a",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <h1 style={{fontSize:16,fontWeight:700,margin:0,letterSpacing:"-0.02em",color:"#eee"}}>Cabinet Spec Tool</h1>
        {hasSpec && (
          <div style={{display:"flex",gap:3}}>
            {["render","edit","json"].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{
                background:tab===t?"#1a1a2a":"transparent",color:tab===t?"#fff":"#555",
                border:`1px solid ${tab===t?"#2a2a3a":"transparent"}`,
                padding:"4px 10px",borderRadius:5,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"
              }}>{t==="render"?"Render":t==="edit"?"Edit":"JSON"}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{padding:"14px 20px"}}>
        {mode === "home" && (
          <div style={{maxWidth:700}}>
            <p style={{color:"#777",fontSize:13,marginTop:0,marginBottom:16}}>
              Load a cabinet spec to render and edit. Change W, H, D on any cabinet and see the 2.5D wireframe update.
            </p>

            <button onClick={loadWireframe} style={{
              background:"linear-gradient(135deg,#D94420,#e07020)",color:"#fff",border:"none",
              padding:"14px 24px",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",
              fontFamily:"inherit",boxShadow:"0 4px 20px #D9442044",display:"block",marginBottom:16
            }}>
              Load Wireframe Extraction
            </button>
            <div style={{fontSize:11,color:"#555",marginBottom:20}}>Pre-extracted from the uploaded wireframe: 5 base cabs, 7 wall cabs, range opening</div>

            <div style={{borderTop:"1px solid #1a1a2a",paddingTop:16}}>
              <div style={{fontSize:12,color:"#888",marginBottom:8,fontWeight:600}}>Or paste your own JSON spec:</div>
              <textarea
                value={jsonInput}
                onChange={e=>setJsonInput(e.target.value)}
                placeholder='{"base_layout":[...],"wall_layout":[...],"alignment":[...],"cabinets":[...]}'
                style={{width:"100%",height:120,background:"#0a0a14",border:"1px solid #1a1a2a",borderRadius:8,
                  color:"#aaa",padding:10,fontSize:11,resize:"vertical"}}
              />
              <button onClick={loadJSON} disabled={!jsonInput.trim()} style={{
                marginTop:8,background:jsonInput.trim()?"#1a6fbf":"#1a1a2a",color:"#fff",border:"none",
                padding:"8px 16px",borderRadius:6,fontSize:12,fontWeight:600,cursor:jsonInput.trim()?"pointer":"default",fontFamily:"inherit"
              }}>
                Load JSON
              </button>
              {jsonError && <div style={{marginTop:6,fontSize:11,color:"#e04040"}}>{jsonError}</div>}
            </div>
          </div>
        )}

        {hasSpec && tab === "render" && (
          <div>
            <Render spec={spec}/>
            <div style={{marginTop:10,padding:"10px 12px",background:"#0c0c14",borderRadius:8,border:"1px solid #1a1a2a",
              fontSize:11,color:"#555",lineHeight:1.6,fontFamily:"'JetBrains Mono',monospace"}}>
              <strong style={{color:"#D94420"}}>BASE: </strong>
              {(spec.base_layout||[]).map(i=>i.ref||`[${(i.label||i.id||"?").toUpperCase()} ${i.width}"]`).join(" \u2192 ")}
              <br/>
              <strong style={{color:"#1a6fbf"}}>WALL: </strong>
              {(spec.wall_layout||[]).map(i=>i.ref||`[${(i.label||i.id||"?").toUpperCase()} ${i.width}"]`).join(" \u2192 ")}
            </div>
            <button onClick={reset} style={{marginTop:10,background:"none",border:"1px solid #2a2a3a",color:"#555",
              padding:"6px 14px",borderRadius:6,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Start Over</button>
          </div>
        )}

        {hasSpec && tab === "edit" && (
          <div style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:12}}>
            <Editor spec={spec} onChange={update}/>
            <Render spec={spec}/>
          </div>
        )}

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
