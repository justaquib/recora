import PageFooter from "../components/PageFooter";
import { Icon } from "../components/Icon";
import { Bell, Keyboard, Monitor, ShieldCheck } from "lucide-react";

export default function SettingsPage() {
  return <section className="library-page settings-page">
    <div className="page-heading settings-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Settings</h1><p>Manage how Recodex works on this device.</p></div><span className="settings-local-badge"><Icon lucide={ShieldCheck} size={14} /> Private by default</span></div>
    <div className="settings-content settings-single-page">
      <section className="settings-section">
        <div className="settings-panel">
          <div className="settings-info-row"><div className="settings-info-icon"><Icon lucide={Monitor} size={15} /><span><strong>Appearance</strong><small>Theme used across Recodex</small></span></div><span className="settings-placeholder">System default</span></div>
          <div className="settings-divider" />
          <div className="settings-info-row"><div className="settings-info-icon"><Icon lucide={Bell} size={15} /><span><strong>Notifications</strong><small>Recording completion and app updates</small></span></div><span className="settings-placeholder">Enabled</span></div>
          <div className="settings-divider" />
          <div className="settings-info-row"><div className="settings-info-icon"><Icon lucide={Keyboard} size={15} /><span><strong>Keyboard shortcut</strong><small>Start a new recording</small></span></div><kbd className="settings-shortcut">⌘ N</kbd></div>
        </div>
        <p className="settings-placeholder-note">These controls are placeholders and will be configurable in a future update.</p>
      </section>
    </div>
    <PageFooter />
  </section>;
}
