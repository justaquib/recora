import { useEffect, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "../components/Icon";
import { recordingEvents } from "../features/recording/recordingEvents";
import "./CountdownWidget.css";

export default function CountdownWidget() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("widget-document");
    document.body.classList.add("widget-body");
    const current = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void listen<{ remaining: number | null }>(recordingEvents.countdownState, async (event) => {
      setRemaining(event.payload.remaining);
      if (event.payload.remaining === null) await current.hide().catch(() => undefined);
    }).then((stop) => { unlisten = stop; }).catch((cause) => console.warn("Could not listen for countdown state", cause));
    return () => {
      unlisten?.();
      document.documentElement.classList.remove("widget-document");
      document.body.classList.remove("widget-body");
    };
  }, []);

  if (remaining === null) return null;
  return <div className="floating-root countdown-widget-root" onMouseDown={(event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    void getCurrentWindow().startDragging().catch(() => undefined);
  }}>
    <section className="countdown-widget-card">
      <div className="countdown-widget-heading"><span className="countdown-widget-pulse" /><span>GET READY</span></div>
      <strong key={remaining} className="countdown-widget-number">{remaining === 0 ? "GO" : remaining}</strong>
      <span className="countdown-widget-caption">Recording starts in a moment</span>
      <button className="countdown-widget-start" onClick={() => void emitTo("recording-setup", recordingEvents.countdownSkip, {})}>
        <Icon name="play" size={12} /> Start now
      </button>
    </section>
  </div>;
}
