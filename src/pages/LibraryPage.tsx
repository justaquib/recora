import type { RefObject } from "react";
import { Icon } from "../components/Icon";
import { formatDate, formatFileSize, formatTime } from "../utils/format";
import type { VideoItem } from "../shared/types";

type Props = {
  videos: VideoItem[];
  filtered: VideoItem[];
  query: string;
  onQueryChange: (query: string) => void;
  searchInput: RefObject<HTMLInputElement | null>;
  sortOrder: string;
  onSortChange: (order: string) => void;
  view: "grid" | "list";
  onViewChange: (view: "grid" | "list") => void;
  onNewRecording: () => void;
  onOpenVideo: (video: VideoItem) => void;
};

export default function LibraryPage({ videos, filtered, query, onQueryChange, searchInput, sortOrder, onSortChange, view, onViewChange, onNewRecording, onOpenVideo }: Props) {
  return <section className="library-page">
    <div className="page-heading"><div><div className="eyebrow">YOUR PERSONAL LIBRARY</div><h1>My recordings</h1><p>A quiet place for everything worth sharing.</p></div><button className="button primary" onClick={onNewRecording}><Icon name="plus" size={17} /> New recording</button></div>
    <div className="welcome-card"><div className="welcome-copy"><div className="welcome-kicker"><span className="live-dot" /> READY WHEN YOU ARE</div><h2>Make your next idea<br />easy to follow.</h2><p>Capture your screen and voice in a few clicks.<br />Your recordings are saved privately on this device.</p><button className="button dark" onClick={onNewRecording}><Icon name="video" size={17} /> Start a recording <span className="button-arrow">↗</span></button></div><div className="welcome-art" aria-hidden="true"><div className="art-window"><div className="art-window-top"><i /><i /><i /><span>recora.app</span></div><div className="art-content"><div className="art-sidebar"><div className="art-circle" /><div /><div /><div /></div><div className="art-main"><div className="art-heading-line" /><div className="art-chart"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="art-footer"><span /><span /><span /></div></div></div><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-camera"><div className="camera-head" /><div className="camera-shoulders" /></div><div className="art-recording"><span /> 00:18</div></div></div></div>
    <div className="section-heading"><div><h2>All recordings <span className="result-count">{videos.length}</span></h2><p>Your videos, organized automatically.</p></div></div>
    {videos.length > 0 && <div className="library-toolbar"><label className="search-field"><Icon name="search" size={17} /><input ref={searchInput} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search recordings" /><kbd>⌘ K</kbd></label><div className="toolbar-right"><select value={sortOrder} onChange={(event) => onSortChange(event.target.value)} aria-label="Sort recordings"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><div className="view-toggle"><button className={view === "grid" ? "selected" : ""} onClick={() => onViewChange("grid")} aria-label="Grid view"><Icon name="grid" size={16} /></button><button className={view === "list" ? "selected" : ""} onClick={() => onViewChange("list")} aria-label="List view"><Icon name="list" size={16} /></button></div></div></div>}
    {filtered.length > 0 ? <div className={`video-grid ${view === "list" ? "list-view" : ""}`}>{filtered.map((video) => <button className="video-card" key={video.id} onClick={() => onOpenVideo(video)}><div className="thumbnail">{video.thumbnail ? <img src={video.thumbnail} alt="Recording thumbnail" /> : <div className="thumbnail-fallback"><Icon name="video" size={25} /></div>}<span className="duration">{formatTime(video.duration)}</span><span className="thumb-play"><Icon name="play" size={19} /></span></div><div className="video-card-info"><div className="video-icon"><Icon name="video" size={17} /></div><div className="video-card-copy"><strong>{video.title}</strong><span>{formatDate(video.createdAt)} <i>·</i> {video.hasCamera ? "Screen & camera" : "Screen recording"} <i>·</i> {formatFileSize(video.sizeBytes)}</span></div><Icon name="more" className="card-more" /></div></button>)}</div> : videos.length > 0 ? <div className="no-results"><Icon name="search" size={22} /><strong>No recordings found</strong><span>Try a different title or clear your search.</span><button className="text-button" onClick={() => onQueryChange("")}>Clear search</button></div> : <div className="empty-library"><div className="empty-icon"><Icon name="video" size={23} /></div><strong>Your library is ready</strong><span>When you finish a recording, it will appear here.</span></div>}
    <footer className="page-footer"><span>Made for clear communication.</span><span><span className="footer-lock">▣</span> Private by default</span></footer>
  </section>;
}
