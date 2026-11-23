import type { RefObject } from "react";
import { Icon } from "../components/Icon";
import PageFooter from "../components/PageFooter";
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
  onOpenVideo: (video: VideoItem) => void;
};

export default function RecordingPage({ videos, filtered, query, onQueryChange, searchInput, sortOrder, onSortChange, view, onViewChange, onOpenVideo }: Props) {
  return <section className="library-page">
    <div className="section-heading"><div><h2>All recordings <span className="result-count">{videos.length}</span></h2><p>Your videos, organized automatically.</p></div></div>
    {videos.length > 0 && <div className="library-toolbar"><label className="search-field"><Icon name="search" size={17} /><input ref={searchInput} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search recordings" /><kbd>⌘ K</kbd></label><div className="toolbar-right"><select value={sortOrder} onChange={(event) => onSortChange(event.target.value)} aria-label="Sort recordings"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><div className="view-toggle"><button className={view === "grid" ? "selected" : ""} onClick={() => onViewChange("grid")} aria-label="Grid view"><Icon name="grid" size={16} /></button><button className={view === "list" ? "selected" : ""} onClick={() => onViewChange("list")} aria-label="List view"><Icon name="list" size={16} /></button></div></div></div>}
    {filtered.length > 0 ? <div className={`video-grid ${view === "list" ? "list-view" : ""}`}>{filtered.map((video) => <button className="video-card" key={video.id} onClick={() => onOpenVideo(video)}><div className="thumbnail">{video.thumbnail ? <img src={video.thumbnail} alt="Recording thumbnail" /> : <div className="thumbnail-fallback"><Icon name="video" size={25} /></div>}<span className="duration">{formatTime(video.duration)}</span><span className="thumb-play"><Icon name="play" size={19} /></span></div><div className="video-card-info"><div className="video-icon"><Icon name="video" size={17} /></div><div className="video-card-copy"><strong>{video.title}</strong><span>{formatDate(video.createdAt)} <i>·</i> {video.hasCamera ? "Screen & camera" : "Screen recording"} <i>·</i> {formatFileSize(video.sizeBytes)}</span></div><Icon name="more" className="card-more" /></div></button>)}</div> : videos.length > 0 ? <div className="no-results"><Icon name="search" size={22} /><strong>No recordings found</strong><span>Try a different title or clear your search.</span><button className="text-button" onClick={() => onQueryChange("")}>Clear search</button></div> : <div className="empty-library"><div className="empty-icon"><Icon name="video" size={23} /></div><strong>Your library is ready</strong><span>When you finish a recording, it will appear here.</span></div>}
    <PageFooter />
  </section>;
}
