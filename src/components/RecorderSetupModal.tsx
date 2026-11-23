import { Icon } from "./Icon";
import type { CaptureMode, Source } from "../shared/types";

type Props = {
  open: boolean;
  busy: boolean;
  error: string;
  captureMode: CaptureMode;
  onCaptureModeChange: (mode: CaptureMode) => void;
  cameraEnabled: boolean;
  onCameraEnabledChange: (enabled: boolean) => void;
  micEnabled: boolean;
  onMicEnabledChange: (enabled: boolean) => void;
  microphones: Source[];
  cameras: Source[];
  micId: string;
  onMicChange: (deviceId: string) => void;
  cameraId: string;
  onCameraChange: (deviceId: string) => void;
  countdownDuration: number;
  onCountdownChange: (seconds: number) => void;
  onOpenPrivacySettings: () => void;
  onClose: () => void;
  onStart: () => void;
};

export default function RecorderSetupModal(props: Props) {
  if (!props.open) return null;
  const { busy, error, captureMode, onCaptureModeChange, cameraEnabled, onCameraEnabledChange, micEnabled, onMicEnabledChange, microphones, cameras, micId, onMicChange, cameraId, onCameraChange, countdownDuration, onCountdownChange, onOpenPrivacySettings, onClose, onStart } = props;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="recorder-modal" role="dialog" aria-modal="true" aria-labelledby="recorder-heading">
      <div className="modal-header"><div className="modal-brand"><span className="brand-mark"><Icon name="logo" size={18} /></span><span>RECORDER</span></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close setup"><Icon name="close" /></button></div>
      <div className="modal-content"><div className="eyebrow">A LITTLE PREPARATION</div><h2 id="recorder-heading">Set up your recording</h2><p className="modal-lede">Choose what to capture. You can start in seconds.</p>
        <div className="mode-switch"><button className={captureMode === "screen" ? "active" : ""} onClick={() => onCaptureModeChange("screen")}><Icon name="monitor" size={18} /> Screen</button><button className={captureMode === "camera" ? "active" : ""} onClick={() => onCaptureModeChange("camera")}><Icon name="camera" size={18} /> Camera only</button></div>
        {captureMode === "screen" && <div className="source-row"><span className="source-icon"><Icon name="monitor" /></span><div className="source-info"><strong>Screen or window</strong><small>Choose what to share after you start</small></div><span className="source-arrow">↗</span></div>}
        <div className="source-row"><span className="source-icon"><Icon name="mic" /></span><div className="source-info"><strong>Microphone audio</strong><small>{micEnabled ? "Voice audio enabled" : "No microphone audio"}</small></div><div className="source-actions">{microphones.length > 1 && <select aria-label="Select microphone" value={micId} onChange={(event) => onMicChange(event.target.value)}>{microphones.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select>}<button className={`switch ${micEnabled ? "on" : ""}`} onClick={() => onMicEnabledChange(!micEnabled)} aria-label="Toggle microphone audio"><i /></button></div></div>
        {captureMode === "screen" && <div className="source-row"><span className="source-icon"><Icon name="camera" /></span><div className="source-info"><strong>Camera video</strong><small>{cameraEnabled ? "Live camera in the bubble" : "Avatar bubble while camera is off"}</small></div><div className="source-actions">{cameras.length > 1 && <select aria-label="Select camera" value={cameraId} onChange={(event) => onCameraChange(event.target.value)}>{cameras.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select>}<button className={`switch ${cameraEnabled ? "on" : ""}`} onClick={() => onCameraEnabledChange(!cameraEnabled)} aria-label="Toggle camera video"><i /></button></div></div>}
        <div className="countdown-setting"><div><strong>Countdown</strong><small>Give yourself a moment before recording</small></div><label><input type="range" min="0" max="10" step="1" value={countdownDuration} onChange={(event) => onCountdownChange(Number(event.target.value))} /><span>{countdownDuration === 0 ? "Off" : `${countdownDuration} sec`}</span></label></div>
        <div className="permission-note"><span className="permission-check"><Icon name="check" size={13} /></span><span>Recording stays on this device. Nothing is uploaded.</span></div>
        {error && <div className="error-message"><strong>Couldn’t start recording</strong><span>{error}</span>{/System Settings.*Privacy & Security/i.test(error) && <button className="text-button" onClick={onOpenPrivacySettings}>Open privacy settings</button>}</div>}
        <button className="button primary modal-start" onClick={onStart} disabled={busy}>{busy ? <><span className="spinner" /> Preparing…</> : <>Start recording <span className="start-shortcut">⌘ ↵</span></>}</button><div className="modal-bottom-note">Your Mac may ask you to allow screen, microphone, or camera access.</div>
      </div>
    </div>
  </div>;
}
