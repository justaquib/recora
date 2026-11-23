import type { RefObject } from "react";
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
  onExport: () => void;
  onDelete: () => void;
  onBack: () => void;
};

export default function RecordingDetailPage({ video, previewVideo, renaming, draftTitle, onDraftTitleChange, onStartRename, onCancelRename, onUpdateTitle, onExport, onDelete, onBack }: Props) {
  return <section className="detail-page">
    <button className="back-link" onClick={onBack}><Icon name="back" size={16} /> Back to recordings</button>
    <div className="detail-heading"><div className="detail-title-wrap">{renaming ? <input className="title-input" autoFocus value={draftTitle} onChange={(event) => onDraftTitleChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onUpdateTitle(); if (event.key === "Escape") onCancelRename(); }} onBlur={onUpdateTitle} /> : <h1>{video.title}</h1>}<p>Recorded {formatDate(video.createdAt)} <span>·</span> {formatTime(video.duration)} {video.mimeType && <><span>·</span> {video.mimeType.includes("mp4") ? "MP4" : "WebM"}</>} <span>·</span> {video.filePath ? `Saved as ${video.filePath.split(/[\\/]/).pop()}` : "Stored in Recodex library"}</p></div><div className="detail-actions"><button className="button secondary" onClick={onStartRename}>Rename</button><button className="button secondary" onClick={onExport}><Icon name="download" size={16} /> Export</button><button className="icon-button danger" onClick={onDelete} aria-label="Delete recording"><Icon name="trash" /></button></div></div>
    <div className="player-frame"><video ref={previewVideo} controls playsInline /><div className="player-watermark"><span className="brand-mark"><Icon name="logo" size={15} /></span> recodex</div></div>
    {video.captureDuration !== undefined && video.captureDuration - video.duration > 3 && <div className="recording-integrity-warning" role="alert"><strong>Recording may be incomplete</strong><span>The recorder ran for {formatTime(video.captureDuration)}, but the playable media is only {formatTime(video.duration)}. The file was saved without changing its media duration.</span></div>}
    <div className="detail-meta"><div><span className="meta-label">MEDIA DURATION</span><strong>{formatTime(video.duration)}</strong></div><div><span className="meta-label">RECORDER TIMER</span><strong>{video.captureDuration === undefined ? "Unknown" : formatTime(video.captureDuration)}</strong></div><div><span className="meta-label">VIDEO SIZE</span><strong>{formatFileSize(video.sizeBytes)}</strong></div><div><span className="meta-label">FORMAT</span><strong>{(video.mimeType || "video/mp4").includes("mp4") ? "MP4 video" : "WebM video"}</strong></div><div><span className="meta-label">CAMERA</span><strong>{video.hasCamera ? "Included" : "Not included"}</strong></div><div><span className="meta-label">STORAGE</span><strong>This device only</strong></div></div>
  </section>;
}
