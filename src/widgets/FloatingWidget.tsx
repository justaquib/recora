import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import "../App.css";
import "./FloatingWidget.css";
import { Icon } from "../components/Icon";
import { formatTime } from "../utils/format";
import type { AnnotationTool, CameraFilter, Source, WidgetStatus } from "../shared/types";

const CAMERA_CLOSED_SIZE = new LogicalSize(240, 260);
const CAMERA_SETTINGS_SIZE = new LogicalSize(360, 624);
const AVATARS = ["🙂", "👩🏻‍💻", "👨🏽‍💻", "🧑🏼‍🎨", "🦊", "🚀"];

export default function FloatingWidget({ kind }: { kind: "camera" | "controls" }) {
  const [status, setStatus] = useState<WidgetStatus>({ active: false, paused: false, elapsed: 0, camera: false, cameraFilter: "original", avatar: AVATARS[0] });
  const [widgetElapsed, setWidgetElapsed] = useState(0);
  const [cameraDevices, setCameraDevices] = useState<Source[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [cameraLarge, setCameraLarge] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const shown = useRef(false);
  const statusRef = useRef(status);
  const elapsedBase = useRef(0);
  const runStartedAt = useRef(0);
  const elapsedRef = useRef(0);
  const cameraPreview = useRef<HTMLVideoElement>(null);
  const widgetCameraStream = useRef<MediaStream | null>(null);
  const cameraWindowPosition = useRef<PhysicalPosition | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("widget-document");
    document.body.classList.add("widget-body");
    const current = getCurrentWindow();
    if (kind !== "camera") void current.setContentProtected(true).catch((cause) => console.warn("Could not protect widget from capture", cause));
    let unlistenStatus: (() => void) | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenAnnotation: (() => void) | undefined;
    const updateVisibility = async (next: WidgetStatus) => {
      const shouldShow = kind === "controls"
        ? next.active
        : next.active && !next.saving && (next.bubble ?? next.camera);
      if (shouldShow && !shown.current) {
        try { await current.show(); shown.current = true; }
        catch (cause) { console.warn("Could not show widget", cause); }
      } else if (!shouldShow && shown.current) {
        await current.hide().catch(() => undefined);
        shown.current = false;
      }
    };
    void listen<WidgetStatus>("recora:widget-status", (event) => {
      const next = event.payload;
      const previous = statusRef.current;
      if (next.active && !previous.active) {
        elapsedBase.current = next.elapsed;
        elapsedRef.current = next.elapsed;
        setWidgetElapsed(next.elapsed);
        runStartedAt.current = Date.now();
      } else if (next.active && next.paused && !previous.paused) {
        elapsedBase.current = Math.max(elapsedRef.current, next.elapsed);
        elapsedRef.current = elapsedBase.current;
        setWidgetElapsed(elapsedBase.current);
      } else if (next.active && !next.paused && previous.paused) {
        elapsedBase.current = Math.max(elapsedRef.current, next.elapsed);
        runStartedAt.current = Date.now();
      } else if (!next.active) {
        elapsedBase.current = 0;
        elapsedRef.current = 0;
        setWidgetElapsed(0);
      }
      const merged = { ...previous, ...next, cameraFilter: next.cameraFilter ?? previous.cameraFilter ?? "original", cameraBlur: next.cameraBlur ?? previous.cameraBlur ?? false, avatar: next.avatar ?? previous.avatar ?? AVATARS[0] };
      statusRef.current = merged;
      setStatus(merged);
      void updateVisibility(merged);
    }).then((stop) => { unlistenStatus = stop; }).catch((cause) => console.warn("Could not listen for widget status", cause));
    const label = kind === "camera" ? "camera-bubble" : "recording-controls";
    void current.onMoved(({ payload }) => {
      void emitTo("recording-setup", "recora:widget-moved", { label, x: payload.x, y: payload.y }).catch(() => undefined);
    }).then((stop) => { unlistenMoved = stop; }).catch((cause) => console.warn("Could not persist widget position", cause));
    if (kind === "controls") void listen<{ tool: AnnotationTool }>("recora:annotation-state", (event) => setActiveTool(event.payload.tool))
      .then((stop) => { unlistenAnnotation = stop; }).catch((cause) => console.warn("Could not sync annotation tools", cause));
    return () => {
      unlistenStatus?.(); unlistenMoved?.(); unlistenAnnotation?.();
      document.documentElement.classList.remove("widget-document"); document.body.classList.remove("widget-body");
    };
  }, [kind]);

  useEffect(() => {
    if (kind !== "camera" || !status.active || !status.camera) return;
    let cancelled = false;
    const video = cameraPreview.current;
    const videoConstraints: MediaTrackConstraints = status.cameraDeviceId ? { deviceId: { exact: status.cameraDeviceId }, width: 640, height: 640 } : { width: 640, height: 640 };
    setCameraError("");
    void navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false }).then(async (stream) => {
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      widgetCameraStream.current = stream;
      if (video) { video.srcObject = stream; await video.play().catch(() => undefined); }
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!cancelled) setCameraDevices(devices.filter((device) => device.kind === "videoinput").map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Camera ${index + 1}` })));
    }).catch((cause) => {
      console.warn("Could not start the floating camera preview", cause);
      setCameraError("Camera preview unavailable. Check camera access in System Settings.");
      const next = { ...statusRef.current, camera: false };
      statusRef.current = next;
      setStatus(next);
      void emitTo("recording-setup", "recora:camera-settings", { camera: false }).catch(() => undefined);
    });
    return () => {
      cancelled = true;
      widgetCameraStream.current?.getTracks().forEach((track) => track.stop());
      widgetCameraStream.current = null;
      if (video) video.srcObject = null;
    };
  }, [kind, status.active, status.camera, status.cameraDeviceId]);

  useEffect(() => {
    if (kind !== "controls" || !status.active || status.paused || status.saving) return;
    const tick = () => {
      const current = elapsedBase.current + Math.floor((Date.now() - runStartedAt.current) / 1000);
      elapsedRef.current = current;
      setWidgetElapsed(current);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [kind, status.active, status.paused, status.saving]);

  const sendAction = (action: "pause" | "stop" | "home" | "microphone" | "bubble") => {
    if (statusRef.current.saving) return;
    if (action === "stop" && kind === "controls") {
      if (!statusRef.current.ready) return;
      const next = { ...statusRef.current, saving: true, savingStage: "finalizing" as const };
      statusRef.current = next;
      setStatus(next);
    }
    void emitTo("recording-setup", "recora:widget-action", { action });
  };
  const [activeTool, setActiveTool] = useState<AnnotationTool>("cursor");
  const toggleAnnotation = async (tool: AnnotationTool) => {
    if (!status.screen || tool === "off") return;
    const nextTool: AnnotationTool = tool === "cursor" || activeTool === tool ? "cursor" : tool;
    setActiveTool(nextTool);
    try {
      if (nextTool === "cursor") await emitTo("recording-setup", "recora:annotation-request", { tool: nextTool });
      else {
        await emitTo("annotation-overlay", "recora:annotation-tool", { tool: nextTool }).catch(() => undefined);
        await emitTo("recording-setup", "recora:annotation-request", { tool: nextTool });
      }
    } catch (cause) { console.warn("Could not activate annotation tool", cause); }
  };
  const beginDrag = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, select, input, [data-no-drag='true']")) return;
    void getCurrentWindow().startDragging().catch((cause) => console.warn("Could not move floating widget", cause));
  };
  const updateCameraSetting = (patch: Partial<Pick<WidgetStatus, "camera" | "cameraDeviceId" | "cameraFilter" | "cameraBlur" | "avatar">>) => {
    const next = { ...statusRef.current, ...patch };
    statusRef.current = next;
    setStatus(next);
    const { camera, cameraDeviceId } = patch;
    if (camera !== undefined || cameraDeviceId !== undefined) {
      void emitTo("recording-setup", "recora:camera-settings", { camera, cameraDeviceId });
    }
  };
  const toggleSettings = async () => {
    const current = getCurrentWindow();
    try {
      const scale = await current.scaleFactor();
      if (!settingsOpen) {
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setCameraDevices(devices.filter((device) => device.kind === "videoinput").map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Camera ${index + 1}` })));
        const position = await current.outerPosition();
        cameraWindowPosition.current = position;
        await current.setSize(CAMERA_SETTINGS_SIZE);
        await current.setPosition(new PhysicalPosition(position.x - Math.round(64 * scale), position.y));
        setSettingsOpen(true);
      } else {
        await current.setSize(CAMERA_CLOSED_SIZE);
        if (cameraWindowPosition.current) await current.setPosition(cameraWindowPosition.current);
        cameraWindowPosition.current = null;
        setSettingsOpen(false);
        setAvatarPickerOpen(false);
      }
    } catch (cause) { console.warn("Could not resize camera widget", cause); }
  };
  const changeCamera = (enabled: boolean) => {
    updateCameraSetting({ camera: enabled });
  };

  if (kind === "camera") {
    const filterClass = `camera-filter-${status.cameraFilter ?? "original"}`;
    const videoFilter = [status.cameraFilter === "warm" ? "sepia(.28) saturate(1.15)" : status.cameraFilter === "mono" ? "grayscale(1)" : "", status.cameraBlur ? "blur(2px)" : ""].filter(Boolean).join(" ") || "none";
    const avatar = status.avatar || AVATARS[0];
    return <div className={`floating-root camera-widget-root ${settingsOpen ? "camera-settings-open" : ""}`} onMouseDown={beginDrag}>
      <div className="camera-bubble-area">
        <div className={`camera-widget-frame ${filterClass} ${cameraLarge ? "camera-frame-large" : ""}`} data-tauri-drag-region="true" title="Drag to move camera">
          {status.camera && status.active
            ? <video ref={cameraPreview} autoPlay playsInline muted style={{ filter: videoFilter }} />
            : <div className="camera-widget-placeholder"><div className="camera-avatar">{avatar}</div><span>Camera off</span></div>}
          {status.camera && status.active && <span className="camera-widget-live"><i /> LIVE</span>}
          <button className="camera-resize-button" onClick={() => setCameraLarge((large) => !large)} aria-label={cameraLarge ? "Shrink camera bubble" : "Enlarge camera bubble"} title={cameraLarge ? "Shrink" : "Enlarge"}><Icon name={cameraLarge ? "shrink" : "expand"} size={14} /></button>
        </div>
        <div className="camera-bubble-actions" data-no-drag="true">
          <button className={`camera-action-button ${status.camera ? "" : "camera-action-muted"}`} onClick={() => changeCamera(!status.camera)} aria-label={status.camera ? "Turn off camera" : "Turn on camera"} title={status.camera ? "Turn off camera" : "Turn on camera"}><Icon name="camera" size={16} /></button>
          <button className="camera-action-button camera-settings-trigger" onClick={() => void toggleSettings()} aria-expanded={settingsOpen} aria-label={settingsOpen ? "Close camera settings" : "Open camera settings"} title="Camera settings"><Icon name={settingsOpen ? "close" : "chevronDown"} size={15} /></button>
        </div>
      </div>
      {settingsOpen && <section className="camera-settings-panel" aria-label="Camera settings" data-no-drag="true">
        <header className="camera-settings-header"><strong>Camera settings</strong><button onClick={() => void toggleSettings()} aria-label="Close camera settings"><Icon name="close" size={16} /></button></header>
        {cameraError && <div className="camera-panel-error">{cameraError}</div>}
        <label className="camera-device-select"><Icon name="camera" size={17} /><select aria-label="Choose camera" value={status.cameraDeviceId ?? ""} onChange={(event) => updateCameraSetting({ cameraDeviceId: event.target.value })}>
          {cameraDevices.length === 0 && <option value="">Camera unavailable</option>}
          {cameraDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
        </select><Icon name="chevronDown" size={15} /></label>
        <div className="camera-settings-divider" />
        <div className="camera-panel-section-heading"><span>Filter</span><small>{status.cameraFilter ?? "original"} selected</small></div>
        <div className="camera-filter-options">
          {(["original", "warm", "mono"] as CameraFilter[]).map((filter) => <button key={filter} className={`camera-filter-option ${filterClass === `camera-filter-${filter}` ? "selected" : ""}`} onClick={() => updateCameraSetting({ cameraFilter: filter })} aria-pressed={filterClass === `camera-filter-${filter}`}>
            <span className={`camera-filter-preview camera-filter-${filter}`}><span>{avatar}</span></span><small>{filter === "mono" ? "Mono" : filter === "warm" ? "Warm" : "Original"}</small>
          </button>)}
        </div>
        <div className="camera-settings-divider" />
        <div className="camera-blur-row"><div><strong>Blur background</strong><small>Apply a soft blur to the preview</small></div><button role="switch" aria-checked={Boolean(status.cameraBlur)} className={`camera-settings-switch ${status.cameraBlur ? "on" : ""}`} onClick={() => updateCameraSetting({ cameraBlur: !status.cameraBlur })}><i /></button></div>
        <div className="camera-settings-divider" />
        <button className="camera-avatar-option" onClick={() => setAvatarPickerOpen((open) => !open)} aria-expanded={avatarPickerOpen}><span className="camera-avatar-option-icon">{avatar}</span><span><strong>Choose avatar</strong><small>Use an avatar instead of video</small></span><Icon name="chevronRight" size={16} /></button>
        {avatarPickerOpen && <div className="camera-avatar-grid">{AVATARS.map((item) => <button key={item} className={avatar === item ? "selected" : ""} onClick={() => { updateCameraSetting({ avatar: item, camera: false }); setAvatarPickerOpen(false); }} aria-label={`Choose ${item} avatar`}>{item}</button>)}</div>}
        <div className="camera-settings-divider" />
        <button className={`camera-power-action ${status.camera ? "turn-off" : "turn-on"}`} onClick={() => changeCamera(!status.camera)}><Icon name={status.camera ? "cameraOff" : "camera"} size={17} />{status.camera ? "Turn off camera" : "Turn on camera"}</button>
      </section>}
    </div>;
  }

  return <div className="floating-root controls-widget-root" onMouseDown={beginDrag} title="Drag to move">
    <div className={`controls-widget ${status.saving ? "is-saving" : ""}`}>
      {status.saving ? <div className="widget-saving-state" role="status" aria-live="polite">
        <span className="saving-spinner" aria-hidden="true" />
        <div className="widget-saving-copy"><strong>{status.savingStage === "finalizing" ? "FINALIZING RECORDING" : "SAVING RECORDING"}</strong><small>{status.savingStage === "finalizing" ? "Please wait while the video is prepared" : "Please wait while your video is saved"}</small></div>
      </div> : <>
        <div className="widget-drag-grip" aria-hidden="true">⠿</div>
        <button className="widget-control stop-widget" disabled={!status.ready} onClick={() => sendAction("stop")} aria-label="Stop recording" title="Stop recording"><Icon name="stop" size={14} /></button>
        <span className="widget-time">{formatTime(widgetElapsed)}</span>
        <div className="widget-divider" />
        <button className="widget-control pause-widget" disabled={!status.ready} onClick={() => sendAction("pause")} aria-label={status.paused ? "Resume recording" : "Pause recording"} title={status.paused ? "Resume" : "Pause"}><Icon name={status.paused ? "play" : "pause"} size={16} /></button>
        <button className={`widget-control microphone-widget ${status.microphone ? "" : "is-muted"}`} disabled={!status.ready || !status.microphoneAvailable} onClick={() => sendAction("microphone")} aria-label={status.microphone ? "Mute microphone" : "Unmute microphone"} title={status.microphone ? "Mute microphone" : status.microphoneAvailable ? "Unmute microphone" : "Microphone was unavailable when recording started"}><Icon name={status.microphone ? "mic" : "micOff"} size={16} /></button>
        <button className={`widget-control camera-bubble-toggle ${status.bubble ? "selected" : ""}`} disabled={!status.ready || !status.screen} onClick={() => sendAction("bubble")} aria-label={status.bubble ? "Hide camera bubble and turn off camera" : "Show camera bubble"} title={status.bubble ? "Hide camera bubble and turn off camera" : "Show camera bubble"}><Icon name={status.bubble ? "camera" : "cameraOff"} size={16} /></button>
        <button className={`widget-control tool-widget annotate-toggle ${activeTool !== "cursor" ? "selected" : ""}`} disabled={!status.screen} onClick={() => void toggleAnnotation(activeTool === "cursor" ? "pen" : "cursor")} aria-label={activeTool === "cursor" ? "Open annotation tools" : "Return to cursor mode"} title={activeTool === "cursor" ? "Annotate" : "Cursor mode"}><Icon name="pen" size={16} /></button>
        <button className="widget-control home-widget-button" onClick={() => sendAction("home")} aria-label="Open Recora library" title="Open Recora library"><Icon name="home" size={17} /></button>
      </>}
    </div>
  </div>;
}
