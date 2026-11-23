import type { ReactNode } from "react";

const iconPaths: Record<string, ReactNode> = {
  folder: <><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 9h18" /></>,
  logo: <><path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M18.36 5.64 5.64 18.36" /><circle cx="12" cy="12" r="7.5" /></>,
  cursor: <><path d="m5 3 14 11-7 1-3 6z" /><path d="m12 15 4 6" /></>,
  circle: <circle cx="12" cy="12" r="8" />,
  square: <rect x="4" y="4" width="16" height="16" rx="1" />,
  pen: <><path d="m4 20 4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16z" /><path d="m14.8 6.2 3 3" /></>,
  eraser: <><path d="m7 21 12-12a2.8 2.8 0 0 0-4-4L3 17a2.8 2.8 0 0 0 4 4Z" /><path d="m8 12 6 6m-2 3h9" /></>,
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1z" /></>,
  video: <><rect x="3" y="5" width="13" height="14" rx="3" /><path d="m16 10 5-3v10l-5-3z" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
  grid: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>,
  micOff: <><path d="m3 3 18 18" /><path d="M9 9V5a3 3 0 0 1 5.8-1M15 9v3a3 3 0 0 1-5.3 1.9M5 10v2a7 7 0 0 0 11.9 5m2.1-7v2a7 7 0 0 1-.4 2.3M12 19v3m-4 0h8" /></>,
  camera: <><rect x="3" y="6" width="14" height="12" rx="3" /><path d="m17 10 4-2v8l-4-2z" /></>,
  cameraOff: <><path d="m3 3 18 18" /><path d="M10.6 6H17a2 2 0 0 1 2 2v8" /><path d="M17 10l4-2v8l-4-2" /><path d="M3 8a2 2 0 0 1 2-2h1m6 12H5a2 2 0 0 1-2-2z" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  sparkles: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /><path d="m5 2 .6 1.4L7 4l-1.4.6L5 6l-.6-1.4L3 4l1.4-.6z" /></>,
  expand: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /><path d="m3 3 6 6m12-6-6 6M3 21l6-6m12 6-6-6" /></>,
  shrink: <><path d="M8 3v5H3m13-5v5h5M3 16h5v5m8 0v-5h5" /><path d="m3 3 6 6m12-6-6 6M3 21l6-6m12 6-6-6" /></>,
  monitor: <><rect x="3" y="3" width="18" height="14" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
  play: <path d="m9 6 10 6-10 6z" fill="currentColor" stroke="none" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h12" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 17v4h14v-4" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m4 4v7m6-7v7" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4L5.3 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1L9 7.4h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2z" transform="translate(0 -1)" /></>,
};

export function Icon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}
