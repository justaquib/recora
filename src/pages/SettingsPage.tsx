import PageFooter from "../components/PageFooter";
import { useLocation } from "react-router-dom";
import { UserRound, SlidersHorizontal, CircleHelp, Folder, ShieldCheck, RotateCcw, HardDrive, Bell, Monitor, Keyboard, Mail, ChevronRight, Camera } from "lucide-react";
import type { RecordingPreferences } from "../shared/types";

type Props = { saveDirectory: string; recordingPreferences: RecordingPreferences; onChooseSaveDirectory: () => void; onResetSaveDirectory: () => void; onRecordingPreferencesChange: (preferences: RecordingPreferences) => void };
const pages = {
  "/account": { title: "Account", description: "Your Recodex workspace profile." },
  "/settings": { title: "Settings", description: "Manage how Recodex works on this device." },
  "/preferences": { title: "Preferences", description: "Personalize your workspace and recording defaults." },
  "/help": { title: "Help & support", description: "Quick answers and support resources." },
};

export default function SettingsPage({ saveDirectory, recordingPreferences, onChooseSaveDirectory, onResetSaveDirectory, onRecordingPreferencesChange }: Props) {
  const { pathname } = useLocation();
  const page = pages[pathname as keyof typeof pages] || pages["/settings"];
  const savePath = saveDirectory || "~/Documents/Recodex";

  const updateRecordingPreferences = (updates: Partial<RecordingPreferences>) => {
    const next = { ...recordingPreferences, ...updates };
    onRecordingPreferencesChange(next);
  };

  return <section className="library-page settings-page">
    <div className="page-heading settings-heading"><div><div className="eyebrow">WORKSPACE</div><h1>{page.title}</h1><p>{page.description}</p></div><span className="settings-local-badge"><ShieldCheck size={14} /> Private by default</span></div>
    <div className="settings-content settings-single-page">
      {pathname === "/account" && <section className="settings-section">
        <div className="settings-panel">
          <div className="account-panel"><div className="account-avatar">A</div><div className="settings-row-copy"><strong>Personal workspace</strong><span>Workspace name</span></div><span className="settings-state"><span /> Active</span></div>
          <div className="settings-divider" /><div className="settings-info-row"><span>Account type</span><strong>Local account</strong></div><div className="settings-divider" /><div className="settings-info-row"><span>Sign-in</span><strong>Not required</strong></div>
        </div>
        <div className="settings-footnote"><HardDrive size={14} /> Your library and workspace details are stored on this device.</div>
      </section>}

      {pathname === "/settings" && <section className="settings-section">
        <div className="settings-panel">
          <div className="settings-info-row"><div className="settings-info-icon"><Monitor size={15} /><span><strong>Appearance</strong><small>Theme used across Recodex</small></span></div><span className="settings-placeholder">System default</span></div>
          <div className="settings-divider" />
          <div className="settings-info-row"><div className="settings-info-icon"><Bell size={15} /><span><strong>Notifications</strong><small>Recording completion and app updates</small></span></div><span className="settings-placeholder">Enabled</span></div>
          <div className="settings-divider" />
          <div className="settings-info-row"><div className="settings-info-icon"><Keyboard size={15} /><span><strong>Keyboard shortcut</strong><small>Start a new recording</small></span></div><kbd className="settings-shortcut">⌘ N</kbd></div>
        </div>
        <p className="settings-placeholder-note">These controls are placeholders and will be configurable in a future update.</p>
      </section>}

      {pathname === "/preferences" && <section className="settings-section">
        <div className="settings-panel settings-capture-mode"><strong>Capture mode</strong><div className="mode-switch"><button className={recordingPreferences.captureMode === "screen" ? "active" : ""} onClick={() => updateRecordingPreferences({ captureMode: "screen" })}><Monitor size={16} /> Screen</button><button className={recordingPreferences.captureMode === "camera" ? "active" : ""} onClick={() => updateRecordingPreferences({ captureMode: "camera" })}><Camera size={16} /> Camera only</button></div></div>
        <div className="settings-panel settings-toggle-list">
          <div className="settings-toggle-row"><div><strong>Microphone audio</strong><small>Include voice audio by default</small></div><button role="switch" aria-checked={recordingPreferences.micEnabled} className={`switch ${recordingPreferences.micEnabled ? "on" : ""}`} onClick={() => updateRecordingPreferences({ micEnabled: !recordingPreferences.micEnabled })}><i /></button></div>
          <div className="settings-divider" />
          <div className="settings-device-row"><div><strong>Microphone</strong><small>Input device</small></div><select aria-label="Preferred microphone" value={recordingPreferences.micId || ""} disabled={!recordingPreferences.microphones?.length} onChange={(event) => updateRecordingPreferences({ micId: event.target.value })}>{recordingPreferences.microphones?.length ? recordingPreferences.microphones.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>) : <option value="">Open recording setup to load devices</option>}</select></div>
          <div className="settings-divider" />
          <div className="settings-toggle-row"><div><strong>Camera video</strong><small>Show the camera bubble by default</small></div><button role="switch" aria-checked={recordingPreferences.cameraEnabled} className={`switch ${recordingPreferences.cameraEnabled ? "on" : ""}`} onClick={() => updateRecordingPreferences({ cameraEnabled: !recordingPreferences.cameraEnabled })}><i /></button></div>
          <div className="settings-divider" />
          <div className="settings-device-row"><div><strong>Camera</strong><small>Video input device</small></div><select aria-label="Preferred camera" value={recordingPreferences.cameraId || ""} disabled={!recordingPreferences.cameras?.length} onChange={(event) => updateRecordingPreferences({ cameraId: event.target.value })}>{recordingPreferences.cameras?.length ? recordingPreferences.cameras.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>) : <option value="">Open recording setup to load devices</option>}</select></div>
          <div className="settings-divider" />
          <div className="settings-countdown"><div><strong>Countdown</strong><small>Delay before recording starts</small></div><label><input type="range" min="0" max="10" step="1" value={recordingPreferences.countdownDuration} onChange={(event) => updateRecordingPreferences({ countdownDuration: Number(event.target.value) })} /><span>{recordingPreferences.countdownDuration === 0 ? "Off" : `${recordingPreferences.countdownDuration} sec`}</span></label></div>
        </div>
        <div className="settings-panel mt-3">
          <div className="settings-row settings-save-row"><div className="settings-row-icon"><Folder size={16} /></div><div className="settings-row-copy"><strong>Save location</strong><span title={savePath}>{savePath}</span></div><div className="settings-row-actions"><button className="button secondary" onClick={onChooseSaveDirectory}>Change folder</button>{saveDirectory && <button className="settings-reset" onClick={onResetSaveDirectory} title="Use the default folder" aria-label="Use the default save folder"><RotateCcw size={15} /></button>}</div></div>
          <div className="settings-divider" /><div className="settings-default-note">New recordings and exports use this folder. The default is <strong>Documents/Recodex</strong>.</div>
        </div>
        <div className="settings-panel settings-preference-placeholder"><div className="settings-info-icon"><Bell size={15} /><span><strong>Recording reminders</strong><small>Show a reminder before recording starts</small></span></div><span className="settings-placeholder">On</span></div>
        <p className="settings-placeholder-note">Additional preferences are sample data for now.</p>
      </section>}

      {pathname === "/help" && <section className="settings-section">
        <div className="settings-panel settings-help-panel">
          <details className="settings-help-item"><summary>Where are my recordings stored?<ChevronRight size={15} /></summary><p>Recordings stay in the local Recodex library and are copied to your selected save location. The default folder is Documents/Recodex.</p></details>
          <details className="settings-help-item"><summary>How do I start a recording?<ChevronRight size={15} /></summary><p>Select New recording in the sidebar, choose a screen or window, then start the capture.</p></details>
          <details className="settings-help-item"><summary>How can I get more help?<ChevronRight size={15} /></summary><p>Support contact details and documentation links will be added here.</p></details>
        </div>
        <div className="settings-panel settings-contact-card"><div className="settings-section-icon"><Mail size={16} /></div><div><strong>Contact support</strong><span>developer@justaquib.com</span></div></div>
      </section>}
    </div>
    <PageFooter />
  </section>;
}
