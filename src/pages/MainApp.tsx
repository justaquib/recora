import { useCallback, useEffect, useMemo, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "../App.css";
import { Icon } from "../components/Icon";
import Sidebar from "../components/Sidebar";
import LibraryPage from "./LibraryPage";
import RecordingDetailPage from "./RecordingDetailPage";
import RecordingPage from "./RecordingPage";
import SettingsPage from "./SettingsPage";
import { recordingEvents } from "../features/recording/recordingEvents";
import { copyRecordingFile, readRecordingBlob, readVideos, removeVideo, writeSetting, putVideo, readSetting } from "../services/recordingStorage";
import type { VideoItem } from "../shared/types";
import { useLibraryStore } from "../stores/useLibraryStore";

/** Library and preferences only. Capture runs in the dedicated recorder webview. */
function MainShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const store = useLibraryStore();
  const { videos, setVideos, query, setQuery, sortOrder, setSortOrder, view, setView, saveDirectory, setSaveDirectory, error, setError, notice, setNotice, renaming, setRenaming, draftTitle, setDraftTitle, confirmDelete, setConfirmDelete } = store;

  const searchInput = useRef<HTMLInputElement>(null);
  const previewVideo = useRef<HTMLVideoElement>(null);

  const refresh = useCallback(async () => {
    try { setVideos(await readVideos()); }
    catch { setError("The local library could not be opened. Restart the app and try again."); }
  }, [setVideos, setError]);

  useEffect(() => {
    void refresh();
    void writeSetting("isRecording", false).catch(() => undefined);
    void readSetting<string>("saveDirectory").then((value) => setSaveDirectory(value || "")).catch(() => undefined);
    let unlistenLibrary: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;
    const closeFloatingWindows = async () => {
      const inactive = { active: false, ready: false, recording: false, preparing: false, paused: false, elapsed: 0, camera: false, bubble: false, saving: false };
      await Promise.all(["camera-bubble", "recording-controls", "annotation-overlay"].map((label) => emitTo(label, "recodex:widget-status", inactive).catch(() => undefined)));
      await emitTo("recording-countdown", recordingEvents.countdownState, { remaining: null }).catch(() => undefined);
      await Promise.all(["camera-bubble", "recording-controls", "recording-countdown", "annotation-overlay"].map(async (label) => {
        const widget = await WebviewWindow.getByLabel(label).catch(() => null);
        await widget?.hide().catch(() => undefined);
      }));
    };
    void closeFloatingWindows();
    void getCurrentWindow().onFocusChanged(({ payload }) => { if (payload) void closeFloatingWindows(); })
      .then((stop) => { unlistenFocus = stop; }).catch((cause) => console.warn("Could not listen for dashboard focus", cause));
    void listen<{ id: string }>(recordingEvents.libraryChanged, () => { void refresh(); })
      .then((stop) => { unlistenLibrary = stop; }).catch((cause) => console.warn("Could not listen for library updates", cause));
    return () => { unlistenLibrary?.(); unlistenFocus?.(); };
  }, [refresh, setSaveDirectory]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3400);
    return () => window.clearTimeout(timer);
  }, [notice, setNotice]);

  const isDetail = location.pathname.startsWith("/recordings/");
  const detailId = isDetail ? location.pathname.split("/").pop() : null;
  const selected = videos.find((video) => video.id === detailId) || null;

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
  }, [selected, setError]);

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
      if (!recorder) throw new Error("The recorder window is unavailable. Restart Recodex and try again.");
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
    setNotice("Recordings will save to Documents/Recodex");
  };

  const updateTitle = async () => {
    if (!selected) return;
    const title = draftTitle.trim();
    if (!title) { setRenaming(false); return; }
    const updated = { ...selected, title };
    await putVideo(updated);
    setVideos(videos.map((item) => item.id === updated.id ? updated : item));
    setRenaming(false);
  };

  const deleteSelected = async () => {
    if (!selected) return;
    try {
      for (const path of selected.filePaths || (selected.filePath ? [selected.filePath] : [])) await invoke("delete_recording_file", { path });
      await removeVideo(selected.id);
      setVideos(videos.filter((item) => item.id !== selected.id));
      setConfirmDelete(false);
      setNotice("Recording deleted from this device");
      navigate("/");
    } catch { setError("Could not delete this recording. Please try again."); }
  };

  const exportSelected = async () => {
    if (!selected) return;
    try {
      const extension = (selected.mimeType || "video/mp4").includes("mp4") ? "mp4" : "webm";
      const filePath = await copyRecordingFile(selected.filePath || "", `${selected.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "recodex-recording"}.${extension}`, saveDirectory || null);
      const updated = { ...selected, filePath: selected.filePath || filePath, filePaths: [...new Set([...(selected.filePaths || (selected.filePath ? [selected.filePath] : [])), filePath])] };
      await putVideo(updated);
      setVideos(videos.map((item) => item.id === updated.id ? updated : item));
      setNotice("Export saved to your save location");
    } catch (cause) { setError(cause instanceof Error ? `Export could not be saved. ${cause.message}` : "Export could not be saved."); }
  };

  const isRecordingPage = location.pathname === "/recording";
  const headerTitle = isDetail ? "Recording" : isRecordingPage ? "Recording" : "My recordings";

  return (
    <div className="app-shell">
      <Sidebar videoCount={videos.length} saveDirectory={saveDirectory} onNewRecording={() => void openRecorder()} onChooseSaveDirectory={() => void chooseSaveDirectory()} onResetSaveDirectory={() => void resetSaveDirectory()} />
      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{headerTitle}</strong></div><div className="top-actions"><span className="local-pill"><span /> Saved locally</span><button className="icon-button" aria-label="Settings" title="Settings" onClick={() => document.querySelector(".save-location-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}><Icon name="settings" /></button><button className="avatar small" aria-label="Personal workspace">A</button></div></header>
        <Routes>
          <Route path="/" element={<LibraryPage videos={videos} filtered={filtered.slice(0, 3)} query={query} showToolbar={false} onQueryChange={setQuery} searchInput={searchInput} sortOrder={sortOrder} onSortChange={setSortOrder} view={view} onViewChange={setView} onNewRecording={() => void openRecorder()} onOpenVideo={(video) => navigate(`/recordings/${video.id}`)} />} />
          <Route path="/recording" element={<RecordingPage videos={videos} filtered={filtered} query={query} onQueryChange={setQuery} searchInput={searchInput} sortOrder={sortOrder} onSortChange={setSortOrder} view={view} onViewChange={setView} onOpenVideo={(video) => navigate(`/recordings/${video.id}`)} />} />
          <Route path="/recordings/:id" element={<RecordingDetailRoute videos={videos} previewVideo={previewVideo} renaming={renaming} draftTitle={draftTitle} onDraftTitleChange={setDraftTitle} onStartRename={() => { if (selected) { setDraftTitle(selected.title); setRenaming(true); } }} onCancelRename={() => setRenaming(false)} onUpdateTitle={() => void updateTitle()} onExport={() => void exportSelected()} onDelete={() => setConfirmDelete(true)} onBack={() => navigate("/")} />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {confirmDelete && selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDelete(false); }}><div className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-heading"><div className="delete-icon"><Icon name="trash" size={19} /></div><h2 id="delete-heading">Delete this recording?</h2><p><strong>{selected.title}</strong> and its saved video file will be deleted from this device. This cannot be undone.</p><div className="confirm-actions"><button className="button secondary" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="button delete-confirm" onClick={() => void deleteSelected()}>Delete recording</button></div></div></div>}
      {error && <div className="toast error-toast"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><Icon name="close" size={16} /></button></div>}
      {notice && <div className="toast"><span className="toast-check"><Icon name="check" size={13} /></span>{notice}</div>}
    </div>
  );
}

function RecordingDetailRoute({ videos, previewVideo, renaming, draftTitle, onDraftTitleChange, onStartRename, onCancelRename, onUpdateTitle, onExport, onDelete, onBack }: any) {
  const { id } = useParams();
  const video = videos.find((item: VideoItem) => item.id === id);
  if (!video) return <Navigate to="/" replace />;
  return <RecordingDetailPage video={video} previewVideo={previewVideo} renaming={renaming} draftTitle={draftTitle} onDraftTitleChange={onDraftTitleChange} onStartRename={onStartRename} onCancelRename={onCancelRename} onUpdateTitle={onUpdateTitle} onExport={onExport} onDelete={onDelete} onBack={onBack} />;
}

export default function MainApp() {
  return (
    <BrowserRouter>
      <MainShell />
    </BrowserRouter>
  );
}
