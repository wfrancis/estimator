import { useState, useRef, useEffect } from "react";
import { imageUrl } from "../api";

/**
 * Project card for the project list grid.
 * Shows thumbnail, name, metadata, status pill, date.
 */
export default function ProjectCard({ project, onClick, onRename, onDuplicate, onDelete }) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(project.name);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming && inputRef.current) inputRef.current.focus();
  }, [renaming]);

  const statusColors = {
    draft: { text: "#D94420", bg: "rgba(217,68,32,0.15)" },
    in_progress: { text: "#1a6fbf", bg: "rgba(26,111,191,0.15)" },
    finalized: { text: "#22c55e", bg: "rgba(34,197,94,0.15)" },
  };

  const statusLabel = {
    draft: "Draft",
    in_progress: "In Progress",
    finalized: "Finalized",
  };

  const relativeDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 172800) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const sc = statusColors[project.status] || statusColors.draft;
  const thumbSrc = imageUrl(project.thumb_url);

  const handleRename = () => {
    const val = renameVal.trim();
    if (val && val !== project.name) onRename?.(val);
    setRenaming(false);
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setMenuOpen(false); }}
      onClick={() => !renaming && !menuOpen && onClick?.()}
      style={{
        background: "#0c0c14",
        border: hover ? "1px solid #2a2a3a" : "1px solid #1a1a2a",
        borderRadius: 12,
        cursor: renaming ? "default" : "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: hover ? "0 4px 16px rgba(0,0,0,0.3)" : "none",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: "100%",
        paddingBottom: "62.5%", // 16:10 aspect ratio
        background: "#08080e",
        position: "relative",
        overflow: "hidden",
      }}>
        {thumbSrc ? (
          <img src={thumbSrc} style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            objectFit: "cover",
          }} />
        ) : (
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" opacity={0.25}>
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="#666" strokeWidth="1.5"/>
              <line x1="3" y1="12" x2="21" y2="12" stroke="#666" strokeWidth="1"/>
              <line x1="9" y1="12" x2="9" y2="21" stroke="#666" strokeWidth="1"/>
              <line x1="15" y1="12" x2="15" y2="21" stroke="#666" strokeWidth="1"/>
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "10px 12px 10px" }}>
        {renaming ? (
          <input
            ref={inputRef}
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
            onBlur={handleRename}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", background: "#0a0a14", border: "1px solid #D94420",
              borderRadius: 4, color: "#eee", padding: "2px 6px", fontSize: 14,
              fontWeight: 600, fontFamily: "inherit", outline: "none",
            }}
          />
        ) : (
          <div style={{
            fontSize: 14, fontWeight: 600, color: "#eee",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {project.name}
          </div>
        )}
        <div style={{
          fontSize: 11, color: "#555", marginTop: 2,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {project.room_count || 0} room{project.room_count !== 1 ? "s" : ""}
          {" · "}
          {project.total_cabinets || 0} cabinet{project.total_cabinets !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 12px 10px",
      }}>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8,
          fontFamily: "'JetBrains Mono', monospace",
          color: sc.text, background: sc.bg,
        }}>
          {statusLabel[project.status] || "Draft"}
        </span>
        <span style={{ fontSize: 10, color: "#444", fontFamily: "'JetBrains Mono', monospace" }}>
          {relativeDate(project.updated_at)}
        </span>
      </div>

      {/* Overflow menu trigger */}
      {hover && !renaming && (
        <div
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          style={{
            position: "absolute", top: 8, right: 8,
            width: 28, height: 28, borderRadius: 6,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#888", fontSize: 16,
          }}
        >
          ···
        </div>
      )}

      {/* Context menu */}
      {menuOpen && (
        <div ref={menuRef} onClick={(e) => e.stopPropagation()} style={{
          position: "absolute", top: 40, right: 8,
          background: "#1a1a2a", border: "1px solid #2a2a3a", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)", minWidth: 140, zIndex: 10,
          padding: "4px 0",
        }}>
          <div onClick={() => { setMenuOpen(false); onDuplicate?.(); }}
            style={{ padding: "8px 14px", fontSize: 12, color: "#ddd", cursor: "pointer" }}
            onMouseEnter={(e) => e.target.style.background = "#2a2a3a"}
            onMouseLeave={(e) => e.target.style.background = "transparent"}>
            Duplicate
          </div>
          <div onClick={() => { setMenuOpen(false); setRenaming(true); setRenameVal(project.name); }}
            style={{ padding: "8px 14px", fontSize: 12, color: "#ddd", cursor: "pointer" }}
            onMouseEnter={(e) => e.target.style.background = "#2a2a3a"}
            onMouseLeave={(e) => e.target.style.background = "transparent"}>
            Rename
          </div>
          <div style={{ borderTop: "1px solid #2a2a3a", margin: "4px 0" }} />
          <div onClick={() => { setMenuOpen(false); onDelete?.(); }}
            style={{ padding: "8px 14px", fontSize: 12, color: "#e04040", cursor: "pointer" }}
            onMouseEnter={(e) => e.target.style.background = "#2a2a3a"}
            onMouseLeave={(e) => e.target.style.background = "transparent"}>
            Delete
          </div>
        </div>
      )}
    </div>
  );
}
