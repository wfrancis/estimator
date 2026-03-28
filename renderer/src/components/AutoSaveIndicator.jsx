/**
 * Auto-save status indicator for the workspace header.
 * States: idle, saving, saved, error
 */
export default function AutoSaveIndicator({ state }) {
  if (state === "idle") return null;

  const configs = {
    saving: { text: "Saving...", color: "#888", icon: "spinner" },
    saved: { text: "Saved", color: "#22c55e", icon: "check" },
    error: { text: "Save failed", color: "#e04040", icon: "warn" },
  };

  const c = configs[state] || configs.saved;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
      color: c.color, opacity: state === "saved" ? 0.6 : 1,
    }}>
      {c.icon === "spinner" && (
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: "spin 1s linear infinite" }}>
          <circle cx="6" cy="6" r="5" fill="none" stroke={c.color} strokeWidth="1.5"
            strokeDasharray="20" strokeDashoffset="5" strokeLinecap="round" />
        </svg>
      )}
      {c.icon === "check" && (
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M3 6l2 2 4-4" fill="none" stroke={c.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {c.icon === "warn" && (
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M6 1L11 10H1z" fill="none" stroke={c.color} strokeWidth="1" />
          <line x1="6" y1="4" x2="6" y2="7" stroke={c.color} strokeWidth="1" />
          <circle cx="6" cy="8.5" r="0.5" fill={c.color} />
        </svg>
      )}
      {c.text}
    </div>
  );
}
