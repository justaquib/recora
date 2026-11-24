import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Icon } from "./Icon";
import { UserRound, Settings, SlidersHorizontal, CircleHelp } from "lucide-react";

type Props = {
  videoCount: number;
  onNewRecording: () => void;
};

export default function Sidebar({ videoCount, onNewRecording }: Props) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const onRecordings = location.pathname === "/" || location.pathname.startsWith("/recordings");
  const onRecording = location.pathname === "/recording";
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate("/")} aria-label="Recodex home"><span className="brand-mark"><Icon name="logo" size={22} /></span><span>Recodex</span></button>
      <button className="new-recording" onClick={() => void onNewRecording()}><Icon name="plus" size={17} /> New recording <span className="shortcut">⌘ N</span></button>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav-item ${onRecordings ? "active" : ""}`} onClick={() => navigate("/")}><Icon name="home" /> <span>Home</span></button>
      <button className={`nav-item ${onRecording ? "active" : ""}`} onClick={() => navigate("/recording")}><Icon name="monitor" /><span>Recording</span><span className="nav-count">{videoCount}</span></button>
      <div className="sidebar-bottom">
        <div className="storage-card"><div className="storage-top"><span className="storage-dot" /><span>Stored on this device</span></div><div className="storage-note">Your recordings stay private and local.</div></div>
        <div className="profile-menu-anchor">
          {menuOpen && <div className="profile-menu" role="menu" aria-label="Workspace menu">{[
            { label: "Account", path: "/account", icon: <Icon lucide={UserRound} size={15} /> },
            { label: "Settings", path: "/settings", icon: <Icon lucide={Settings} size={15} /> },
            { label: "Preferences", path: "/preferences", icon: <Icon lucide={SlidersHorizontal} size={15} /> },
            { label: "Help", path: "/help", icon: <Icon lucide={CircleHelp} size={15} /> },
          ].map((item) => <button key={item.path} role="menuitem" className={location.pathname === item.path ? "selected" : ""} onClick={() => { setMenuOpen(false); navigate(item.path); }}>{item.icon}<span>{item.label}</span></button>)}</div>}
          <div className="profile">
            <button className="profile-main" onClick={() => navigate("/account")}><span className="avatar">A</span><span className="profile-copy"><strong>Personal workspace</strong><small>Local library</small></span></button>
            <button className="profile-menu-trigger" aria-label="Open workspace menu" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><Icon name="more" size={17} /></button>
          </div>
        </div>
      </div>
    </aside>
  );
}
