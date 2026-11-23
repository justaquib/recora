import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalPosition, LogicalSize, PhysicalPosition, primaryMonitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import "../../App.css";
import { Icon } from "../../components/Icon";
import RecordingIssueModal from "../../components/RecordingIssueModal";
import RecorderSetupModal from "../../components/RecorderSetupModal";
import { friendlyError, formatFileSize, formatTime } from "../../utils/format";
import { recordingEvents } from "./recordingEvents";
import type { AnnotationTool, CaptureMode, Source, VideoItem, WidgetStatus } from "../../shared/types";
import { appendBlobToTemporaryFile, copyRecordingFile, createTemporaryRecordingFile, finalizeTemporaryRecordingFile, putVideo, readBlobDuration, readRecordingBlob, readRecordingFileSize, readSetting, writeSetting } from "../../services/recordingStorage";

export default function RecordingSetupWindow() {
  const [captureMode, setCaptureMode] = useState<CaptureMode>("screen");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const bubbleVisibleRef = useRef(true);
  const bubbleRevision = useRef(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const micEnabledRef = useRef(micEnabled);
  micEnabledRef.current = micEnabled;
  const [microphones, setMicrophones] = useState<Source[]>([]);
  const [cameras, setCameras] = useState<Source[]>([]);
  const [micId, setMicId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showRecorder, setShowRecorder] = useState(true);
  const [busy, setBusy] = useState(false);
  const [countdownDuration, setCountdownDuration] = useState(5);
  const [savingFile, setSavingFile] = useState(false);
  const saveDirectory = useRef<string | null>(null);

  const displayStream = useRef<MediaStream | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const meterContext = useRef<AudioContext | null>(null);
  const meterTimer = useRef<number | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const nativeRecordingPath = useRef<string | null>(null);
  const recordingWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const recordingWriteError = useRef("");
  const recorderMimeType = useRef("video/webm");
  const recordingSession = useRef("");
  const captureOptions = useRef({ captureMode, cameraEnabled, micEnabled });
  captureOptions.current = { captureMode, cameraEnabled, micEnabled };
  const startTime = useRef(0);
  const pauseStarted = useRef(0);
  const pausedTotal = useRef(0);
  const pausedRef = useRef(false);
  const latestElapsed = useRef(0);
  const stopRequested = useRef(false);
  const annotationSnapshotKey = useRef<string | null>(null);
  const countdownTimer = useRef<number | null>(null);
  const countdownFinish = useRef<(() => void) | null>(null);

  const currentWindow = getCurrentWindow();
  const skipCountdown = () => {
    if (countdownTimer.current !== null) window.clearTimeout(countdownTimer.current);
    countdownTimer.current = null;
    void emitTo("recording-countdown", recordingEvents.countdownState, { remaining: null }).catch(() => undefined);
    void WebviewWindow.getByLabel("recording-countdown").then((widget) => widget?.hide()).catch(() => undefined);
    countdownFinish.current?.();
    countdownFinish.current = null;
  };
  useEffect(() => {
    document.documentElement.classList.add("widget-document");
    document.body.classList.add("widget-body");
    document.documentElement.style.backgroundColor = "transparent";
    document.body.style.backgroundColor = "transparent";
    return () => {
      document.documentElement.classList.remove("widget-document");
      document.body.classList.remove("widget-body");
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
    };
  }, []);
  useEffect(() => {
    if (!showRecorder) return;
    const resize = () => {
      const modal = document.querySelector(".recorder-modal") as HTMLElement | null;
      if (!modal) return;
      void currentWindow.setSize(new LogicalSize(Math.ceil(modal.offsetWidth), Math.ceil(modal.offsetHeight))).catch(() => undefined);
    };
    const timer = window.setTimeout(resize, 60);
    return () => window.clearTimeout(timer);
  }, [showRecorder, captureMode, error, cameraEnabled, micEnabled, microphones.length, cameras.length, countdownDuration]);
  const waitForUnmutedTracks = async (stream: MediaStream, deviceName: string) => {
    const deadline = Date.now() + 3500;
    while (stream.getTracks().some((track) => track.muted) && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    const muted = stream.getTracks().filter((track) => track.muted);
    if (muted.length) {
      const kind = muted.map((track) => track.kind).join(" and ");
      const privacyPane = kind.includes("audio") ? "Microphone" : deviceName === "Camera" ? "Camera" : "Screen Recording";
      throw new Error(`${deviceName} ${kind} input is muted by macOS. Enable Recodex under System Settings → Privacy & Security → ${privacyPane}, then fully quit and reopen Recodex.`);
    }
  };
  const prepareCaptureHost = async () => {
    // Keep the capture-owning WKWebView stable for the lifetime of the native
    // display-capture session. Resizing it after getDisplayMedia can mute the
    // source track in WebKit. Make it visually transparent and click-through
    // instead of changing its dimensions or position.
    document.documentElement.style.backgroundColor = "transparent";
    document.body.style.backgroundColor = "transparent";
    await currentWindow.setIgnoreCursorEvents(true);
    await currentWindow.show();
  };
  const restoreSetupWindow = async () => {
    await currentWindow.setIgnoreCursorEvents(false).catch(() => undefined);
    document.documentElement.style.backgroundColor = "transparent";
    document.body.style.backgroundColor = "transparent";
    await currentWindow.setSize(new LogicalSize(472, 560)).catch(() => undefined);
    await currentWindow.center().catch(() => undefined);
    await currentWindow.show().catch(() => undefined);
  };
  useEffect(() => {
    void readSetting<string>("saveDirectory").then((value) => { saveDirectory.current = value || null; }).catch((cause) => console.warn("Could not load save location", cause));
    void loadDevices();
    let unlistenSettings: (() => void) | undefined;
    void listen<{ saveDirectory: string }>(recordingEvents.setupConfig, (event) => { saveDirectory.current = event.payload.saveDirectory || null; setShowRecorder(true); setError(""); })
      .then((stop) => { unlistenSettings = stop; }).catch((cause) => console.warn("Could not sync save location", cause));
    return () => unlistenSettings?.();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3400);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!recording || paused) return;
    const timer = window.setInterval(() => {
      const activePause = paused ? Date.now() - pauseStarted.current : 0;
      const currentElapsed = Math.floor((Date.now() - startTime.current - pausedTotal.current - activePause) / 1000);
      setElapsed(currentElapsed);
      const status: WidgetStatus = { active: true, ready: true, recording: true, preparing: false, paused, elapsed: currentElapsed, camera: captureMode === "screen" && cameraEnabled, microphone: micEnabled, microphoneAvailable: captureMode === "screen" || Boolean(micStream.current?.getAudioTracks().length), cameraDeviceId: cameraId, screen: captureMode === "screen", bubble: captureMode === "screen" && bubbleVisibleRef.current, bubbleRevision: bubbleRevision.current };
      void Promise.all(["camera-bubble", "recording-controls"].map((label) => emitTo(label, "recodex:widget-status", status))).catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording, paused, captureMode, cameraEnabled, cameraId, micEnabled, bubbleVisible]);
  useEffect(() => {
    if (!recording) return;
    const status: WidgetStatus = { active: true, ready: true, recording: true, preparing: false, paused, elapsed, camera: captureMode === "screen" && cameraEnabled, microphone: micEnabled, microphoneAvailable: captureMode === "screen" || Boolean(micStream.current?.getAudioTracks().length), cameraDeviceId: cameraId, screen: captureMode === "screen", bubble: captureMode === "screen" && bubbleVisible, bubbleRevision: bubbleRevision.current };
    void Promise.all(["camera-bubble", "recording-controls"].map((label) => emitTo(label, "recodex:widget-status", status))).catch(() => undefined);
  }, [recording, paused, elapsed, captureMode, cameraEnabled, cameraId, micEnabled, bubbleVisible]);
  const showRecordingWidgets = async (showBubble: boolean, hasCamera: boolean, cameraDeviceId: string, microphoneEnabled: boolean, microphoneAvailable: boolean) => {
    bubbleVisibleRef.current = showBubble;
    setBubbleVisible(showBubble);
    try {
      const monitor = await primaryMonitor();
      const scale = monitor?.scaleFactor || 1;
      const left = (monitor?.position.x || 0) / scale;
      const top = (monitor?.position.y || 0) / scale;
      const width = (monitor?.size.width || 1440) / scale;
      const height = (monitor?.size.height || 900) / scale;
      const positions: Array<[string, number, number, boolean]> = [
        ["camera-bubble", left + width - 218, top + 42, showBubble],
        ["recording-controls", left + (width - 468) / 2, top + height - 145, true],
      ];
      for (const [label, x, y, shouldShow] of positions) {
        const widget = await WebviewWindow.getByLabel(label);
        if (!widget) continue;
        if (shouldShow) {
          const saved = await readSetting<{ x: number; y: number }>(`widgetPosition:${label}`).catch(() => undefined);
          if (saved) await widget.setPosition(new PhysicalPosition(saved.x, saved.y));
          else await widget.setPosition(new LogicalPosition(x, y));
          await widget.show();
        }
        else await widget.hide();
      }
      const status: WidgetStatus = { active: true, ready: false, recording: false, preparing: true, paused: false, elapsed: 0, camera: hasCamera, microphone: microphoneEnabled, microphoneAvailable, cameraDeviceId, screen: showBubble || hasCamera, bubble: showBubble, bubbleRevision: bubbleRevision.current };
      // A newly shown WebView may still be starting; repeat the idempotent status event briefly.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await Promise.all(["camera-bubble", "recording-controls", "annotation-overlay"].map((label) => emitTo(label, "recodex:widget-status", status)));
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
    } catch (cause) {
      console.error("Could not show recorder widgets", cause);
      setNotice("Recording continues. Floating controls could not be opened.");
    }
  };

  const placeCountdownWidget = async () => {
    const widget = await WebviewWindow.getByLabel("recording-countdown");
    if (!widget) throw new Error("The floating countdown window is unavailable. Restart Recodex and try again.");
    const monitor = await primaryMonitor();
    const scale = monitor?.scaleFactor || 1;
    const left = (monitor?.position.x || 0) / scale;
    const top = (monitor?.position.y || 0) / scale;
    const width = (monitor?.size.width || 1440) / scale;
    const height = (monitor?.size.height || 900) / scale;
    await widget.setPosition(new LogicalPosition(left + (width - 240) / 2, top + (height - 220) / 2));
    await widget.show();
  };

  const publishCountdown = async (remaining: number | null) => {
    await emitTo("recording-countdown", recordingEvents.countdownState, { remaining }).catch(() => undefined);
  };

  const hideRecordingWidgets = async () => {
    const inactive: WidgetStatus = { active: false, ready: false, recording: false, preparing: false, paused: false, elapsed: 0, camera: false, saving: false };
    void emitTo("recording-countdown", recordingEvents.countdownState, { remaining: null }).catch(() => undefined);
    if (annotationSnapshotKey.current) {
      try { localStorage.removeItem(annotationSnapshotKey.current); } catch { /* optional snapshot cleanup */ }
      annotationSnapshotKey.current = null;
    }
    try {
      await Promise.all(["camera-bubble", "recording-controls", "annotation-overlay"].map((label) => emitTo(label, "recodex:widget-status", inactive)));
      for (const label of ["camera-bubble", "recording-controls", "recording-countdown", "annotation-overlay"]) {
        const widget = await WebviewWindow.getByLabel(label);
        await widget?.hide();
      }
    } catch (cause) { console.warn("Could not hide recorder widgets", cause); }
  };

  const loadDevices = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
      setError("Recording is not available in this WebView. Update macOS and reopen Recodex."); return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((device) => device.kind === "audioinput").map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Microphone ${index + 1}` }));
    const cams = devices.filter((device) => device.kind === "videoinput").map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Camera ${index + 1}` }));
    setMicrophones(mics); setCameras(cams);
    if (cams.length === 0) setCameraEnabled(false);
    setMicId((value) => value || mics[0]?.deviceId || ""); setCameraId((value) => value || cams[0]?.deviceId || "");
  };

  const cleanupCapture = () => {
    if (meterTimer.current !== null) window.clearInterval(meterTimer.current);
    meterTimer.current = null;
    void meterContext.current?.close().catch(() => undefined);
    meterContext.current = null;
    [displayStream.current, cameraStream.current, micStream.current].forEach((stream) => stream?.getTracks().forEach((track) => track.stop()));
    displayStream.current = null; cameraStream.current = null; micStream.current = null;
  };
  const startMicrophoneMeter = (stream: MediaStream) => {
    if (!stream.getAudioTracks().length) return;
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      meterContext.current = context;
      const samples = new Float32Array(analyser.fftSize);
      meterTimer.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        void emitTo("recording-controls", "recodex:widget-status", { microphoneLevel: Math.min(1, rms * 7) } satisfies Partial<WidgetStatus>);
      }, 80);
    } catch (cause) { console.warn("Could not start the microphone level meter", cause); }
  };

  const saveRecording = async (temporaryPath: string, mimeType: string, captureDuration: number, mediaDuration: number | null, sizeBytes: number) => {
    let saved = false;
    try {
      if (sizeBytes < 1024) throw new Error(`No usable media was encoded (${mimeType}, ${formatFileSize(sizeBytes)}). Check that the selected capture source is still active. Recovery file: ${temporaryPath}`);
      setRecording(false); setPaused(false);
      const savingStatus: WidgetStatus = { active: true, ready: false, recording: false, paused: false, elapsed: captureDuration, camera: false, saving: true, savingStage: "saving" };
      await Promise.all(["camera-bubble", "recording-controls", "annotation-overlay"].map((label) => emitTo(label, "recodex:widget-status", savingStatus)));
      const extension = mimeType.includes("mp4") ? "mp4" : "webm";
      const recordedDuration = mediaDuration ?? captureDuration;
      const incomplete = mediaDuration !== null && captureDuration - mediaDuration > 3;
      if (incomplete) {
        throw new Error(`Recording is incomplete: playable media is ${formatTime(mediaDuration)} but the recorder ran for ${formatTime(captureDuration)}. It was not added to the library. Recovery file: ${temporaryPath}`);
      }
      setSavingFile(true);
      const video: VideoItem = { id: crypto.randomUUID(), title: `Untitled recording ${new Date().toLocaleDateString()}`, createdAt: Date.now(), duration: recordedDuration, captureDuration, sizeBytes, thumbnail: "", mimeType, hasCamera: captureOptions.current.captureMode === "camera" || (captureOptions.current.captureMode === "screen" && captureOptions.current.cameraEnabled) };
      const suggestedName = `${video.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "recodex-recording"}.${extension}`;
      const filePath = await finalizeTemporaryRecordingFile(temporaryPath, suggestedName);
      const filePaths = [filePath];
      let externalSaveError = "";
      try { filePaths.push(await copyRecordingFile(filePath, suggestedName, saveDirectory.current)); }
      catch (cause) { externalSaveError = cause instanceof Error ? cause.message : "Could not copy to the selected save location."; }
      const savedVideo = { ...video, filePath, filePaths };
      await putVideo(savedVideo);
      saved = true;
      setNotice(externalSaveError ? `Saved in Recodex. Could not copy to the selected folder: ${externalSaveError}` : `Saved ${extension.toUpperCase()} recording${saveDirectory.current ? " to your chosen location" : " to Documents/Recodex"}`);
      const idleStatus: WidgetStatus = { active: true, ready: false, recording: false, paused: false, elapsed: 0, camera: false, microphone: false, microphoneAvailable: false, cameraDeviceId: cameraId, screen: captureOptions.current.captureMode === "screen", bubble: captureOptions.current.captureMode === "screen" && bubbleVisibleRef.current, bubbleRevision: bubbleRevision.current, saving: false };
      await Promise.all(["camera-bubble", "recording-controls"].map((label) => emitTo(label, "recodex:widget-status", idleStatus)));
      void emitTo("main", recordingEvents.libraryChanged, { id: video.id }).catch((cause) => console.warn("Could not refresh the library after saving", cause));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The recording could not be finalized.");
      await currentWindow.show().catch(() => undefined);
    } finally {
      await writeSetting("isRecording", false).catch(() => undefined);
      if (!saved) await hideRecordingWidgets();
      nativeRecordingPath.current = null;
      mediaRecorder.current = null; recordingSession.current = ""; stopRequested.current = false;
      cleanupCapture(); setRecording(false); setPaused(false); setSavingFile(false);
      if (saved) {
        await currentWindow.setIgnoreCursorEvents(false).catch(() => undefined);
        await currentWindow.hide().catch(() => undefined);
      } else {
        await restoreSetupWindow();
      }
    }
  };

  const startRecording = async () => {
    setError(""); setBusy(true);
    let nativePath: string | null = null;
    try {
      let videoSource: MediaStream | null = null;
      if (captureMode === "screen") {
        const screenPermission = await invoke<boolean>("request_screen_capture_permission");
        if (!screenPermission) throw new Error("macOS Screen Recording access is not enabled for Recodex. Enable it under System Settings → Privacy & Security → Screen Recording, then fully quit and reopen Recodex.");
        if (micEnabled) {
          micStream.current = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true }, video: false });
          await waitForUnmutedTracks(micStream.current, "Microphone");
        }
        nativePath = await createTemporaryRecordingFile(`Recodex recording ${Date.now()}.mp4`);
        try {
          await invoke("native_capture_choose_source");
        } catch (cause) {
          await invoke("delete_recording_file", { path: nativePath }).catch(() => undefined);
          nativePath = null;
          throw cause;
        }
      } else {
        videoSource = await navigator.mediaDevices.getUserMedia({ video: { deviceId: cameraId ? { exact: cameraId } : undefined, width: 1280, height: 720 }, audio: false });
        if (!videoSource.getVideoTracks().some((track) => track.readyState === "live")) throw new Error("The selected camera did not provide a live video track.");
        await waitForUnmutedTracks(videoSource, "Camera");
        cameraStream.current = videoSource;
        if (micEnabled) {
          micStream.current = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true }, video: false });
          await waitForUnmutedTracks(micStream.current, "Microphone");
        }
      }
      setElapsed(0); latestElapsed.current = 0; pausedTotal.current = 0; stopRequested.current = false;
      setShowRecorder(false); setPaused(false); pausedRef.current = false;
      await currentWindow.hide();
      await showRecordingWidgets(captureMode === "screen", captureMode === "screen" && cameraEnabled, cameraId, micEnabled, captureMode === "screen" || Boolean(micStream.current?.getAudioTracks().length));
      if (countdownDuration > 0) {
        await placeCountdownWidget();
        await new Promise<void>((resolve) => {
          countdownFinish.current = resolve;
          const tick = (remaining: number) => {
            void publishCountdown(remaining);
            if (remaining <= 0) {
              countdownTimer.current = null;
              countdownFinish.current = null;
              void emitTo("recording-countdown", recordingEvents.countdownState, { remaining: null }).catch(() => undefined);
              void WebviewWindow.getByLabel("recording-countdown").then((widget) => widget?.hide()).catch(() => undefined);
              resolve();
              return;
            }
            countdownTimer.current = window.setTimeout(() => tick(remaining - 1), 1000);
          };
          tick(countdownDuration);
        });
      }
      if (micStream.current) {
        startMicrophoneMeter(micStream.current);
        await meterContext.current?.resume().catch(() => undefined);
      }
      const sessionId = crypto.randomUUID();

      if (nativePath) {
        await invoke("native_capture_start", { path: nativePath, microphone: micEnabled });
        nativeRecordingPath.current = nativePath;
        recordingSession.current = sessionId;
        await writeSetting("isRecording", true);
        startTime.current = Date.now();
        setRecording(true);
        await currentWindow.hide();
        return;
      }

      if (!videoSource) throw new Error("No video source was selected.");
      const output = new MediaStream(videoSource.getTracks());
      micStream.current?.getAudioTracks().forEach((track) => output.addTrack(track));
      recordingSession.current = sessionId;
      await writeSetting("isRecording", true);

      const mimeType = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8", "video/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(output, mimeType ? { mimeType } : undefined);
      mediaRecorder.current = recorder;
      recorderMimeType.current = recorder.mimeType || mimeType || "video/webm";
      const extension = recorderMimeType.current.includes("mp4") ? "mp4" : "webm";
      const temporaryPath = await createTemporaryRecordingFile(`Recodex recording ${Date.now()}.${extension}`);
      recordingWriteQueue.current = Promise.resolve();
      recordingWriteError.current = "";
      let dataEvents = 0;
      let totalBytes = 0;
      let encoderError = "";
      recorder.ondataavailable = (event) => {
        dataEvents += 1;
        totalBytes += event.data.size;
        if (event.data.size > 0) {
          recordingWriteQueue.current = recordingWriteQueue.current.then(() => appendBlobToTemporaryFile(temporaryPath, event.data)).catch((cause) => {
            recordingWriteError.current = cause instanceof Error ? cause.message : "A recording chunk could not be written to temporary storage.";
          });
        }
      };
      recorder.onerror = (event) => { encoderError = (event as Event & { error?: DOMException }).error?.message || "The media encoder reported an error."; };
      recorder.onstop = () => { void (async () => {
        const finalMimeType = recorder.mimeType || recorderMimeType.current;
        await recordingWriteQueue.current;
        if (recordingWriteError.current) throw new Error(`${recordingWriteError.current} The temporary recording remains at ${temporaryPath}.`);
        const blob = await readRecordingBlob(temporaryPath, finalMimeType);
        // WebKit can produce only a container header without encoded video.
        // Never persist that tiny payload as a valid recording.
        if (blob.size < 1024) {
          const tracks = output.getTracks().map((track) => {
            const settings = track.getSettings();
            const dimensions = settings.width && settings.height ? `:${settings.width}x${settings.height}` : "";
            return `${track.kind}:${track.readyState}${track.enabled ? ":enabled" : ":disabled"}${track.muted ? ":muted" : ""}${dimensions}`;
          }).join(", ") || "no tracks";
          throw new Error(encoderError || `Only ${formatFileSize(totalBytes)} was encoded across ${dataEvents} data events (${finalMimeType}). No usable video frames were encoded. Input tracks: ${tracks}. Temporary file: ${temporaryPath}`);
        }
        const mediaDuration = await readBlobDuration(blob);
        await saveRecording(temporaryPath, finalMimeType, latestElapsed.current, mediaDuration, blob.size);
      })().catch(async (cause) => {
        setError(cause instanceof Error ? cause.message : "The recording could not be written to disk.");
        await writeSetting("isRecording", false).catch(() => undefined);
        await hideRecordingWidgets();
        recordingSession.current = ""; stopRequested.current = false; mediaRecorder.current = null;
        cleanupCapture(); setRecording(false); setPaused(false);
        await restoreSetupWindow();
      }); };
      if (captureMode === "screen") videoSource.getVideoTracks()[0].addEventListener("ended", stopRecording, { once: true });
      recorder.start(1000);
      startTime.current = Date.now();
      setRecording(true);
      setShowRecorder(false);
      await prepareCaptureHost();
    } catch (cause) {
      void writeSetting("isRecording", false).catch(() => undefined);
      if (nativeRecordingPath.current) await invoke("native_capture_stop", { expectedDurationSeconds: 0 }).catch(() => undefined);
      if (nativePath) await invoke("delete_recording_file", { path: nativePath }).catch(() => undefined);
      nativeRecordingPath.current = null;
      mediaRecorder.current = null;
      recordingSession.current = "";
      await hideRecordingWidgets(); cleanupCapture(); setRecording(false); setError(friendlyError(cause)); await restoreSetupWindow();
    } finally { setBusy(false); }
  };

  const stopRecording = () => {
    if (!recordingSession.current || stopRequested.current) return;
    stopRequested.current = true;
    const activePause = pausedRef.current ? Date.now() - pauseStarted.current : 0;
    latestElapsed.current = Math.floor((Date.now() - startTime.current - pausedTotal.current - activePause) / 1000);
    const finalizingStatus: WidgetStatus = { active: true, ready: false, paused: false, elapsed: latestElapsed.current, camera: false, saving: true, savingStage: "finalizing" };
    void Promise.all(["camera-bubble", "recording-controls", "annotation-overlay"].map((label) => emitTo(label, "recodex:widget-status", finalizingStatus)));
    if (nativeRecordingPath.current) {
      const nativePath = nativeRecordingPath.current;
      void (async () => {
        try {
          await invoke("native_capture_stop", { expectedDurationSeconds: latestElapsed.current });
          const sizeBytes = await readRecordingFileSize(nativePath);
          await saveRecording(nativePath, "video/mp4", latestElapsed.current, latestElapsed.current, sizeBytes);
        } catch (cause) {
          const detail = friendlyError(cause);
          console.error("Native recording finalization failed", { path: nativePath, error: cause });
          setError(`${detail} Recovery files remain in Recodex's app-local .temp folder.`);
          await writeSetting("isRecording", false).catch(() => undefined);
          await hideRecordingWidgets();
          nativeRecordingPath.current = null; recordingSession.current = ""; stopRequested.current = false;
          setRecording(false); setPaused(false); await restoreSetupWindow();
        }
      })();
      return;
    }
    const recorder = mediaRecorder.current;
    if (!recorder) {
      stopRequested.current = false;
      setError("The recorder is not ready to stop yet. Try again in a moment.");
      return;
    }
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch (cause) {
      stopRequested.current = false;
      setError(cause instanceof Error ? `Could not stop recording: ${cause.message}` : "Could not stop the recording.");
    }
  };

  const togglePause = () => {
    if (!recordingSession.current || stopRequested.current) return;
    if (nativeRecordingPath.current) {
      const nextPaused = !pausedRef.current;
      void invoke("native_capture_pause", { paused: nextPaused }).then(() => {
        if (nextPaused) { pauseStarted.current = Date.now(); pausedRef.current = true; setPaused(true); }
        else { pausedTotal.current += Date.now() - pauseStarted.current; pausedRef.current = false; setPaused(false); }
      }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not change native recording pause state."));
      return;
    }
    const recorder = mediaRecorder.current;
    const action = pausedRef.current ? "resume" : "pause";
    try {
      if (action === "pause" && recorder?.state === "recording") recorder.pause();
      else if (action === "resume" && recorder?.state === "paused") recorder.resume();
      else return;
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not ${action} recording.`); return; }
    if (action === "pause") { pauseStarted.current = Date.now(); pausedRef.current = true; setPaused(true); }
    else { pausedTotal.current += Date.now() - pauseStarted.current; pausedRef.current = false; setPaused(false); }
    const activePause = pausedRef.current ? Date.now() - pauseStarted.current : 0;
    const currentElapsed = Math.floor((Date.now() - startTime.current - pausedTotal.current - activePause) / 1000);
    void emitTo("recording-controls", "recodex:widget-status", {
      active: true, ready: true, paused: pausedRef.current, elapsed: currentElapsed,
      camera: captureOptions.current.captureMode === "screen" && captureOptions.current.cameraEnabled,
      microphone: micEnabledRef.current,
      cameraDeviceId: cameraId, screen: captureOptions.current.captureMode === "screen", bubble: captureOptions.current.captureMode === "screen" && bubbleVisibleRef.current, bubbleRevision: bubbleRevision.current,
    } satisfies WidgetStatus).catch(() => undefined);
  };

  const toggleMicrophone = async () => {
    const nextEnabled = !micEnabledRef.current;
    if (nativeRecordingPath.current) {
      await invoke("native_capture_set_microphone", { enabled: nextEnabled });
      if (nextEnabled && !micStream.current) {
        micStream.current = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true }, video: false });
        startMicrophoneMeter(micStream.current);
        await meterContext.current?.resume().catch(() => undefined);
      }
      micStream.current?.getAudioTracks().forEach((track) => { track.enabled = nextEnabled; });
    } else {
      const tracks = micStream.current?.getAudioTracks() ?? [];
      if (!tracks.length) throw new Error("Microphone audio was disabled when this recording started. Start a new recording with microphone enabled to use this control.");
      tracks.forEach((track) => { track.enabled = nextEnabled; });
    }
    micEnabledRef.current = nextEnabled;
    captureOptions.current = { ...captureOptions.current, micEnabled: nextEnabled };
    setMicEnabled(nextEnabled);
  };

  const captureAnnotationFrame = async () => {
    if (nativeRecordingPath.current) {
      const image = await invoke<string>("native_capture_snapshot");
      return `data:image/jpeg;base64,${image}`;
    }
    const stream = displayStream.current;
    const track = stream?.getVideoTracks().find((item) => item.readyState === "live");
    if (!stream || !track) throw new Error("Screen annotation is available during screen recording only.");
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    try {
      await video.play();
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error("The screen frame is not ready yet. Try the pen tool again.")), 2500);
          video.onloadeddata = () => { window.clearTimeout(timeout); resolve(); };
        });
      }
      const width = video.videoWidth || track.getSettings().width || 1440;
      const height = video.videoHeight || track.getSettings().height || 900;
      const scale = Math.min(1, 1920 / width);
      const canvas = document.createElement("canvas"); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create the screen annotation canvas.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.72);
    } finally { video.pause(); video.srcObject = null; }
  };
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unlistenPosition: (() => void) | undefined;
    let positionWriteTimer: number | null = null;
    let unlistenAnnotation: (() => void) | undefined;
    let unlistenCameraSettings: (() => void) | undefined;
    let unlistenCountdownSkip: (() => void) | undefined;
    void listen<{ action: "pause" | "stop" | "home" | "microphone" | "bubble" | "new" | "close" }>("recodex:widget-action", async (event) => {
      if (event.payload.action === "pause") togglePause();
      if (event.payload.action === "stop") stopRecording();
      if (event.payload.action === "microphone") void toggleMicrophone().catch((cause) => setNotice(friendlyError(cause)));
      if (event.payload.action === "bubble") {
        const visible = !bubbleVisibleRef.current;
        bubbleRevision.current += 1;
        bubbleVisibleRef.current = visible;
        setBubbleVisible(visible);
        if (!visible) {
          captureOptions.current = { ...captureOptions.current, cameraEnabled: false };
          setCameraEnabled(false);
        }
        const status: WidgetStatus = {
          active: true,
          ready: !stopRequested.current,
          recording: Boolean(recordingSession.current) && !stopRequested.current,
          paused: pausedRef.current,
          elapsed: latestElapsed.current,
          camera: visible && captureOptions.current.captureMode === "screen" && captureOptions.current.cameraEnabled,
          microphone: micEnabledRef.current,
          cameraDeviceId: cameraId,
          screen: captureOptions.current.captureMode === "screen",
          bubble: visible,
          bubbleRevision: bubbleRevision.current,
        };
        await Promise.all(["camera-bubble", "recording-controls"].map((label) => emitTo(label, "recodex:widget-status", status))).catch(() => undefined);
        const cameraWindow = await WebviewWindow.getByLabel("camera-bubble");
        if (visible) await cameraWindow?.show().catch(() => undefined);
        else await cameraWindow?.hide().catch(() => undefined);
      }
      if (event.payload.action === "new") {
        setError(""); setShowRecorder(true);
        await restoreSetupWindow();
      }
      if (event.payload.action === "close") {
        await hideRecordingWidgets();
        return;
      }
      if (event.payload.action === "home") {
        const main = await WebviewWindow.getByLabel("main");
        await main?.unminimize(); await main?.show(); await main?.setFocus();
      }
    }).then((stop) => { unlisten = stop; }).catch((cause) => console.warn("Could not listen for widget actions", cause));
    void listen<{ label: string; x: number; y: number }>("recodex:widget-moved", (event) => {
      if (positionWriteTimer !== null) window.clearTimeout(positionWriteTimer);
      positionWriteTimer = window.setTimeout(() => {
        void writeSetting(`widgetPosition:${event.payload.label}`, { x: event.payload.x, y: event.payload.y }).catch((cause) => console.warn("Could not save floating widget position", cause));
        positionWriteTimer = null;
      }, 180);
    }).then((stop) => { unlistenPosition = stop; }).catch((cause) => console.warn("Could not persist floating widget position", cause));
    void listen<{ camera?: boolean; cameraDeviceId?: string }>("recodex:camera-settings", (event) => {
      if (event.payload.camera !== undefined) {
        captureOptions.current = { ...captureOptions.current, cameraEnabled: event.payload.camera };
        setCameraEnabled(event.payload.camera);
      }
      if (event.payload.cameraDeviceId !== undefined) setCameraId(event.payload.cameraDeviceId);
    }).then((stop) => { unlistenCameraSettings = stop; }).catch((cause) => console.warn("Could not listen for camera settings", cause));
    void listen<Record<string, never>>(recordingEvents.countdownSkip, () => skipCountdown())
      .then((stop) => { unlistenCountdownSkip = stop; }).catch((cause) => console.warn("Could not listen for countdown skip", cause));
    void listen<{ tool: AnnotationTool }>("recodex:annotation-request", async (event) => {
      const tool = event.payload.tool;
      if (tool === "cursor" || tool === "off") {
        if (annotationSnapshotKey.current) {
          try { localStorage.removeItem(annotationSnapshotKey.current); } catch { /* optional snapshot cleanup */ }
          annotationSnapshotKey.current = null;
        }
        await emitTo("annotation-overlay", "recodex:annotation-tool", { tool: "off" }).catch(() => undefined);
        return;
      }
      try {
        const snapshot = await captureAnnotationFrame();
        if (annotationSnapshotKey.current) {
          try { localStorage.removeItem(annotationSnapshotKey.current); } catch { /* replace the previous snapshot */ }
        }
        const snapshotKey = `recodex-annotation-${crypto.randomUUID()}`;
        localStorage.setItem(snapshotKey, snapshot);
        annotationSnapshotKey.current = snapshotKey;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await emitTo("annotation-overlay", "recodex:annotation-tool", { tool, snapshotKey }).catch(() => undefined);
          await new Promise((resolve) => window.setTimeout(resolve, 80));
        }
      } catch (cause) {
        setNotice(cause instanceof Error ? cause.message : "Could not freeze the screen for annotation.");
      }
    }).then((stop) => { unlistenAnnotation = stop; }).catch((cause) => console.warn("Could not listen for annotation requests", cause));
    return () => { if (positionWriteTimer !== null) window.clearTimeout(positionWriteTimer); unlisten?.(); unlistenPosition?.(); unlistenAnnotation?.(); unlistenCameraSettings?.(); unlistenCountdownSkip?.(); };
  }, []);

  const displayError = error && !showRecorder && !recording;
  return <>
    <RecorderSetupModal
      open={showRecorder}
      busy={busy}
      error={error}
      captureMode={captureMode}
      onCaptureModeChange={setCaptureMode}
      cameraEnabled={cameraEnabled}
      onCameraEnabledChange={setCameraEnabled}
      micEnabled={micEnabled}
      onMicEnabledChange={setMicEnabled}
      microphones={microphones}
      cameras={cameras}
      micId={micId}
      onMicChange={setMicId}
      cameraId={cameraId}
      onCameraChange={setCameraId}
      countdownDuration={countdownDuration}
      onCountdownChange={setCountdownDuration}
      onOpenPrivacySettings={() => {
        const section = /microphone|audio/i.test(error) ? "microphone" : /camera/i.test(error) ? "camera" : "screen";
        void invoke("open_capture_privacy_settings", { section }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not open macOS Privacy settings."));
      }}
      onClose={() => { setShowRecorder(false); void currentWindow.hide(); }}
      onStart={() => void startRecording()}
    />
    {savingFile && <div className="saving-indicator"><span className="spinner" /> Saving to your configured folder…</div>}
    {displayError && <RecordingIssueModal message={error} onDismiss={() => setError("")} />}
    {notice && <div className="toast"><span className="toast-check"><Icon name="check" size={13} /></span>{notice}</div>}
  </>;

}

