import { Routes, Route } from "react-router-dom";
import ProjectList from "./pages/ProjectList";
import ProjectWorkspace from "./pages/ProjectWorkspace";

export default function App() {
  return (
    <div style={{ minHeight: "100vh", background: "#06060c", color: "#ddd", fontFamily: "'DM Sans',-apple-system,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        textarea{font-family:'JetBrains Mono',monospace}
      `}</style>

      {/* Header — visible on project list only (workspace has its own) */}
      <Routes>
        <Route path="/" element={
          <>
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #1a1a2a", display: "flex", alignItems: "center" }}>
              <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: "-0.02em", color: "#eee" }}>Cabinet Spec Tool</h1>
            </div>
            <div style={{ padding: "0 0 20px" }}>
              <ProjectList />
            </div>
          </>
        } />
        <Route path="/project/:projectId" element={<ProjectWorkspace />} />
      </Routes>
    </div>
  );
}
