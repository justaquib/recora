import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "../App.css";
import { Icon } from "../components/Icon";
import { generateVideoThumbnail, dataUrlToBytes } from "../utils/thumbnail";
import Sidebar from "../components/Sidebar";
import LibraryPage from "./LibraryPage";
import RecordingDetailPage from "./RecordingDetailPage";
import RecordingPage from "./RecordingPage";
import SettingsPage from "./SettingsPage";
import AccountPage from "./AccountPage";
import PreferencesPage from "./PreferencesPage";
import HelpPage from "./HelpPage";
import { recordingEvents } from "../features/recording/recordingEvents";
import { readRecordingBlob, readVideos, removeVideo, writeSetting, putVideo, readSetting } from "../services/recordingStorage";
import type { RecordingPreferences, VideoItem } from "../shared/types";
import { useLibraryStore } from "../stores/useLibraryStore";

/** Library and preferences only. Capture runs in the dedicated recorder webview. */
function MainShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const store = useLibraryStore();
  const [recordingPreferences, setRecordingPreferences] = useState<RecordingPreferences>({ captureMode: "screen", cameraEnabled: true, micEnabled: true, countdownDuration: 5 });
  const { videos, setVideos, query, setQuery, sortOrder, setSortOrder, view, setView, saveDirectory, setSaveDirectory, error, setError, notice, setNotice, renaming, setRenaming, draftTitle, setDraftTitle, confirmDelete, setConfirmDelete } = store;
  const [denoisePreview, setDenoisePreview] = useState<string | null>(null);
  const [denoisePreviewUrl, setDenoisePreviewUrl] = useState<string | null>(null);

  const searchInput = useRef<HTMLInputElement>(null);
  const previewVideo = useRef<HTMLVideoElement>(null);

  const refresh = useCallback(async () => {
    try {
      const loaded = await readVideos();
      setVideos(loaded);
      const backfillAll = !localStorage.getItem("thumbnail-backfill-v2");
      if (backfillAll) localStorage.setItem("thumbnail-backfill-v2", "1");
      void Promise.all(loaded.filter((video) => video.filePath && (backfillAll || !video.thumbnail)).map(async (video) => {
        const thumbnail = await generateVideoThumbnail(video.filePath as string, video.mimeType || "video/mp4");
        if (!thumbnail) return;
        const updated = { ...video, thumbnail };
        await putVideo(updated);
        const current = useLibraryStore.getState().videos;
        setVideos(current.map((item) => item.id === video.id ? updated : item));
      }));
    }
    catch { setError("The local library could not be opened. Restart the app and try again."); }
  }, [setVideos, setError]);

  useEffect(() => {
    void refresh();
    void writeSetting("isRecording", false).catch(() => undefined);
    void readSetting<string>("saveDirectory").then((value) => setSaveDirectory(value || "")).catch(() => undefined);
    void readSetting<RecordingPreferences>("recordingPreferences").then((value) => { if (value) setRecordingPreferences((current) => ({ ...current, ...value })); }).catch(() => undefined);
    let unlistenLibrary: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;
    let unlistenPreferences: (() => void) | undefined;
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
    void listen<RecordingPreferences>(recordingEvents.recordingPreferences, (event) => setRecordingPreferences((current) => ({ ...current, ...event.payload })))
      .then((stop) => { unlistenPreferences = stop; }).catch((cause) => console.warn("Could not listen for recording preferences", cause));
    return () => { unlistenLibrary?.(); unlistenFocus?.(); unlistenPreferences?.(); };
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

  useEffect(() => {
    if (!denoisePreview) { setDenoisePreviewUrl((url) => { if (url) URL.revokeObjectURL(url); return null; }); return; }
    let cancelled = false;
    let url: string | null = null;
    void readRecordingBlob(denoisePreview, "video/mp4").then((blob) => {
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setDenoisePreviewUrl(url);
    }).catch(() => undefined);
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [denoisePreview]);

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

  const updateRecordingPreferences = async (preferences: RecordingPreferences) => {
    setRecordingPreferences(preferences);
    await writeSetting("recordingPreferences", preferences);
    await emitTo("recording-setup", recordingEvents.recordingPreferences, preferences).catch(() => undefined);
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

  const renameSelected = async (title: string) => {
    if (!selected) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    const updated = { ...selected, title: trimmed };
    await putVideo(updated);
    setVideos(videos.map((item) => item.id === updated.id ? updated : item));
    setNotice("Title updated");
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

  const exportSelected = async (quality: "high" | "standard" | "low" = "standard") => {
    if (!selected) return;
    try {
      const filePath = await invoke<string>("export_recording_file", { sourcePath: selected.filePath || "", directory: saveDirectory || null, suggestedName: `${selected.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "recodex-recording"}-${quality}.mp4`, quality, thumbnailBytes: selected.thumbnail ? Array.from(dataUrlToBytes(selected.thumbnail)) : [] });
      const updated = { ...selected, filePath: selected.filePath || filePath, filePaths: [...new Set([...(selected.filePaths || (selected.filePath ? [selected.filePath] : [])), filePath])] };
      await putVideo(updated);
      setVideos(videos.map((item) => item.id === updated.id ? updated : item));
      setNotice(`Exported (${quality} quality): ${filePath}`);
    } catch (cause) { setError(cause instanceof Error ? `Export could not be saved. ${cause.message}` : "Export could not be saved."); }
  };

  const addCustomThumbnail = async (imageDataUrl: string) => {
    if (!selected) return;
    try {
      const updatedThumbnail = { ...selected, thumbnail: imageDataUrl };
      await putVideo(updatedThumbnail);
      setVideos(videos.map((item) => item.id === updatedThumbnail.id ? updatedThumbnail : item));
      const bytes = Array.from(dataUrlToBytes(imageDataUrl));
      const filePath = await invoke<string>("embed_thumbnail_in_video", { sourcePath: selected.filePath || "", thumbnailBytes: bytes, inPlace: true });
      const size = await invoke<number>("recording_file_size", { path: filePath });
      const updated = { ...updatedThumbnail, filePath, sizeBytes: size };
      await putVideo(updated);
      setVideos(videos.map((item) => item.id === updated.id ? updated : item));
      setNotice("Custom thumbnail added to the video");
    } catch (cause) { setError(cause instanceof Error ? `Could not add thumbnail. ${cause.message}` : "Could not add thumbnail."); }
  };

  const denoiseSelected = async (level: "low" | "medium" | "high") => {
    if (!selected) return;
    try {
      const filePath = await invoke<string>("denoise_recording", { sourcePath: selected.filePath || "", level, inPlace: false });
      setDenoisePreview(filePath);
    } catch (cause) { setError(cause instanceof Error ? `Could not denoise recording. ${cause.message}` : "Could not denoise recording."); }
  };

  const approveDenoise = async () => {
    if (!selected || !denoisePreview) return;
    try {
      await invoke("delete_recording_file", { path: selected.filePath || "" });
      const size = await invoke<number>("recording_file_size", { path: denoisePreview });
      const updated = { ...selected, filePath: denoisePreview, filePaths: [denoisePreview], sizeBytes: size, mimeType: "video/mp4", denoised: true };
      await putVideo(updated);
      setVideos(videos.map((item) => item.id === updated.id ? updated : item));
      setDenoisePreview(null);
      setDenoisePreviewUrl((url) => { if (url) URL.revokeObjectURL(url); return null; });
      setNotice("Recording replaced with denoised version");
    } catch (cause) { setError(cause instanceof Error ? `Could not replace recording. ${cause.message}` : "Could not replace recording."); }
  };

  const keepBothDenoise = async () => {
    if (!selected || !denoisePreview) return;
    try {
      const size = await invoke<number>("recording_file_size", { path: denoisePreview });
      const newVideo = { ...selected, id: crypto.randomUUID(), title: `${selected.title} (Denoised)`, filePath: denoisePreview, filePaths: [denoisePreview], sizeBytes: size, mimeType: "video/mp4", denoised: true, createdAt: Date.now() };
      await putVideo(newVideo);
      setVideos([...videos, newVideo]);
      setDenoisePreview(null);
      setDenoisePreviewUrl((url) => { if (url) URL.revokeObjectURL(url); return null; });
      setNotice("Denoised copy saved to library");
    } catch (cause) { setError(cause instanceof Error ? `Could not save denoised copy. ${cause.message}` : "Could not save denoised copy."); }
  };

  const discardDenoise = async () => {
    if (!denoisePreview) return;
    try { await invoke("delete_recording_file", { path: denoisePreview }); } catch { /* ignore */ }
    setDenoisePreview(null);
    setDenoisePreviewUrl((url) => { if (url) URL.revokeObjectURL(url); return null; });
  };

  const isRecordingPage = location.pathname === "/recording";
  const pageTitles: Record<string, string> = { "/account": "Account", "/settings": "Settings", "/preferences": "Preferences", "/help": "Help" };
  const headerTitle = pageTitles[location.pathname] || (isDetail ? "Recording" : isRecordingPage ? "Recording" : "My recordings");

  return (
    <div className="app-shell">
      <Sidebar videoCount={videos.length} onNewRecording={() => void openRecorder()} />
      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{location.pathname === "/settings" ? "Settings" : headerTitle}</strong></div><div className="top-actions"><span className="local-pill"><span /> Saved locally</span><button className="icon-button" aria-label="Settings" title="Settings" onClick={() => navigate("/settings")}><Icon name="settings" /></button><button className="avatar small" aria-label="Personal workspace">A</button></div></header>
        <Routes>
          <Route path="/" element={<LibraryPage videos={videos} filtered={filtered.slice(0, 3)} query={query} showToolbar={false} onQueryChange={setQuery} searchInput={searchInput} sortOrder={sortOrder} onSortChange={setSortOrder} view={view} onViewChange={setView} onNewRecording={() => void openRecorder()} onOpenVideo={(video) => navigate(`/recordings/${video.id}`)} />} />
          <Route path="/recording" element={<RecordingPage videos={videos} filtered={filtered} query={query} onQueryChange={setQuery} searchInput={searchInput} sortOrder={sortOrder} onSortChange={setSortOrder} view={view} onViewChange={setView} onOpenVideo={(video) => navigate(`/recordings/${video.id}`)} />} />
          <Route path="/recordings/:id" element={<RecordingDetailRoute videos={videos} previewVideo={previewVideo} renaming={renaming} draftTitle={draftTitle} onDraftTitleChange={setDraftTitle} onStartRename={() => { if (selected) { setDraftTitle(selected.title); setRenaming(true); } }} onCancelRename={() => setRenaming(false)} onUpdateTitle={() => void updateTitle()} onExport={(quality: string) => void exportSelected(quality as "high" | "standard" | "low")} onAddThumbnail={(imageDataUrl: string) => void addCustomThumbnail(imageDataUrl)} onDenoise={(level: string) => void denoiseSelected(level as "low" | "medium" | "high")} onRename={(title: string) => void renameSelected(title)} onDelete={() => setConfirmDelete(true)} onBack={() => navigate("/")} />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/preferences" element={<PreferencesPage saveDirectory={saveDirectory} recordingPreferences={recordingPreferences} onChooseSaveDirectory={() => void chooseSaveDirectory()} onResetSaveDirectory={() => void resetSaveDirectory()} onRecordingPreferencesChange={(preferences) => void updateRecordingPreferences(preferences)} />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {denoisePreview && selected && <div className="detail-options-backdrop" role="presentation"><aside className="detail-options-drawer" aria-label="Denoise preview"><header className="detail-options-header"><strong>Preview denoised recording</strong><button className="icon-button" onClick={() => void discardDenoise()} aria-label="Close preview"><Icon name="close" size={16} /></button></header><p>Review the denoised version before replacing the original.</p>{denoisePreviewUrl && <video src={denoisePreviewUrl} controls style={{ width: "100%", borderRadius: 8 }} />}<div className="confirm-actions" style={{ marginTop: 16 }}><button className="button secondary" onClick={() => void discardDenoise()}>Discard</button><button className="button secondary" onClick={() => void keepBothDenoise()}>Keep both</button><button className="button primary" onClick={() => void approveDenoise()}>Replace original</button></div></aside></div>}
      {confirmDelete && selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDelete(false); }}><div className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-heading"><div className="delete-icon"><Icon name="trash" size={19} /></div><h2 id="delete-heading">Delete this recording?</h2><p><strong>{selected.title}</strong> and its saved video file will be deleted from this device. This cannot be undone.</p><div className="confirm-actions"><button className="button secondary" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="button delete-confirm" onClick={() => void deleteSelected()}>Delete recording</button></div></div></div>}
      {error && <div className="toast error-toast"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><Icon name="close" size={16} /></button></div>}
      {notice && <div className="toast"><span className="toast-check"><Icon name="check" size={13} /></span>{notice}</div>}
    </div>
  );
}

function RecordingDetailRoute({ videos, previewVideo, renaming, draftTitle, onDraftTitleChange, onStartRename, onCancelRename, onUpdateTitle, onExport, onAddThumbnail, onDenoise, onRename, onDelete, onBack }: any) {
  const { id } = useParams();
  const video = videos.find((item: VideoItem) => item.id === id);
  if (!video) return <Navigate to="/" replace />;
  return <RecordingDetailPage video={video} previewVideo={previewVideo} renaming={renaming} draftTitle={draftTitle} onDraftTitleChange={onDraftTitleChange} onStartRename={onStartRename} onCancelRename={onCancelRename} onUpdateTitle={onUpdateTitle} onExport={onExport} onAddThumbnail={onAddThumbnail} onDenoise={onDenoise} onRename={onRename} onDelete={onDelete} onBack={onBack} />;
}

export default function MainApp() {
  return (
    <BrowserRouter>
      <MainShell />
    </BrowserRouter>
  );
}
