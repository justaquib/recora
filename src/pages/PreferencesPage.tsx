import PageFooter from "../components/PageFooter";
import { Icon } from "../components/Icon";
import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Camera, Folder, Monitor, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { RecordingPreferences } from "../shared/types";

type Props = { saveDirectory: string; recordingPreferences: RecordingPreferences; onChooseSaveDirectory: () => void; onResetSaveDirectory: () => void; onRecordingPreferencesChange: (preferences: RecordingPreferences) => void };

export default function PreferencesPage({ saveDirectory, recordingPreferences, onChooseSaveDirectory, onResetSaveDirectory, onRecordingPreferencesChange }: Props) {
  const savePath = saveDirectory || "~/Documents/Recodex";
  const [ringColor, setRingColor] = useState(() => localStorage.getItem("camera-ring-color") || "#4C8DF1");
  const [ringThickness, setRingThickness] = useState(() => Number(localStorage.getItem("camera-ring-thickness")) || 4);

  useEffect(() => { localStorage.setItem("camera-ring-color", ringColor); }, [ringColor]);
  useEffect(() => { localStorage.setItem("camera-ring-thickness", String(ringThickness)); }, [ringThickness]);

  const updateRecordingPreferences = (updates: Partial<RecordingPreferences>) => {
    const next = { ...recordingPreferences, ...updates };
    onRecordingPreferencesChange(next);
  };

  const toggleCameraBubble = async () => {
    try {
      const window = await WebviewWindow.getByLabel("camera-bubble");
      if (!window) return;
      const visible = await window.isVisible();
      if (visible) {
        await emitTo("camera-bubble", "recodex:widget-status", { active: false, recording: false, camera: false, bubble: false });
        await window.hide();
      } else {
        await window.show();
        await emitTo("camera-bubble", "recodex:widget-status", { active: true, recording: false, paused: false, elapsed: 0, camera: true, microphone: false, microphoneAvailable: false, screen: false, bubble: true });
      }
    } catch (cause) { console.warn("Could not toggle camera bubble", cause); }
  };

  return <section className="library-page settings-page">
    <div className="page-heading settings-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Preferences</h1><p>Personalize your workspace and recording defaults.</p></div><span className="settings-local-badge"><Icon lucide={ShieldCheck} size={14} /> Private by default</span></div>
    <div className="settings-content settings-single-page">
      <section className="settings-section">
        <div className="settings-panel settings-capture-mode"><strong>Capture mode</strong><div className="mode-switch"><button className={recordingPreferences.captureMode === "screen" ? "active" : ""} onClick={() => updateRecordingPreferences({ captureMode: "screen" })}><Icon lucide={Monitor} size={16} /> Screen</button><button className={recordingPreferences.captureMode === "camera" ? "active" : ""} onClick={() => updateRecordingPreferences({ captureMode: "camera" })}><Icon lucide={Camera} size={16} /> Camera only</button></div></div>
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
          <div className="settings-row"><div className="settings-row-copy"><strong>Camera bubble ring color</strong><small>Color of the camera bubble border</small></div><div className="settings-row-actions" style={{ gap: 6, flexWrap: "wrap" }}>{["#4C8DF1", "#E01A4F", "#10B981", "#F59E0B", "#8B5CF6", "#FFFFFF", "#000000", "#F2F2F2"].map((color) => <button key={color} onClick={() => setRingColor(color)} style={{ width: 22, height: 22, borderRadius: "50%", border: ringColor === color ? "2px solid var(--accent)" : "1px solid var(--line)", background: color, cursor: "pointer" }} aria-label={`Use ${color} ring color`} />)}</div></div>
          <div className="settings-divider" />
          <div className="settings-countdown px-3.5"><div><strong>Camera bubble ring thickness</strong><small>Border width in pixels</small></div><label><input type="range" min="1" max="12" value={ringThickness} onChange={(event) => setRingThickness(Number(event.target.value))} /><span>{ringThickness}px</span></label></div>
        </div>
        <div className="settings-panel mt-3">
          <div className="settings-info-row"><div className="settings-info-icon"><Icon lucide={Camera} size={15} /><span><strong>Floating camera bubble</strong><small>Open the camera bubble without recording</small></span></div><button className="button secondary" onClick={() => void toggleCameraBubble()}>Open / Close</button></div>
        </div>
        <div className="settings-panel mt-3">
          <div className="settings-device-row"><div><strong>Audio sample rate</strong><small>Recording microphone sample rate</small></div><select aria-label="Audio sample rate" value={recordingPreferences.audioSampleRate || 48000} onChange={(event) => onRecordingPreferencesChange({ ...recordingPreferences, audioSampleRate: Number(event.target.value) })}><option value={44100}>44.1 kHz</option><option value={48000}>48 kHz</option></select></div>
          <div className="settings-divider" />
          <div className="settings-device-row"><div><strong>Audio bitrate</strong><small>Export audio bitrate</small></div><select aria-label="Audio bitrate" value={recordingPreferences.audioBitrate || 128000} onChange={(event) => onRecordingPreferencesChange({ ...recordingPreferences, audioBitrate: Number(event.target.value) })}><option value={64000}>64 kbps</option><option value={128000}>128 kbps</option><option value={192000}>192 kbps</option></select></div>
          <div className="settings-divider" />
          <div className="settings-toggle-row"><div><strong>Echo cancellation</strong><small>Reduce echo in browser capture</small></div><button role="switch" aria-checked={recordingPreferences.audioEchoCancellation ?? true} className={`switch ${(recordingPreferences.audioEchoCancellation ?? true) ? "on" : ""}`} onClick={() => onRecordingPreferencesChange({ ...recordingPreferences, audioEchoCancellation: !(recordingPreferences.audioEchoCancellation ?? true) })}><i /></button></div>
          <div className="settings-divider" />
          <div className="settings-toggle-row"><div><strong>Noise suppression</strong><small>Reduce background noise in browser capture</small></div><button role="switch" aria-checked={recordingPreferences.audioNoiseSuppression ?? true} className={`switch ${(recordingPreferences.audioNoiseSuppression ?? true) ? "on" : ""}`} onClick={() => onRecordingPreferencesChange({ ...recordingPreferences, audioNoiseSuppression: !(recordingPreferences.audioNoiseSuppression ?? true) })}><i /></button></div>
        </div>
        <div className="settings-panel mt-3">
          <div className="settings-row settings-save-row"><div className="settings-row-icon"><Icon lucide={Folder} size={16} /></div><div className="settings-row-copy"><strong>Save location</strong><span title={savePath}>{savePath}</span></div><div className="settings-row-actions"><button className="button secondary" onClick={onChooseSaveDirectory}>Change folder</button>{saveDirectory && <button className="settings-reset" onClick={onResetSaveDirectory} title="Use the default folder" aria-label="Use the default save folder"><Icon lucide={RotateCcw} size={15} /></button>}</div></div>
          <div className="settings-divider" /><div className="settings-default-note">New recordings and exports use this folder. The default is <strong>Documents/Recodex</strong>.</div>
        </div>
      </section>
    </div>
    <PageFooter />
  </section>;
}
