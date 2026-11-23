import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "../App.css";
import { Icon } from "../components/Icon";
import { formatTime } from "../utils/format";
import type { AnnotationTool, WidgetStatus } from "../shared/types";

export default function FloatingWidget({ kind }: { kind: "camera" | "controls" | "home" }) {
  const [status, setStatus] = useState<WidgetStatus>({ active: false, paused: false, elapsed: 0, camera: false });
  const [widgetElapsed, setWidgetElapsed] = useState(0);
  const shown = useRef(false);
  const statusRef = useRef(status);
  const elapsedBase = useRef(0);
  const runStartedAt = useRef(0);
  const elapsedRef = useRef(0);
  const cameraPreview = useRef<HTMLVideoElement>(null);
  const widgetCameraStream = useRef<MediaStream | null>(null);

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
        : next.active && !next.saving && (kind !== "camera" || (next.bubble ?? next.camera));
      if (shouldShow && !shown.current) {
        try {
          await current.show();
          shown.current = true;
        } catch (cause) { console.warn("Could not show widget", cause); }
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
      statusRef.current = next;
      setStatus(event.payload);
      void updateVisibility(event.payload);
    }).then((stop) => { unlistenStatus = stop; }).catch((cause) => console.warn("Could not listen for widget status", cause));
    const label = kind === "camera" ? "camera-bubble" : kind === "controls" ? "recording-controls" : "quick-home";
    void current.onMoved(({ payload }) => {
      void emitTo("main", "recora:widget-moved", { label, x: payload.x, y: payload.y }).catch(() => undefined);
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
    void navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false }).then(async (stream) => {
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      widgetCameraStream.current = stream;
      if (video) { video.srcObject = stream; await video.play().catch(() => undefined); }
    }).catch((cause) => console.warn("Could not start the floating camera preview", cause));
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

  const sendAction = (action: "pause" | "stop" | "home") => {
    if (statusRef.current.saving) return;
    if (action === "stop" && kind === "controls") {
      if (!statusRef.current.ready) return;
      const next = { ...statusRef.current, saving: true, savingStage: "finalizing" as const };
      statusRef.current = next;
      setStatus(next);
    }
    void emitTo(action === "home" ? "main" : "recording-setup", "recora:widget-action", { action });
  };
  const [activeTool, setActiveTool] = useState<AnnotationTool>("cursor");
  const toggleAnnotation = async (tool: AnnotationTool) => {
    if (!status.screen || tool === "off") return;
    const nextTool: AnnotationTool = tool === "cursor" || activeTool === tool ? "cursor" : tool;
    setActiveTool(nextTool);
    try {
      if (nextTool === "cursor") await emitTo("recording-setup", "recora:annotation-request", { tool: nextTool });
      else {
        // Open the toolbar immediately; the main window supplies the frozen screen image next.
        await emitTo("annotation-overlay", "recora:annotation-tool", { tool: nextTool }).catch(() => undefined);
        await emitTo("recording-setup", "recora:annotation-request", { tool: nextTool });
      }
    } catch (cause) { console.warn("Could not activate annotation tool", cause); }
  };
  const beginDrag = (event: React.MouseEvent<HTMLElement>, allowButton = false) => {
    if (!allowButton && (event.target as HTMLElement).closest("button")) return;
    void getCurrentWindow().startDragging().catch((cause) => console.warn("Could not move floating widget", cause));
  };
  if (kind === "camera") {
    return <div className="floating-root camera-widget-root" data-tauri-drag-region="true" onMouseDown={beginDrag} title="Drag to move">
      <div className="camera-widget-frame" data-tauri-drag-region="true">
        {status.active && status.camera ? <video ref={cameraPreview} autoPlay playsInline muted /> : <div className="camera-widget-placeholder"><div className="camera-avatar">R</div></div>}
        <span className="camera-widget-live"><i /> {status.camera ? "LIVE" : "AVATAR"}</span>
      </div>
    </div>;
  }
  if (kind === "home") return <div className="floating-root home-widget-root"><button className="home-widget" onMouseDown={(event) => beginDrag(event, true)} onClick={() => sendAction("home")} aria-label="Open Recora library" title="Drag to move · Click to open Recora library"><Icon name="home" size={21} /></button></div>;
  return <div className="floating-root controls-widget-root" onMouseDown={beginDrag} title="Drag to move">
    <div className={`controls-widget ${status.saving ? "is-saving" : ""}`} onMouseDown={beginDrag}>
      {status.saving ? <div className="widget-saving-state" role="status" aria-live="polite">
        <span className="saving-spinner" aria-hidden="true" />
        <div className="widget-saving-copy"><strong>{status.savingStage === "finalizing" ? "FINALIZING RECORDING" : "SAVING RECORDING"}</strong><small>{status.savingStage === "finalizing" ? "Please wait while the video is prepared" : "Please wait while your video is saved"}</small></div>
      </div> : <>
        <div className="widget-rec"><span className={`widget-rec-dot ${status.paused ? "is-paused" : ""}`} /><div><strong>{status.paused ? "PAUSED" : "REC"}</strong><small>{formatTime(widgetElapsed)}</small></div></div>
        <div className="widget-divider" />
        <button className={`widget-control tool-widget annotate-toggle ${activeTool !== "cursor" ? "selected" : ""}`} disabled={!status.screen} onClick={() => void toggleAnnotation(activeTool === "cursor" ? "pen" : "cursor")} aria-label={activeTool === "cursor" ? "Open annotation tools" : "Return to cursor mode"} title={activeTool === "cursor" ? "Annotate" : "Cursor mode"}><Icon name="pen" size={16} /></button>
        <button className="widget-control pause-widget" disabled={!status.ready} onClick={() => sendAction("pause")} aria-label={status.paused ? "Resume recording" : "Pause recording"}><Icon name={status.paused ? "play" : "pause"} size={16} /></button>
        <button className="widget-control stop-widget" disabled={!status.ready} onClick={() => sendAction("stop")} aria-label="Stop recording"><Icon name="stop" size={14} /></button>
        <span className="widget-brand"><span className="brand-mark"><Icon name="logo" size={17} /></span></span>
      </>}
    </div>
  </div>;
}

