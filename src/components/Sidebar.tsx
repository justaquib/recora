import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Icon } from "./Icon";
import { User, Settings as SettingsIcon, SlidersHorizontal, HelpCircle, LogOut } from "lucide-react";

type Props = {
  videoCount: number;
  saveDirectory: string;
  onNewRecording: () => void;
  onChooseSaveDirectory: () => void;
  onResetSaveDirectory: () => void;
};

export default function Sidebar({ videoCount, saveDirectory, onNewRecording, onChooseSaveDirectory, onResetSaveDirectory }: Props) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const onRecordings = location.pathname === "/" || location.pathname.startsWith("/recordings");
  const onRecording = location.pathname === "/recording";
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate("/")} aria-label="Recodex home"><span className="brand-mark"><Icon name="logo" size={22} /></span><span>recodex</span></button>
      <button className="new-recording" onClick={() => void onNewRecording()}><Icon name="plus" size={17} /> New recording <span className="shortcut">⌘ N</span></button>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav-item ${onRecordings ? "active" : ""}`} onClick={() => navigate("/")}><Icon name="home" /> <span>Home</span></button>
      <button className={`nav-item ${onRecording ? "active" : ""}`} onClick={() => navigate("/recording")}><Icon name="monitor" /><span>Recording</span><span className="nav-count">{videoCount}</span></button>
      <div className="sidebar-bottom">
        <section className="storage-card save-location-card"><div className="storage-top"><Icon name="folder" size={14} /><span>Save location</span></div><div className="save-location-path" title={saveDirectory || "~/Documents/Recodex"}>{saveDirectory ? saveDirectory.split(/[\\/]/).filter(Boolean).slice(-2).join("/") : "Documents/Recodex"}</div><div className="save-location-actions"><button onClick={() => void onChooseSaveDirectory()}>Change</button>{saveDirectory && <button onClick={() => void onResetSaveDirectory()}>Default</button>}</div></section>
        <div className="storage-card"><div className="storage-top"><span className="storage-dot" /><span>Stored on this device</span></div><div className="storage-note">Your recordings stay private and local.</div></div>
        <div style={{ position: "relative" }}>
          <button className="profile" onClick={() => setMenuOpen((value) => !value)}><span className="avatar">A</span><span className="profile-copy"><strong>Personal workspace</strong><small>Local library</small></span><Icon name="more" size={17} /></button>
          {menuOpen && <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, background: "#F2F2F2", border: "1px solid rgba(26,26,26,.13)", borderRadius: 8, padding: 6, marginBottom: 6, zIndex: 20, display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              { label: "Account", icon: <User size={16} /> },
              { label: "Settings", icon: <SettingsIcon size={16} /> },
              { label: "Preference", icon: <SlidersHorizontal size={16} /> },
              { label: "Help", icon: <HelpCircle size={16} /> },
              { label: "Logout", icon: <LogOut size={16} /> },
            ].map((item) => (
              <button key={item.label} className="nav-item" style={{ height: 32, display: "flex", alignItems: "center", gap: 8 }} onClick={() => { setMenuOpen(false); if (item.label === "Settings") navigate("/settings"); }}>
                {item.icon} {item.label}
              </button>
            ))}
          </div>}
        </div>
      </div>
    </aside>
  );
}
