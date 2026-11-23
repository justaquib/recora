import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { LogicalPosition, LogicalSize, getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import "../App.css";
import { Icon } from "../components/Icon";
import type { AnnotationTool, WidgetStatus } from "../shared/types";

export default function AnnotationWidget() {
  const [tool, setTool] = useState<AnnotationTool>("off");
  const [active, setActive] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [thickness, setThickness] = useState(5);
  const backgroundRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokeStart = useRef<{ x: number; y: number } | null>(null);
  const windowRef = useRef(getCurrentWindow());

  useEffect(() => {
    document.documentElement.classList.add("widget-document");
    document.body.classList.add("widget-body");
    let unlistenTool: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    const positionOverlay = async () => {
      const monitor = await primaryMonitor();
      if (!monitor) return;
      const scale = monitor.scaleFactor || 1;
      await windowRef.current.setPosition(new LogicalPosition(monitor.position.x / scale, monitor.position.y / scale));
      await windowRef.current.setSize(new LogicalSize(monitor.size.width / scale, monitor.size.height / scale));
    };
    const applyTool = async (next: AnnotationTool, nextSnapshot?: string) => {
      setTool(next);
      void emitTo("recording-controls", "recora:annotation-state", { tool: next === "off" ? "cursor" : next }).catch(() => undefined);
      if (nextSnapshot) setSnapshot(nextSnapshot);
      if (next === "cursor" || next === "off") {
        await windowRef.current.hide().catch(() => undefined);
        setActive(false);
        drawing.current = false;
        setSnapshot(null);
      } else {
        await positionOverlay();
        await windowRef.current.show().catch((cause) => console.warn("Could not show annotation surface", cause));
        await windowRef.current.setFocus().catch(() => undefined);
        setActive(true);
      }
    };
    void listen<{ tool: AnnotationTool; snapshot?: string; snapshotKey?: string }>("recora:annotation-tool", (event) => {
      let frame = event.payload.snapshot;
      if (!frame && event.payload.snapshotKey) {
        try { frame = localStorage.getItem(event.payload.snapshotKey) || undefined; } catch { /* continue with a transparent drawing surface */ }
      }
      void applyTool(event.payload.tool, frame);
    })
      .then((stop) => { unlistenTool = stop; }).catch((cause) => console.warn("Could not listen for annotation tools", cause));
    void listen<WidgetStatus>("recora:widget-status", (event) => {
      if (!event.payload.active || event.payload.saving) void applyTool("off");
    }).then((stop) => { unlistenStatus = stop; }).catch((cause) => console.warn("Could not listen for recording status", cause));
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") void applyTool("off"); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      unlistenTool?.(); unlistenStatus?.(); window.removeEventListener("keydown", onKeyDown);
      document.documentElement.classList.remove("widget-document"); document.body.classList.remove("widget-body");
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const background = backgroundRef.current;
    if (!canvas || !background) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      for (const layer of [background, canvas]) {
        layer.width = Math.round(rect.width * ratio); layer.height = Math.round(rect.height * ratio);
        layer.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
    };
    resize(); window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [active]);
  useEffect(() => {
    const background = backgroundRef.current;
    const canvas = canvasRef.current;
    if (!active || !background || !canvas || !snapshot) return;
    const rect = canvas.getBoundingClientRect();
    const context = background.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, rect.width, rect.height);
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
    image.src = snapshot;
  }, [active, snapshot]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "off" || tool === "cursor") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext("2d"); if (!context) return;
    const p = point(event); drawing.current = true; strokeStart.current = p;
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = "#4C8DF1"; context.lineWidth = tool === "eraser" ? thickness * 4 : thickness;
    context.lineCap = "round"; context.lineJoin = "round";
    if (tool === "pen" || tool === "eraser") {
      context.beginPath(); context.moveTo(p.x, p.y);
      context.lineTo(p.x + 0.1, p.y + 0.1); context.stroke();
    }
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || (tool !== "pen" && tool !== "eraser")) return;
    const context = event.currentTarget.getContext("2d"); if (!context) return;
    const p = point(event); context.lineTo(p.x, p.y); context.stroke();
  };
  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>, commit: boolean) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    const start = strokeStart.current;
    const end = point(event);
    if (commit && context && start && (tool === "circle" || tool === "square" || tool === "arrow")) {
      context.globalCompositeOperation = "source-over";
      context.strokeStyle = "#4C8DF1"; context.lineWidth = thickness;
      context.lineCap = "round"; context.lineJoin = "round";
      context.beginPath();
      if (tool === "circle") {
        const rx = Math.abs(end.x - start.x) / 2; const ry = Math.abs(end.y - start.y) / 2;
        context.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      } else if (tool === "square") context.rect(start.x, start.y, end.x - start.x, end.y - start.y);
      else {
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const head = Math.max(10, thickness * 3.5);
        context.moveTo(start.x, start.y); context.lineTo(end.x, end.y);
        context.moveTo(end.x, end.y); context.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
        context.moveTo(end.x, end.y); context.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
      }
      context.stroke();
    }
    drawing.current = false; strokeStart.current = null;
    if (context) context.globalCompositeOperation = "source-over";
  };

  const chooseTool = (next: AnnotationTool) => {
    if (next === "cursor") {
      setTool("cursor"); void emitTo("recording-setup", "recora:annotation-request", { tool: "cursor" }).catch(() => undefined);
    } else {
      setTool(next); void emitTo("recording-controls", "recora:annotation-state", { tool: next }).catch(() => undefined);
    }
  };
  return <div className={`annotation-root ${active ? "is-active" : ""}`}>
    <canvas ref={backgroundRef} className="annotation-background" />
    <canvas ref={canvasRef} className="annotation-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={(event) => finishStroke(event, true)} onPointerCancel={(event) => finishStroke(event, false)} />
    {active && <div className="annotation-toolbar" role="toolbar" aria-label="Screen annotation tools">
      <span className="annotation-label">ANNOTATE</span>
      <button className={tool === "cursor" ? "selected" : ""} onClick={() => chooseTool("cursor")} aria-label="Cursor"><Icon name="cursor" size={16} /> Cursor</button>
      <button className={tool === "pen" ? "selected" : ""} onClick={() => chooseTool("pen")} aria-label="Pen"><Icon name="pen" size={16} /> Pen</button>
      <button className={tool === "eraser" ? "selected" : ""} onClick={() => chooseTool("eraser")} aria-label="Eraser"><Icon name="eraser" size={16} /> Erase</button>
      <button className={tool === "circle" ? "selected" : ""} onClick={() => chooseTool("circle")} aria-label="Circle"><Icon name="circle" size={16} /> Circle</button>
      <button className={tool === "square" ? "selected" : ""} onClick={() => chooseTool("square")} aria-label="Square"><Icon name="square" size={16} /> Square</button>
      <button className={tool === "arrow" ? "selected" : ""} onClick={() => chooseTool("arrow")} aria-label="Arrow"><Icon name="arrow" size={16} /> Arrow</button>
      <label className="annotation-thickness-label">Stroke
        <select className="annotation-thickness" aria-label="Stroke thickness" value={thickness} onChange={(event) => setThickness(Number(event.target.value))}>
          <option value={2}>Thin</option><option value={5}>Regular</option><option value={9}>Thick</option><option value={14}>Extra</option>
        </select>
      </label>
      <button className="annotation-done" onClick={() => chooseTool("cursor")} aria-label="Close annotation tools"><Icon name="close" size={16} /></button>
    </div>}
  </div>;
}

