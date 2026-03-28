import { useState, useRef, useEffect, useCallback } from "react";
import useSpecState from "../state/useSpecState";
import InteractiveRender from "../editor/InteractiveRender";
import GridEditor from "../editor/GridEditor";
import CabinetEditBar from "../editor/CabinetEditBar";
import { defaultCabinet, generateId } from "../state/specHelpers";
import * as api from "../api";

const EMPTY_SPEC = { base_layout: [], wall_layout: [], alignment: [], cabinets: [] };

// Example spec for "Try the Example"
const WIREFRAME_SPEC = {
  base_layout: [
    { ref: "B1" }, { ref: "B2" },
    { type: "appliance", id: "range", label: "Range", width: 30 },
    { ref: "B3" }, { ref: "B4" }, { ref: "B5" }
  ],
  wall_layout: [
    { ref: "W1" }, { ref: "W2" }, { ref: "W3" }, { ref: "W4" },
    { ref: "W5" }, { ref: "W6" }, { ref: "W7" }
  ],
  alignment: [ { wall: "W1", base: "B1" }, { wall: "W4", base: "B3" } ],
  cabinets: [
    { id: "B1", type: "base", label: "Drawer over single door", row: "base", width: 18, height: 34.5, depth: 24, face: { sections: [{ type: "drawer", count: 1, height: 6 }, { type: "door", count: 1, hinge_side: "left" }] } },
    { id: "B2", type: "base", label: "Single door tall", row: "base", width: 21, height: 34.5, depth: 24, face: { sections: [{ type: "door", count: 1, hinge_side: "right" }] } },
    { id: "B3", type: "base_sink", label: "Sink base", row: "base", width: 36, height: 34.5, depth: 24, face: { sections: [{ type: "false_front", count: 1, height: 6 }, { type: "door", count: 2 }] } },
    { id: "B4", type: "base", label: "Drawer over double door", row: "base", width: 24, height: 34.5, depth: 24, face: { sections: [{ type: "drawer", count: 1, height: 6 }, { type: "door", count: 2 }] } },
    { id: "B5", type: "base_pullout", label: "Spice/wine pullout", row: "base", width: 9, height: 34.5, depth: 24, face: { sections: [{ type: "door", count: 1, hinge_side: "right" }] } },
    { id: "W1", type: "wall", label: "Tall single left", row: "wall", width: 15, height: 42, depth: 12, face: { sections: [{ type: "door", count: 1, hinge_side: "right" }] } },
    { id: "W2", type: "wall", label: "Tall single right", row: "wall", width: 15, height: 42, depth: 12, face: { sections: [{ type: "door", count: 1, hinge_side: "left" }] } },
    { id: "W3", type: "wall", label: "Double door wide", row: "wall", width: 33, height: 30, depth: 12, face: { sections: [{ type: "door", count: 2 }] } },
    { id: "W4", type: "wall", label: "Double door over sink", row: "wall", width: 33, height: 30, depth: 12, face: { sections: [{ type: "door", count: 2 }] } },
    { id: "W5", type: "wall", label: "Single door", row: "wall", width: 18, height: 30, depth: 12, face: { sections: [{ type: "door", count: 1, hinge_side: "left" }] } },
    { id: "W6", type: "wall", label: "Short square left", row: "wall", width: 15, height: 18, depth: 12, face: { sections: [{ type: "door", count: 1, hinge_side: "right" }] } },
    { id: "W7", type: "wall", label: "Short square right", row: "wall", width: 15, height: 18, depth: 12, face: { sections: [{ type: "door", count: 1, hinge_side: "left" }] } }
  ]
};

