import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import "../App.css";
import { Icon } from "../components/Icon";
import LibraryPage from "./LibraryPage";
import RecordingDetailPage from "./RecordingDetailPage";
import { recordingEvents } from "../features/recording/recordingEvents";
import { copyRecordingFile, readRecordingBlob, readVideos, removeVideo, writeSetting, putVideo, readSetting } from "../services/recordingStorage";
import type { VideoItem } from "../shared/types";

/** Library and preferences only. Capture runs in the dedicated recorder webview. */
export default function MainApp() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selected, setSelected] = useState<VideoItem | null>(null);
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [saveDirectory, setSaveDirectory] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const previewVideo = useRef<HTMLVideoElement>(null);

  const refresh = useCallback(async () => {
    try { setVideos(await readVideos()); }
    catch { setError("The local library could not be opened. Restart the app and try again."); }
  }, []);

  useEffect(() => {
    void refresh();
    // A process restart means no in-memory capture session survived.
    void writeSetting("isRecording", false).catch(() => undefined);
    void readSetting<string>("saveDirectory").then((value) => setSaveDirectory(value || "")).catch(() => undefined);
    let unlistenLibrary: (() => void) | undefined;
    void listen<{ id: string }>(recordingEvents.libraryChanged, () => { void refresh(); })
      .then((stop) => { unlistenLibrary = stop; }).catch((cause) => console.warn("Could not listen for library updates", cause));
    return () => { unlistenLibrary?.(); };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!selected?.filePath || !previewVideo.current) return;
    let cancelled = false;
    let url: string | null = null;
    void readRecordingBlob(selected.filePath, selected.mimeType || "video/mp4").then((blob) => {
      if (cancelled || !previewVideo.current) return;
      url = URL.createObjectURL(blob);
      previewVideo.current.src = url;
    }).catch((cause) => setError(cause instanceof Error ? `Could not open this recording. ${cause.message}` : "Could not open this recording."));
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [selected]);

  const filtered = useMemo(() => videos
    .filter((video) => video.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sortOrder === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt), [videos, query, sortOrder]);

  const openRecorder = async () => {
    try {
      if (await readSetting<boolean>("isRecording")) {
        setNotice("A recording is already in progress. Stop it from the floating controls first.");
        return;
      }
      const recorder = await WebviewWindow.getByLabel("recording-setup");
      if (!recorder) throw new Error("The recorder window is unavailable. Restart Recora and try again.");
      await recorder.emit(recordingEvents.setupConfig, { saveDirectory });
      await recorder.show();
      await recorder.setFocus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the recorder window.");
    }
  };

  const chooseSaveDirectory = async () => {
    try {
      const directory = await invoke<string | null>("choose_recording_directory");
      if (!directory) return;
      await writeSetting("saveDirectory", directory);
      setSaveDirectory(directory);
      setNotice("Save location updated");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not choose a save folder."); }
  };

  const resetSaveDirectory = async () => {
    await writeSetting("saveDirectory", "");
    setSaveDirectory("");
    setNotice("Recordings will save to Documents/Recora");
  };

  const updateTitle = async () => {
    if (!selected) return;
    const title = draftTitle.trim();
    if (!title) { setRenaming(false); return; }
    const updated = { ...selected, title };
    await putVideo(updated);
    setSelected(updated);
    setVideos((items) => items.map((item) => item.id === updated.id ? updated : item));
    setRenaming(false);
  };

  const deleteSelected = async () => {
    if (!selected) return;
    try {
      for (const path of selected.filePaths || (selected.filePath ? [selected.filePath] : [])) await invoke("delete_recording_file", { path });
      await removeVideo(selected.id);
      setVideos((items) => items.filter((item) => item.id !== selected.id));
      setSelected(null); setConfirmDelete(false); setNotice("Recording deleted from this device");
    } catch { setError("Could not delete this recording. Please try again."); }
  };

  const exportSelected = async () => {
    if (!selected) return;
    try {
      const extension = (selected.mimeType || "video/mp4").includes("mp4") ? "mp4" : "webm";
      const filePath = await copyRecordingFile(selected.filePath || "", `${selected.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "recora-recording"}.${extension}`, saveDirectory || null);
      const updated = { ...selected, filePath: selected.filePath || filePath, filePaths: [...new Set([...(selected.filePaths || (selected.filePath ? [selected.filePath] : [])), filePath])] };
      await putVideo(updated); setSelected(updated); setVideos((items) => items.map((item) => item.id === updated.id ? updated : item)); setNotice("Export saved to your save location");
    } catch (cause) { setError(cause instanceof Error ? `Export could not be saved. ${cause.message}` : "Export could not be saved."); }
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setSelected(null)} aria-label="Recora home"><span className="brand-mark"><Icon name="logo" size={22} /></span><span>recora</span></button>
      <button className="new-recording" onClick={() => void openRecorder()}><Icon name="plus" size={17} /> New recording <span className="shortcut">⌘ N</span></button>
      <div className="nav-label">WORKSPACE</div>
      <button className={`nav-item ${!selected ? "active" : ""}`} onClick={() => setSelected(null)}><Icon name="home" /> <span>My recordings</span><span className="nav-count">{videos.length}</span></button>
      <div className="sidebar-bottom">
        <section className="storage-card save-location-card"><div className="storage-top"><Icon name="folder" size={14} /><span>Save location</span></div><div className="save-location-path" title={saveDirectory || "~/Documents/Recora"}>{saveDirectory ? saveDirectory.split(/[\\/]/).filter(Boolean).slice(-2).join("/") : "Documents/Recora"}</div><div className="save-location-actions"><button onClick={() => void chooseSaveDirectory()}>Change</button>{saveDirectory && <button onClick={() => void resetSaveDirectory()}>Default</button>}</div></section>
        <div className="storage-card"><div className="storage-top"><span className="storage-dot" /><span>Stored on this device</span></div><div className="storage-note">Your recordings stay private and local.</div></div>
        <button className="profile"><span className="avatar">A</span><span className="profile-copy"><strong>Personal workspace</strong><small>Local library</small></span><Icon name="more" size={17} /></button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{selected ? "Recording" : "My recordings"}</strong></div><div className="top-actions"><span className="local-pill"><span /> Saved locally</span><button className="icon-button" aria-label="Settings" title="Settings" onClick={() => document.querySelector(".save-location-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}><Icon name="settings" /></button><button className="avatar small" aria-label="Personal workspace">A</button></div></header>
      {selected ? <RecordingDetailPage video={selected} previewVideo={previewVideo} renaming={renaming} draftTitle={draftTitle} onDraftTitleChange={setDraftTitle} onStartRename={() => { setDraftTitle(selected.title); setRenaming(true); }} onCancelRename={() => setRenaming(false)} onUpdateTitle={() => void updateTitle()} onExport={() => void exportSelected()} onDelete={() => setConfirmDelete(true)} onBack={() => setSelected(null)} /> : <LibraryPage videos={videos} filtered={filtered} query={query} onQueryChange={setQuery} searchInput={searchInput} sortOrder={sortOrder} onSortChange={setSortOrder} view={view} onViewChange={setView} onNewRecording={() => void openRecorder()} onOpenVideo={setSelected} />}
    </main>
    {confirmDelete && selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDelete(false); }}><div className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-heading"><div className="delete-icon"><Icon name="trash" size={19} /></div><h2 id="delete-heading">Delete this recording?</h2><p><strong>{selected.title}</strong> and its saved video file will be deleted from this device. This cannot be undone.</p><div className="confirm-actions"><button className="button secondary" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="button delete-confirm" onClick={() => void deleteSelected()}>Delete recording</button></div></div></div>}
    {error && <div className="toast error-toast"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><Icon name="close" size={16} /></button></div>}
    {notice && <div className="toast"><span className="toast-check"><Icon name="check" size={13} /></span>{notice}</div>}
  </div>;
}
