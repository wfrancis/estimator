import { useState, useRef, useEffect } from "react";

export default function RoomTabs({ rooms, activeRoomId, onSelect, onAdd, onDelete, onRename, onDuplicate }) {
  const [addingRoom, setAddingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [contextMenu, setContextMenu] = useState(null); // { rid, x, y }
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const addRef = useRef(null);
  const menuRef = useRef(null);
  const renameRef = useRef(null);

  useEffect(() => {
    if (addingRoom && addRef.current) addRef.current.focus();
  }, [addingRoom]);

  useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus();
  }, [renamingId]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setContextMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  // Auto-dismiss delete confirm after 3 seconds
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const handleAddRoom = () => {
    const name = newRoomName.trim() || undefined;
    onAdd?.(name);
    setAddingRoom(false);
    setNewRoomName("");
  };

  return (
    <div style={{
      height: 36, background: "#06060c", borderBottom: "1px solid #1a1a2a",
      display: "flex", alignItems: "stretch", overflowX: "auto", flexShrink: 0,
      position: "relative",
    }}>
      {rooms.map((r) => (
        <div
          key={r.id}
          onClick={() => onSelect?.(r.id)}
          onDoubleClick={() => {
            setRenameVal(r.name);
            setRenamingId(r.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ rid: r.id, x: e.clientX, y: e.clientY });
          }}
          style={{
            padding: "0 14px", display: "flex", alignItems: "center", cursor: "pointer",
            fontSize: 12, fontWeight: r.id === activeRoomId ? 600 : 400,
            color: r.id === activeRoomId ? "#eee" : "#555",
            borderBottom: r.id === activeRoomId ? "2px solid #D94420" : "2px solid transparent",
            transition: "color 0.15s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => { if (r.id !== activeRoomId) e.currentTarget.style.color = "#888"; }}
          onMouseLeave={(e) => { if (r.id !== activeRoomId) e.currentTarget.style.color = "#555"; }}
        >
          {renamingId === r.id ? (
            <input
              ref={renameRef}
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { onRename?.(r.id, renameVal.trim() || r.name); setRenamingId(null); }
                if (e.key === "Escape") setRenamingId(null);
              }}
              onBlur={() => { onRename?.(r.id, renameVal.trim() || r.name); setRenamingId(null); }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#0a0a14", border: "1px solid #D94420", borderRadius: 3,
                color: "#eee", padding: "1px 6px", fontSize: 12, fontFamily: "inherit",
                outline: "none", width: 100,
              }}
            />
          ) : confirmDelete === r.id ? (
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#e04040" }}>Delete?</span>
              <span onClick={(e) => { e.stopPropagation(); onDelete?.(r.id); setConfirmDelete(null); }}
                style={{ color: "#e04040", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Yes</span>
              <span onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                style={{ color: "#888", cursor: "pointer", fontSize: 11 }}>No</span>
            </span>
          ) : (
            r.name
          )}
        </div>
      ))}

      {/* Add room */}
      {addingRoom ? (
        <div style={{ display: "flex", alignItems: "center", padding: "0 8px" }}>
          <input
            ref={addRef}
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddRoom(); if (e.key === "Escape") setAddingRoom(false); }}
            onBlur={() => { if (newRoomName.trim()) handleAddRoom(); else setAddingRoom(false); }}
            placeholder="Room name..."
            style={{
              background: "#0a0a14", border: "1px solid #D94420", borderRadius: 3,
              color: "#eee", padding: "2px 8px", fontSize: 12, fontFamily: "inherit",
              outline: "none", width: 110,
            }}
          />
        </div>
      ) : (
        <div
          onClick={() => setAddingRoom(true)}
          style={{
            padding: "0 14px", display: "flex", alignItems: "center",
            fontSize: 12, color: "#555", cursor: "pointer",
            position: "sticky", right: 0, background: "#06060c",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = "#D94420"}
          onMouseLeave={(e) => e.currentTarget.style.color = "#555"}
        >
          + Room
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div ref={menuRef} style={{
          position: "fixed", top: contextMenu.y, left: contextMenu.x,
          background: "#1a1a2a", border: "1px solid #2a2a3a", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)", minWidth: 140, zIndex: 30,
          padding: "4px 0",
        }}>
          <MenuItem label="Rename" onClick={() => {
            const room = rooms.find((r) => r.id === contextMenu.rid);
            setRenameVal(room?.name || "");
            setRenamingId(contextMenu.rid);
            setContextMenu(null);
          }} />
          <MenuItem label="Duplicate" onClick={() => {
            onDuplicate?.(contextMenu.rid);
            setContextMenu(null);
          }} />
          <div style={{ borderTop: "1px solid #2a2a3a", margin: "4px 0" }} />
          <MenuItem label="Delete" color="#e04040" onClick={() => {
            setConfirmDelete(contextMenu.rid);
            setContextMenu(null);
          }} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, color = "#ddd" }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: "8px 14px", fontSize: 12, color, cursor: "pointer" }}
      onMouseEnter={(e) => e.target.style.background = "#2a2a3a"}
      onMouseLeave={(e) => e.target.style.background = "transparent"}
    >
      {label}
    </div>
  );
}