export default function RoomEditor({ roomId, projectId, projectStatus, onSaveStateChange, onRoomUpdated }) {
  const { spec, dispatch, undo, redo, canUndo, canRedo } = useSpecState(EMPTY_SPEC);
  const [loading, setLoading] = useState(true);
  const [roomData, setRoomData] = useState(null);
  const [specVersion, setSpecVersion] = useState(0);
  const [hasSpec, setHasSpec] = useState(false);

  // Upload state
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [wireframeFile, setWireframeFile] = useState(null);
  const [wireframePreview, setWireframePreview] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const photoInputRef = useRef(null);
  const wireInputRef = useRef(null);

  // Editor state
  const [tab, setTab] = useState("render");
  const [selectedId, setSelectedId] = useState(null);
  const [selectedGapItem, setSelectedGapItem] = useState(null);
  const [renderCtxMenu, setRenderCtxMenu] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const widthInputRef = useRef(null);

  // Auto-save
  const saveTimer = useRef(null);
  const maxSaveTimer = useRef(null);
  const lastSaveTime = useRef(Date.now());
  const pendingSave = useRef(false);

  // Load room data
  useEffect(() => {
    (async () => {
      try {
        const r = await api.getRoom(roomId);
        setRoomData(r);
        setSpecVersion(r.spec_version || 0);
        if (r.spec) {
          r.spec.cabinets?.forEach(c => {
            if (!c.depth) c.depth = c.row === "wall" ? 12 : 24;
            if (!c.height) c.height = c.row === "wall" ? 30 : 34.5;
            if (!c.width) c.width = 24;
          });
          dispatch({ type: "LOAD_SPEC", spec: r.spec });
          setHasSpec(true);
          setTab("render");
        }
        if (r.photo_url) setPhotoPreview(api.imageUrl(r.photo_url));
        if (r.wireframe_url) setWireframePreview(api.imageUrl(r.wireframe_url));
      } catch (e) {
        console.error("Failed to load room:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [roomId]);

  // Auto-save: debounce 1s, max interval 5s
  const doSave = useCallback(async () => {
    if (!hasSpec) return;
    pendingSave.current = false;
    onSaveStateChange?.("saving");
    try {
      const result = await api.saveRoomSpec(roomId, spec, specVersion);
      setSpecVersion(result.version);
      onSaveStateChange?.("saved");
      onRoomUpdated?.({ cabinet_count: result.cabinet_count, spec_version: result.version });
      lastSaveTime.current = Date.now();
      // Also backup to localStorage
      try { localStorage.setItem(`room_spec_${roomId}`, JSON.stringify({ spec, version: result.version, ts: Date.now() })); } catch {}
      // Clear saved indicator after 3s
      setTimeout(() => onSaveStateChange?.("idle"), 3000);
    } catch (e) {
      if (e.status === 409) {
        onSaveStateChange?.("error");
        console.error("Version conflict — another tab may have modified this room");
      } else {
        onSaveStateChange?.("error");
        console.error("Auto-save failed:", e);
      }
    }
  }, [roomId, spec, specVersion, hasSpec]);

  // Watch spec changes for auto-save
  useEffect(() => {
    if (!hasSpec || loading) return;
    // 1-second debounce
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(), 1000);
    // 5-second max interval
    if (Date.now() - lastSaveTime.current > 5000) {
      clearTimeout(saveTimer.current);
      doSave();
    }
    pendingSave.current = true;
    return () => clearTimeout(saveTimer.current);
  }, [spec, hasSpec, loading]);

  // Flush save on unmount (room switch)
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
      clearTimeout(maxSaveTimer.current);
      if (pendingSave.current) {
        // Fire-and-forget save via sendBeacon
        api.beaconSaveSpec(roomId, spec, specVersion);
      }
    };
  }, [roomId]);

  // Ctrl+S to force save
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasSpec) doSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doSave, hasSpec]);

  // Keyboard shortcuts for editor
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (tab !== "render") return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT" || document.activeElement?.tagName === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (!selectedId) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); if (e.metaKey || e.ctrlKey) dispatch({ type: "MOVE_CABINET", id: selectedId, direction: "left" }); else dispatch({ type: "NUDGE_CABINET", id: selectedId, amount: e.shiftKey ? -0.5 : -1 }); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); if (e.metaKey || e.ctrlKey) dispatch({ type: "MOVE_CABINET", id: selectedId, direction: "right" }); else dispatch({ type: "NUDGE_CABINET", id: selectedId, amount: e.shiftKey ? 0.5 : 1 }); return; }
      if (e.key === "Escape") { setSelectedId(null); setSelectedGapItem(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") { dispatch({ type: "DELETE_CABINET", id: selectedId }); setSelectedId(null); return; }
      if (e.key === "Tab") {
        e.preventDefault();
        const allItems = [...(spec.base_layout || []), ...(spec.wall_layout || [])].filter(i => i.ref);
        const idx = allItems.findIndex(i => i.ref === selectedId);
        if (idx !== -1) { const next = e.shiftKey ? allItems[(idx - 1 + allItems.length) % allItems.length] : allItems[(idx + 1) % allItems.length]; if (next) setSelectedId(next.ref); }
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

  // Upload handlers
  const handlePhotoUpload = async (e) => {
    const file = e.target?.files?.[0] || e;
    if (!file || !(file instanceof File)) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    // Upload to server
    try {
      await api.uploadImage(roomId, file, "photo");
    } catch (err) { console.error("Photo upload failed:", err); }
  };

  const handleWireframeUpload = async (e) => {
    const file = e.target?.files?.[0] || e;
    if (!file || !(file instanceof File)) return;
    setWireframeFile(file);
    setWireframePreview(URL.createObjectURL(file));
    try {
      await api.uploadImage(roomId, file, "wireframe");
    } catch (err) { console.error("Wireframe upload failed:", err); }
  };

  const handleExtract = async () => {
    if (!wireframePreview || !photoPreview) return;
    setUploading(true);
    setUploadStatus("Analyzing photo + wireframe with GPT-5.4...");
    try {
      const extracted = await api.extractForRoom(roomId);
      extracted.cabinets?.forEach(c => {
        if (!c.depth) c.depth = c.row === "wall" ? 12 : 24;
        if (!c.height) c.height = c.row === "wall" ? 30 : 34.5;
        if (!c.width) c.width = 24;
      });
      dispatch({ type: "LOAD_SPEC", spec: extracted });
      setHasSpec(true);
      setTab("render");
      setUploadStatus(`Extracted ${extracted.cabinets?.length || 0} cabinets`);
      // Refresh room data to get updated spec_version
      const r = await api.getRoom(roomId);
      setSpecVersion(r.spec_version || 0);
      onRoomUpdated?.({ cabinet_count: extracted.cabinets?.length || 0, spec_version: r.spec_version });
    } catch (err) {
      setUploadStatus(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
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

  const loadExample = () => {
    dispatch({ type: "LOAD_SPEC", spec: JSON.parse(JSON.stringify(WIREFRAME_SPEC)) });
    setHasSpec(true);
    setTab("render");
  };

  const handleSelect = (id) => { setSelectedId(id); if (id) setSelectedGapItem(null); };
  const handleGapSelect = (item) => { setSelectedGapItem(item); if (item) setSelectedId(null); };

  if (loading) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 13 }}>Loading room...</div>;
  }

  // ---------- UPLOAD MODE (no spec yet) ----------
  if (!hasSpec) {
    return (
      <div style={{ flex: 1, overflow: "auto", padding: "14px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {/* Step indicators */}
          <div style={{ display: "flex", justifyContent: "center", gap: 0, marginBottom: 24, marginTop: 24, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
            {[{ done: !!photoPreview, label: "Photo", n: "1" }, { done: !!wireframePreview, label: "Wireframe", n: "2" }, { done: false, active: uploading, label: "Extract", n: "3" }].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                {i > 0 && <span style={{ color: "#333", margin: "0 12px" }}>→</span>}
                <span style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
                  background: s.done ? "#22c55e" : s.active ? "#D94420" : "#1a1a2a", color: s.done ? "#000" : s.active ? "#fff" : "#555", border: !s.done && !s.active ? "1px solid #2a2a3a" : "none" }}>
                  {s.done ? "✓" : s.n}
                </span>
                <span style={{ color: s.done ? "#22c55e" : s.active ? "#D94420" : "#888", fontWeight: 600, marginLeft: 6 }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Upload cards */}
          <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
            {/* Photo card */}
            <div onClick={() => !uploading && photoInputRef.current?.click()} onDragOver={handleCardDragOver} onDragEnter={handleCardDragEnter("photo")} onDragLeave={handleCardDragLeave("photo")} onDrop={handleCardDrop("photo")}
              style={{ flex: 1, minWidth: 240, minHeight: 220, background: "#0c0c14", cursor: "pointer", border: photoPreview ? "2px solid #22c55e" : dragTarget === "photo" ? "2px dashed #D94420" : "2px dashed #2a2a3a", borderRadius: 12, padding: "20px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transition: "border-color 0.15s" }}>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} style={{ display: "none" }} />
              {photoPreview ? (
                <>
                  <img src={photoPreview} style={{ maxWidth: "100%", maxHeight: 140, borderRadius: 8, border: "1px solid #2a2a3a", objectFit: "cover", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }} />
                  <div style={{ marginTop: 8, fontSize: 11, color: "#22c55e", fontWeight: 600 }}>✓ Photo ready</div>
                  <div onClick={(e) => { e.stopPropagation(); setPhotoFile(null); setPhotoPreview(null); }} style={{ marginTop: 4, fontSize: 10, color: "#666", textDecoration: "underline", cursor: "pointer" }}>Change</div>
                </>
              ) : (
                <>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 10, opacity: 0.5 }}><rect x="3" y="3" width="18" height="18" rx="3" stroke={dragTarget === "photo" ? "#D94420" : "#666"} strokeWidth="1.5"/><circle cx="8.5" cy="8.5" r="2" stroke={dragTarget === "photo" ? "#D94420" : "#666"} strokeWidth="1.5"/><path d="M3 16l5-5 4 4 3-3 6 6" stroke={dragTarget === "photo" ? "#D94420" : "#666"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <div style={{ fontSize: 13, fontWeight: 600, color: dragTarget === "photo" ? "#D94420" : "#bbb" }}>Drop photo here</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>or click to browse</div>
                  <div style={{ fontSize: 10, color: "#444", marginTop: 10, fontFamily: "'JetBrains Mono',monospace" }}>Original room photo</div>
                </>
              )}
            </div>

            {/* Wireframe card */}
            <div onClick={() => !uploading && wireInputRef.current?.click()} onDragOver={handleCardDragOver} onDragEnter={handleCardDragEnter("wireframe")} onDragLeave={handleCardDragLeave("wireframe")} onDrop={handleCardDrop("wireframe")}
              style={{ flex: 1, minWidth: 240, minHeight: 220, background: "#0c0c14", cursor: "pointer", border: wireframePreview ? "2px solid #22c55e" : dragTarget === "wireframe" ? "2px dashed #D94420" : "2px dashed #2a2a3a", borderRadius: 12, padding: "20px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transition: "border-color 0.15s" }}>
              <input ref={wireInputRef} type="file" accept="image/*" onChange={handleWireframeUpload} disabled={uploading} style={{ display: "none" }} />
              {wireframePreview ? (
                <>
                  <img src={wireframePreview} style={{ maxWidth: "100%", maxHeight: 140, borderRadius: 8, border: "1px solid #2a2a3a", objectFit: "cover", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }} />
                  <div style={{ marginTop: 8, fontSize: 11, color: "#22c55e", fontWeight: 600 }}>✓ Wireframe ready</div>
                  <div onClick={(e) => { e.stopPropagation(); setWireframeFile(null); setWireframePreview(null); }} style={{ marginTop: 4, fontSize: 10, color: "#666", textDecoration: "underline", cursor: "pointer" }}>Change</div>
                </>
              ) : (
                <>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 10, opacity: 0.5 }}><rect x="3" y="3" width="18" height="18" rx="2" stroke={dragTarget === "wireframe" ? "#D94420" : "#666"} strokeWidth="1.5"/><line x1="3" y1="9" x2="21" y2="9" stroke={dragTarget === "wireframe" ? "#D94420" : "#666"} strokeWidth="1"/><line x1="9" y1="9" x2="9" y2="21" stroke={dragTarget === "wireframe" ? "#D94420" : "#666"} strokeWidth="1"/><line x1="15" y1="9" x2="15" y2="21" stroke={dragTarget === "wireframe" ? "#D94420" : "#666"} strokeWidth="1"/></svg>
                  <div style={{ fontSize: 13, fontWeight: 600, color: dragTarget === "wireframe" ? "#D94420" : "#bbb" }}>Drop wireframe here</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>or click to browse</div>
                  <div style={{ fontSize: 10, color: "#444", marginTop: 10, fontFamily: "'JetBrains Mono',monospace" }}>Cabinet layout drawing</div>
                </>
              )}
            </div>
          </div>

          {/* Extract button / status */}
          {uploading ? (
            <div style={{ textAlign: "center", padding: "14px 0", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#D94420", animation: "pulse 1.5s infinite" }}>{uploadStatus}</div>
            </div>
          ) : uploadStatus?.startsWith("Error") ? (
            <div style={{ textAlign: "center", padding: "8px 0", marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#e04040", fontWeight: 600 }}>{uploadStatus}</div>
            </div>
          ) : (
            <button onClick={handleExtract} disabled={!photoPreview || !wireframePreview || uploading}
              style={{ width: "100%", padding: "14px 0", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: photoPreview && wireframePreview ? "pointer" : "default", fontFamily: "inherit", border: "none", marginBottom: 16, transition: "all 0.15s", letterSpacing: "-0.01em", background: photoPreview && wireframePreview ? "#D94420" : "#1a1a2a", color: photoPreview && wireframePreview ? "#fff" : "#444", opacity: photoPreview && wireframePreview ? 1 : 0.6 }}>
              {photoPreview && wireframePreview ? "Extract Cabinets with GPT-5.4" : "Upload both images to continue"}
            </button>
          )}

          {/* Secondary options */}
          <div style={{ borderTop: "1px solid #1a1a2a", paddingTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={loadExample} style={{ background: "transparent", color: "#888", border: "1px solid #2a2a3a", padding: "8px 16px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Try the Example
            </button>
            <span style={{ fontSize: 10, color: "#444", fontFamily: "'JetBrains Mono',monospace" }}>12 cabs · 2 rows · range opening</span>
          </div>
        </div>
      </div>
    );
  }

  // ---------- EDITOR MODE ----------
  const cabMap = {};
  (spec.cabinets || []).forEach(c => { cabMap[c.id] = c; });
  const sel = selectedId ? cabMap[selectedId] : null;
  const selColor = sel?.row === "wall" ? "#1a6fbf" : "#D94420";
  const baseRun = (spec.base_layout || []).reduce((s, i) => s + (i.ref ? cabMap[i.ref]?.width || 0 : i.width || 0), 0);
  const wallRun = (spec.wall_layout || []).reduce((s, i) => s + (i.ref ? cabMap[i.ref]?.width || 0 : i.width || 0), 0);
  const cabCount = (spec.cabinets || []).length;
  const hasSpec2 = cabCount > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#06060c", borderBottom: "1px solid #1a1a2a", flexShrink: 0, fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
        <button onClick={undo} disabled={!canUndo} style={{ background: canUndo ? "#1a1a2a" : "transparent", border: "1px solid #2a2a3a", color: canUndo ? "#e0e0e0" : "#333", padding: "4px 10px", borderRadius: 4, fontSize: 11, cursor: canUndo ? "pointer" : "default", fontWeight: 600 }}>Undo</button>
        <button onClick={redo} disabled={!canRedo} style={{ background: canRedo ? "#1a1a2a" : "transparent", border: "1px solid #2a2a3a", color: canRedo ? "#e0e0e0" : "#333", padding: "4px 10px", borderRadius: 4, fontSize: 11, cursor: canRedo ? "pointer" : "default", fontWeight: 600 }}>Redo</button>
        <span style={{ flex: 1 }} />
        <span style={{ color: "#555", fontWeight: 600 }}>{cabCount} cabs</span>
        <span style={{ color: "#333" }}>|</span>
        <span style={{ color: "#D94420", fontWeight: 600 }}>B:{baseRun}"</span>
        <span style={{ color: "#333" }}>|</span>
        <span style={{ color: "#1a6fbf", fontWeight: 600 }}>W:{wallRun}"</span>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a2a", background: "#06060c", flexShrink: 0 }}>
        {["render", "plan", "json"].map(t => (
          <div key={t} onClick={() => setTab(t)} style={{
            padding: "7px 16px", fontSize: 12, cursor: "pointer", fontWeight: tab === t ? 700 : 400,
            color: tab === t ? "#eee" : "#555", borderBottom: tab === t ? "2px solid #D94420" : "2px solid transparent",
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "10px" }}>
        {tab === "render" && (
          <InteractiveRender
            spec={spec}
            dispatch={dispatch}
            selectedId={selectedId}
            onSelect={handleSelect}
            onGapSelect={handleGapSelect}
            selectedGapItem={selectedGapItem}
            widthInputRef={widthInputRef}
          />
        )}
        {tab === "plan" && <GridEditor spec={spec} dispatch={dispatch} selectedId={selectedId} onSelect={handleSelect} />}
        {tab === "json" && (
          <pre style={{ background: "#0a0a14", color: "#aaa", padding: 16, borderRadius: 8, fontSize: 11, overflow: "auto", fontFamily: "'JetBrains Mono',monospace", maxHeight: "calc(100vh - 220px)" }}>
            {JSON.stringify(spec, null, 2)}
          </pre>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#06060c", borderTop: "1px solid #1a1a2a", flexShrink: 0, fontSize: 11 }}>
        <span style={{ color: "#555", fontSize: 10 }}>Click a cabinet to edit. Tab: next · ⌘D: duplicate · Right-click: more</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => { const row = "base"; const id = generateId(row, spec.cabinets); dispatch({ type: "ADD_CABINET", cabinet: defaultCabinet(id, row) }); setSelectedId(id); }} style={{ background: "#D94420", color: "#fff", border: "none", padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ Base</button>
        <button onClick={() => { const row = "wall"; const id = generateId(row, spec.cabinets); dispatch({ type: "ADD_CABINET", cabinet: defaultCabinet(id, row) }); setSelectedId(id); }} style={{ background: "#1a6fbf", color: "#fff", border: "none", padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ Wall</button>
      </div>

      {/* Cabinet edit bar */}
      {sel && (
        <CabinetEditBar
          cabinet={sel}
          dispatch={dispatch}
          selColor={selColor}
          onClose={() => setSelectedId(null)}
          widthInputRef={widthInputRef}
        />
      )}
    </div>
  );
}
