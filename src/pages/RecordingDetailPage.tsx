import { useRef, useState, type RefObject } from "react";
import { Icon } from "../components/Icon";
import { formatDate, formatFileSize, formatTime } from "../utils/format";
import type { VideoItem } from "../shared/types";

type Props = {
  video: VideoItem;
  previewVideo: RefObject<HTMLVideoElement | null>;
  renaming: boolean;
  draftTitle: string;
  onDraftTitleChange: (title: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onUpdateTitle: () => void;
  onAddThumbnail: (imageDataUrl: string) => void;
  onDenoise: (level: string) => void;
  onConvert: (quality: string) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onBack: () => void;
};

export default function RecordingDetailPage({ video, previewVideo, renaming, draftTitle, onDraftTitleChange, onStartRename, onCancelRename, onUpdateTitle, onAddThumbnail, onDenoise, onConvert, onRename, onDelete, onBack }: Props) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [denoiseLevel, setDenoiseLevel] = useState(1);
  const [convertQuality, setConvertQuality] = useState(1);
  const [converting, setConverting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitleLocal, setDraftTitleLocal] = useState("");
  const [applyingDenoise, setApplyingDenoise] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  return <section className="detail-page">
    <button className="back-link" onClick={onBack}><Icon name="back" size={16} /> Back to recordings</button>
    <div className="detail-heading"><div className="detail-title-wrap">{renaming ? <input className="title-input" autoFocus value={draftTitle} onChange={(event) => onDraftTitleChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onUpdateTitle(); if (event.key === "Escape") onCancelRename(); }} onBlur={onUpdateTitle} /> : <div className="detail-title-with-badge"><h1 onClick={onStartRename} style={{ cursor: "pointer" }} title="Click to rename">{video.title}</h1>{video.denoised && <span className="denoised-badge">Denoised</span>}
{video.converted && <span className="converted-badge">Converted{video.convertedQuality ? ` · ${video.convertedQuality}` : ""}</span>}</div>}<p>Recorded {formatDate(video.createdAt)} <span>·</span> {formatTime(video.duration)} {video.mimeType && <><span>·</span> {video.mimeType.includes("mp4") ? "MP4" : "WebM"}</>} <span>·</span> {video.filePath ? `Saved as ${video.filePath.split(/[\\/]/).pop()}` : "Stored in Recodex library"}</p></div><div className="detail-actions"><button className="button secondary" onClick={() => setOptionsOpen(true)}><Icon name="settings" size={16} /> Options</button><button className="icon-button danger" onClick={onDelete} aria-label="Delete recording"><Icon name="trash" /></button></div></div>
    <div className="player-frame"><video ref={previewVideo} controls playsInline poster={video.thumbnail || undefined} /><div className="player-watermark"><span className="brand-mark"><Icon name="logo" size={15} /></span> Recodex</div></div>
    {video.captureDuration !== undefined && video.captureDuration - video.duration > 3 && <div className="recording-integrity-warning" role="alert"><strong>Recording may be incomplete</strong><span>The recorder ran for {formatTime(video.captureDuration)}, but the playable media is only {formatTime(video.duration)}. The file was saved without changing its media duration.</span></div>}
    <div className="detail-meta"><div><span className="meta-label">MEDIA DURATION</span><strong>{formatTime(video.duration)}</strong></div><div><span className="meta-label">RECORDER TIMER</span><strong>{video.captureDuration === undefined ? "Unknown" : formatTime(video.captureDuration)}</strong></div><div><span className="meta-label">VIDEO SIZE</span><strong>{formatFileSize(video.sizeBytes)}</strong></div><div><span className="meta-label">FORMAT</span><strong>{(video.mimeType || "video/mp4").includes("mp4") ? "MP4 video" : "WebM video"}</strong></div><div><span className="meta-label">CAMERA</span><strong>{video.hasCamera ? "Included" : "Not included"}</strong></div><div><span className="meta-label">STORAGE</span><strong>This device only</strong></div></div>

    {optionsOpen && <div className="detail-options-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOptionsOpen(false); }}>
      <aside className="detail-options-drawer" aria-label="Recording options">
        <header className="detail-options-header"><strong>Recording options</strong><button className="icon-button" onClick={() => setOptionsOpen(false)} aria-label="Close options"><Icon name="close" size={16} /></button></header>
        <section className="detail-options-section">
          <h3>Title</h3>
          <div className="detail-options-title-row">
            {editingTitle ? <input className="title-input" autoFocus value={draftTitleLocal} onChange={(event) => setDraftTitleLocal(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { onRename(draftTitleLocal); setEditingTitle(false); } if (event.key === "Escape") setEditingTitle(false); }} onBlur={() => { onRename(draftTitleLocal); setEditingTitle(false); }} /> : <><span className="detail-options-title">{video.title}</span><button className="icon-button" onClick={() => { setDraftTitleLocal(video.title); setEditingTitle(true); }} aria-label="Rename" title="Rename"><Icon name="pen" size={14} /></button></>}
          </div>
        </section>
        <section className="detail-options-section">
          <h3>Thumbnail</h3>
          {video.thumbnail ? <img className="detail-thumbnail-preview" src={video.thumbnail} alt="Recording thumbnail" /> : <div className="detail-thumbnail-empty">No thumbnail</div>}
          <button className="button secondary" onClick={() => fileInputRef.current?.click()}><Icon name="video" size={16} /> Choose thumbnail</button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { if (typeof reader.result === "string") onAddThumbnail(reader.result); }; reader.readAsDataURL(file); event.target.value = ""; }} />
        </section>
        <section className="detail-options-section">
          <h3>Convert to MP4</h3>
          <label className="detail-slider-label"><span>Quality</span><span>{["Low", "Medium", "High"][convertQuality]}</span></label>
          <input type="range" min={0} max={2} step={1} value={convertQuality} onChange={(event) => setConvertQuality(Number(event.target.value))} aria-label="Convert quality" />
          <button className="button secondary" disabled={converting} onClick={async () => { setConverting(true); try { await onConvert(["low", "medium", "high"][convertQuality]); } finally { setConverting(false); } }}><Icon name="download" size={16} /> {converting ? "Converting..." : "Convert"}</button>
        </section>
        <section className="detail-options-section">
          <h3>Noise cancellation</h3>
          <label className="detail-slider-label"><span>Level</span><span>{["Low", "Medium", "High"][denoiseLevel]}</span></label>
          <input type="range" min={0} max={2} step={1} value={denoiseLevel} onChange={(event) => setDenoiseLevel(Number(event.target.value))} aria-label="Noise cancellation level" />
          <button className="button secondary" disabled={applyingDenoise} onClick={async () => { setApplyingDenoise(true); try { await onDenoise(["low", "medium", "high"][denoiseLevel]); } finally { setApplyingDenoise(false); } }}><Icon name="mic" size={16} /> {applyingDenoise ? "Processing..." : "Apply to video"}</button>
        </section>
      </aside>
    </div>}

  </section>;
}
