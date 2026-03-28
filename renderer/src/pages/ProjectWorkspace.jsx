import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import * as api from "../api";
import RoomTabs from "../components/RoomTabs";
import AutoSaveIndicator from "../components/AutoSaveIndicator";
import RoomEditor from "../components/RoomEditor";

export default function ProjectWorkspace() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const nameRef = useRef(null);

  // Load project
  const fetchProject = useCallback(async () => {
    try {
      const p = await api.getProject(projectId);
      setProject(p);
      // Set active room from URL or default to first
      const roomParam = searchParams.get("room");
      if (roomParam && p.rooms.some((r) => r.id === roomParam)) {
        setActiveRoomId(roomParam);
      } else if (p.rooms.length > 0 && !activeRoomId) {
        setActiveRoomId(p.rooms[0].id);
      }
    } catch (e) {
      console.error("Failed to load project:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  useEffect(() => {
    if (editingName && nameRef.current) nameRef.current.focus();
  }, [editingName]);

  // Update URL when room changes
  useEffect(() => {
    if (activeRoomId) {
      setSearchParams({ room: activeRoomId }, { replace: true });
    }
  }, [activeRoomId]);

  // Handlers
  const handleNameSave = async () => {
    const val = nameVal.trim();
    if (val && val !== project.name) {
      await api.updateProject(projectId, { name: val });
      setProject((p) => ({ ...p, name: val }));
    }
    setEditingName(false);
  };

  const handleStatusChange = async (status) => {
    await api.updateProject(projectId, { status });
    setProject((p) => ({ ...p, status }));
  };

  const handleAddRoom = async (name) => {
    const r = await api.createRoom(projectId, name);
    setProject((p) => ({ ...p, rooms: [...p.rooms, r] }));
    setActiveRoomId(r.id);
  };

  const handleDeleteRoom = async (rid) => {
    await api.deleteRoom(rid);
    setProject((p) => {
      const rooms = p.rooms.filter((r) => r.id !== rid);
      if (activeRoomId === rid && rooms.length > 0) {
        setActiveRoomId(rooms[0].id);
      }
      return { ...p, rooms };
    });
  };

  const handleRenameRoom = async (rid, name) => {
    await api.updateRoom(rid, { name });
    setProject((p) => ({
      ...p,
      rooms: p.rooms.map((r) => (r.id === rid ? { ...r, name } : r)),
    }));
  };

  const handleDuplicateRoom = async (rid) => {
    const r = await api.duplicateRoom(rid);
    setProject((p) => ({ ...p, rooms: [...p.rooms, r] }));
    setActiveRoomId(r.id);
  };

  // Room updated its cabinet count (after extraction or auto-save)
  const handleRoomUpdated = (rid, updates) => {
    setProject((p) => ({
      ...p,
      rooms: p.rooms.map((r) => (r.id === rid ? { ...r, ...updates } : r)),
    }));
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "#555", fontSize: 13 }}>Loading...</div>;
  }
  if (!project) {
    return <div style={{ textAlign: "center", padding: "60px 0", color: "#e04040", fontSize: 13 }}>Project not found.</div>;
  }

  const statusColors = {
    draft: { text: "#D94420", bg: "rgba(217,68,32,0.15)" },
    in_progress: { text: "#1a6fbf", bg: "rgba(26,111,191,0.15)" },
    finalized: { text: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  };
  const statusLabel = { draft: "Draft", in_progress: "In Progress", finalized: "Finalized" };
  const sc = statusColors[project.status] || statusColors.draft;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header bar */}
      <div style={{
        height: 44, background: "#06060c", borderBottom: "1px solid #1a1a2a",
        display: "flex", alignItems: "center", padding: "0 12px", gap: 10, flexShrink: 0,
      }}>
        {/* Back */}
        <div
          onClick={() => navigate("/")}
          style={{ color: "#666", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          onMouseEnter={(e) => e.currentTarget.style.color = "#ddd"}
          onMouseLeave={(e) => e.currentTarget.style.color = "#666"}
        >
          <span style={{ fontSize: 14 }}>←</span> Projects
        </div>

        <div style={{ width: 1, height: 20, background: "#1a1a2a" }} />

        {/* Project name */}
        {editingName ? (
          <input
            ref={nameRef}
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleNameSave(); if (e.key === "Escape") setEditingName(false); }}
            onBlur={handleNameSave}
            style={{
              background: "#0a0a14", border: "1px solid #D94420", borderRadius: 4,
              color: "#eee", padding: "2px 8px", fontSize: 15, fontWeight: 600,
              fontFamily: "inherit", outline: "none", maxWidth: 300,
            }}
          />
        ) : (
          <div
            onClick={() => { setEditingName(true); setNameVal(project.name); }}
            style={{
              fontSize: 15, fontWeight: 600, color: "#eee", cursor: "pointer",
              maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
            title="Click to rename"
          >
            {project.name}
          </div>
        )}

        <span style={{ flex: 1 }} />

        {/* Status pill */}
        <StatusDropdown
          status={project.status}
          statusColors={statusColors}
          statusLabel={statusLabel}
          onChange={handleStatusChange}
        />

        {/* Save indicator */}
        <AutoSaveIndicator state={saveState} />
      </div>

      {/* Room tabs */}
      <RoomTabs
        rooms={project.rooms}
        activeRoomId={activeRoomId}
        onSelect={setActiveRoomId}
        onAdd={handleAddRoom}
        onDelete={handleDeleteRoom}
        onRename={handleRenameRoom}
        onDuplicate={handleDuplicateRoom}
      />

      {/* Room content */}
      {project.rooms.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
              This project has no rooms yet.
            </div>
            <button
              onClick={() => handleAddRoom()}
              style={{
                background: "#D94420", color: "#fff", border: "none",
                padding: "10px 24px", borderRadius: 18, fontSize: 12,
                fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              + Add First Room
            </button>
          </div>
        </div>
      ) : activeRoomId ? (
        <RoomEditor
          key={activeRoomId}
          roomId={activeRoomId}
          projectId={projectId}
          projectStatus={project.status}
          onSaveStateChange={setSaveState}
          onRoomUpdated={(updates) => handleRoomUpdated(activeRoomId, updates)}
        />
      ) : null}
    </div>
  );
}


// Small component: status dropdown
function StatusDropdown({ status, statusColors, statusLabel, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const sc = statusColors[status] || statusColors.draft;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <span
        onClick={() => setOpen(!open)}
        style={{
          fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 8,
          fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
          color: sc.text, background: sc.bg,
        }}
      >
        {statusLabel[status] || "Draft"}
      </span>
      {open && (
        <div style={{
          position: "absolute", top: 28, right: 0,
          background: "#1a1a2a", border: "1px solid #2a2a3a", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)", minWidth: 140, zIndex: 20,
          padding: "4px 0",
        }}>
          {Object.entries(statusLabel).map(([key, label]) => (
            <div
              key={key}
              onClick={() => { onChange(key); setOpen(false); }}
              style={{
                padding: "8px 14px", fontSize: 12, cursor: "pointer",
                color: key === status ? statusColors[key].text : "#ddd",
                background: key === status ? "rgba(255,255,255,0.05)" : "transparent",
                display: "flex", alignItems: "center", gap: 6,
              }}
              onMouseEnter={(e) => e.target.style.background = "#2a2a3a"}
              onMouseLeave={(e) => e.target.style.background = key === status ? "rgba(255,255,255,0.05)" : "transparent"}
            >
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: key === status ? statusColors[key].text : "transparent",
                border: key === status ? "none" : `1px solid ${statusColors[key].text}`,
              }} />
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
