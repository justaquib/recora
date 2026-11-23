import { useEffect, useRef, useState, type RefObject } from "react";
import { Icon } from "../components/Icon";
import { formatDate, formatFileSize, formatTime } from "../utils/format";
import type { VideoItem } from "../shared/types";
import { invoke } from "@tauri-apps/api/core";

type Props = {
  video: VideoItem;
  previewVideo: RefObject<HTMLVideoElement | null>;
  renaming: boolean;
  draftTitle: string;
  onDraftTitleChange: (title: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onUpdateTitle: () => void;
  onExport: (quality: string) => void;
  onAddThumbnail: (imageDataUrl: string) => void;
  onDelete: () => void;
  onBack: () => void;
};

export default function RecordingDetailPage({ video, previewVideo, renaming, draftTitle, onDraftTitleChange, onStartRename, onCancelRename, onUpdateTitle, onExport, onAddThumbnail, onDelete, onBack }: Props) {
  const [exportOpen, setExportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportSizes, setExportSizes] = useState<Record<string, number | null>>({});
  const [estimating, setEstimating] = useState(false);
  useEffect(() => {
    if (!exportOpen) return;
    const missing = ["high", "standard", "low"].filter((quality) => exportSizes[quality] === undefined);
    if (missing.length === 0 || estimating) return;
    setEstimating(true);
    void Promise.all(missing.map(async (quality) => {
      try {
        const size = await invoke<number>("estimate_export_size", { sourcePath: video.filePath || "", quality });
        setExportSizes((current) => ({ ...current, [quality]: size }));
      } catch {
        setExportSizes((current) => ({ ...current, [quality]: null }));
      }
    })).finally(() => setEstimating(false));
  }, [exportOpen, video.filePath, exportSizes, estimating]);

  return <section className="detail-page">
    <button className="back-link" onClick={onBack}><Icon name="back" size={16} /> Back to recordings</button>
    <div className="detail-heading"><div className="detail-title-wrap">{renaming ? <input className="title-input" autoFocus value={draftTitle} onChange={(event) => onDraftTitleChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onUpdateTitle(); if (event.key === "Escape") onCancelRename(); }} onBlur={onUpdateTitle} /> : <h1>{video.title}</h1>}<p>Recorded {formatDate(video.createdAt)} <span>·</span> {formatTime(video.duration)} {video.mimeType && <><span>·</span> {video.mimeType.includes("mp4") ? "MP4" : "WebM"}</>} <span>·</span> {video.filePath ? `Saved as ${video.filePath.split(/[\\/]/).pop()}` : "Stored in Recodex library"}</p></div><div className="detail-actions"><button className="button secondary" onClick={onStartRename}>Rename</button><div className="export-menu-wrap"><button className="button secondary" onClick={() => setExportOpen((value) => !value)}><Icon name="download" size={16} /> Export</button>{exportOpen && <div className="export-menu" role="menu"><button type="button" onClick={() => { setExportOpen(false); onExport("high"); }}><span>High quality</span><span className="export-size">{exportSizes.high === undefined ? (estimating ? "…" : "—") : exportSizes.high === null ? "—" : formatFileSize(exportSizes.high)}</span></button><button type="button" onClick={() => { setExportOpen(false); onExport("standard"); }}><span>Standard quality</span><span className="export-size">{exportSizes.standard === undefined ? (estimating ? "…" : "—") : exportSizes.standard === null ? "—" : formatFileSize(exportSizes.standard)}</span></button><button type="button" onClick={() => { setExportOpen(false); onExport("low"); }}><span>Low quality</span><span className="export-size">{exportSizes.low === undefined ? (estimating ? "…" : "—") : exportSizes.low === null ? "—" : formatFileSize(exportSizes.low)}</span></button></div>}</div><button className="button secondary" onClick={() => fileInputRef.current?.click()}><Icon name="video" size={16} /> Add thumbnail</button><input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === "string") onAddThumbnail(reader.result); }; reader.readAsDataURL(file); event.target.value = ""; }} /><button className="icon-button danger" onClick={onDelete} aria-label="Delete recording"><Icon name="trash" /></button></div></div>
    <div className="player-frame"><video ref={previewVideo} controls playsInline poster={video.thumbnail || undefined} /><div className="player-watermark"><span className="brand-mark"><Icon name="logo" size={15} /></span> recodex</div></div>
    {video.captureDuration !== undefined && video.captureDuration - video.duration > 3 && <div className="recording-integrity-warning" role="alert"><strong>Recording may be incomplete</strong><span>The recorder ran for {formatTime(video.captureDuration)}, but the playable media is only {formatTime(video.duration)}. The file was saved without changing its media duration.</span></div>}
    <div className="detail-meta"><div><span className="meta-label">MEDIA DURATION</span><strong>{formatTime(video.duration)}</strong></div><div><span className="meta-label">RECORDER TIMER</span><strong>{video.captureDuration === undefined ? "Unknown" : formatTime(video.captureDuration)}</strong></div><div><span className="meta-label">VIDEO SIZE</span><strong>{formatFileSize(video.sizeBytes)}</strong></div><div><span className="meta-label">FORMAT</span><strong>{(video.mimeType || "video/mp4").includes("mp4") ? "MP4 video" : "WebM video"}</strong></div><div><span className="meta-label">CAMERA</span><strong>{video.hasCamera ? "Included" : "Not included"}</strong></div><div><span className="meta-label">STORAGE</span><strong>This device only</strong></div></div>
  </section>;
}
