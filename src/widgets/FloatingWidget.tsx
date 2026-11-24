import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { availableMonitors, getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import "../App.css";
import "./FloatingWidget.css";
import { Icon } from "../components/Icon";
import { readSetting, writeSetting } from "../services/recordingStorage";
import { formatTime } from "../utils/format";
import type { AnnotationTool, CameraFilter, Source, WidgetStatus } from "../shared/types";

const CAMERA_CLOSED_SIZE = new LogicalSize(240, 260);
const CAMERA_SETTINGS_SIZE = new LogicalSize(360, 624);
const AVATARS = ["🙂", "👩🏻‍💻", "👨🏽‍💻", "🧑🏼‍🎨", "🦊", "🚀"];

export default function FloatingWidget({ kind }: { kind: "camera" | "controls" }) {
  const [status, setStatus] = useState<WidgetStatus>({ active: false, paused: false, elapsed: 0, camera: false, cameraFilter: "original", avatar: AVATARS[0] });
  const [widgetElapsed, setWidgetElapsed] = useState(0);
  const [cameraDevices, setCameraDevices] = useState<Source[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [cameraLarge, setCameraLarge] = useState(false);
  const [bubbleBgColor, setBubbleBgColor] = useState(() => localStorage.getItem("camera-bubble-bg-color") || "#1A1A1A");
  const [bubbleBgImage, setBubbleBgImage] = useState("");
  const [bgReplacement, setBgReplacement] = useState(() => localStorage.getItem("camera-bg-replacement") === "true");
  const backgroundImageUrl = useRef<string | null>(null);
  const backgroundImageElement = useRef<HTMLImageElement | null>(null);
  const bubbleBgColorRef = useRef(bubbleBgColor);
  bubbleBgColorRef.current = bubbleBgColor;
  const backgroundSelectionRevision = useRef(0);
  const [ringColor, setRingColor] = useState(() => localStorage.getItem("camera-ring-color") || "#4C8DF1");
  const [ringThickness, setRingThickness] = useState(() => Number(localStorage.getItem("camera-ring-thickness")) || 4);
  const [cameraError, setCameraError] = useState("");
  const [backgroundStorageError, setBackgroundStorageError] = useState("");
  const settingsOpenRef = useRef(false);
  const shown = useRef(false);
  const settingsPositionOffsetX = useRef(0);
  const settingsPositionOffsetY = useRef(0);
  const settingsBubbleCenterX = useRef(0);
  const settingsBubbleCenterY = useRef(0);
  const statusRef = useRef(status);
  useEffect(() => { localStorage.setItem("camera-ring-color", ringColor); }, [ringColor]);
  useEffect(() => { localStorage.setItem("camera-ring-thickness", String(ringThickness)); }, [ringThickness]);
  useEffect(() => { localStorage.setItem("camera-bubble-bg-color", bubbleBgColor); }, [bubbleBgColor]);
  useEffect(() => { localStorage.setItem("camera-bg-replacement", String(bgReplacement)); }, [bgReplacement]);
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === "camera-ring-color" && event.newValue) setRingColor(event.newValue);
      if (event.key === "camera-ring-thickness" && event.newValue) setRingThickness(Number(event.newValue));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  const elapsedBase = useRef(0);
  const runStartedAt = useRef(0);
  const elapsedRef = useRef(0);
  const cameraPreview = useRef<HTMLVideoElement>(null);
  const segmentationCanvas = useRef<HTMLCanvasElement>(null);
  const [segmentationError, setSegmentationError] = useState("");
  const [segmentationReady, setSegmentationReady] = useState(false);
  const backgroundImageInput = useRef<HTMLInputElement>(null);
  const audioBars = useRef<HTMLSpanElement>(null);
  const widgetCameraStream = useRef<MediaStream | null>(null);
  const visibilityRevision = useRef(0);
  const visibilityQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!bubbleBgImage) {
      backgroundImageElement.current = null;
      return;
    }
    const image = new Image();
    let current = true;
    image.onload = () => { if (current) backgroundImageElement.current = image; };
    image.onerror = () => {
      if (current) {
        backgroundImageElement.current = null;
        setBackgroundStorageError("Background image could not be decoded. Using the selected color instead.");
      }
    };
    image.src = bubbleBgImage;
    return () => {
      current = false;
      if (backgroundImageElement.current === image) backgroundImageElement.current = null;
    };
  }, [bubbleBgImage]);

  useEffect(() => {
    if (kind !== "camera") return;
    let cancelled = false;
    const revision = backgroundSelectionRevision.current;
    void (async () => {
      let image = await readSetting<Blob>("camera-bubble-bg-image");
      const legacyImage = localStorage.getItem("camera-bubble-bg-image");
      if (cancelled || revision !== backgroundSelectionRevision.current) return;
      if (!image && legacyImage?.startsWith("data:image/")) {
        image = await fetch(legacyImage).then((response) => response.blob());
        await writeSetting("camera-bubble-bg-image", image);
        localStorage.removeItem("camera-bubble-bg-image");
      }
      if (cancelled || revision !== backgroundSelectionRevision.current || !image || !image.type.startsWith("image/")) return;
      const url = URL.createObjectURL(image);
      backgroundImageUrl.current = url;
      setBubbleBgImage(url);
    })().catch((cause) => {
      console.warn("Could not load the saved camera background", cause);
      if (!cancelled) setBackgroundStorageError("Saved background image could not be loaded.");
    });
    return () => {
      cancelled = true;
      if (backgroundImageUrl.current) URL.revokeObjectURL(backgroundImageUrl.current);
      backgroundImageUrl.current = null;
    };
  }, [kind]);

  const saveBackgroundImage = async (image: File | null) => {
    backgroundSelectionRevision.current += 1;
    if (backgroundImageUrl.current) URL.revokeObjectURL(backgroundImageUrl.current);
    backgroundImageUrl.current = image ? URL.createObjectURL(image) : null;
    setBubbleBgImage(backgroundImageUrl.current ?? "");
    setBackgroundStorageError("");
    try {
      await writeSetting("camera-bubble-bg-image", image);
      localStorage.removeItem("camera-bubble-bg-image");
    } catch (cause) {
      console.warn("Could not save the camera background", cause);
      setBackgroundStorageError("Background image could not be saved. Try another image or GIF.");
    }
  };

  useEffect(() => {
    document.documentElement.classList.add("widget-document");
    document.body.classList.add("widget-body");
    const current = getCurrentWindow();
    if (kind !== "camera") void current.setContentProtected(true).catch((cause) => console.warn("Could not protect widget from capture", cause));
    let unlistenStatus: (() => void) | undefined;
    let unlistenMoved: (() => void) | undefined;
    let unlistenAnnotation: (() => void) | undefined;
    const updateVisibility = (next: WidgetStatus) => {
      const revision = ++visibilityRevision.current;
      const shouldShow = kind === "controls"
        ? next.active
        : next.active && (next.bubble ?? next.camera);
      visibilityQueue.current = visibilityQueue.current.catch(() => undefined).then(async () => {
        if (revision !== visibilityRevision.current) return;
        try {
          shown.current = await current.isVisible();
          if (shouldShow && !shown.current) { await current.show(); shown.current = true; }
          else if (!shouldShow && shown.current) { await current.hide(); shown.current = false; }
        } catch (cause) { console.warn(`Could not ${shouldShow ? "show" : "hide"} widget`, cause); }
      });
    };
    void listen<WidgetStatus>("recodex:widget-status", (event) => {
      const next = event.payload;
      if (typeof next.microphoneLevel === "number" && Object.keys(next).length === 1) {
        const level = Math.max(0, Math.min(1, next.microphoneLevel));
        audioBars.current?.querySelectorAll("i").forEach((bar, index) => {
          const base = [0.45, 0.72, 1, 0.65, 0.38][index] ?? 0.5;
          (bar as HTMLElement).style.transform = `scaleY(${Math.max(.12, Math.min(1, base * (0.2 + level * 2.2)))})`;
        });
        return;
      }
      const previous = statusRef.current;
      if (next.active && next.recording && !previous.recording) {
        elapsedBase.current = next.elapsed;
        elapsedRef.current = next.elapsed;
        setWidgetElapsed(next.elapsed);
        runStartedAt.current = Date.now();
      } else if (next.active && !previous.active) {
        elapsedBase.current = next.elapsed;
        elapsedRef.current = next.elapsed;
        setWidgetElapsed(next.elapsed);
        runStartedAt.current = Date.now();
      } else if (next.active && next.paused && !previous.paused) {
        elapsedBase.current = Math.max(elapsedRef.current, next.elapsed);
        elapsedRef.current = elapsedBase.current;
        setWidgetElapsed(elapsedBase.current);
      } else if (next.active && !next.paused && previous.paused) {
        elapsedBase.current = Math.max(elapsedRef.current, next.elapsed);
        runStartedAt.current = Date.now();
      } else if (!next.active) {
        elapsedBase.current = 0;
        elapsedRef.current = 0;
        setWidgetElapsed(0);
      }
      const currentBubbleRevision = previous.bubbleRevision ?? 0;
      const acceptsBubbleState = next.bubbleRevision === undefined || next.bubbleRevision >= currentBubbleRevision;
      const merged = {
        ...previous,
        ...next,
        saving: next.saving ?? (next.recording === false || next.active === false ? false : previous.saving),
        savingStage: next.saving === false ? undefined : next.savingStage ?? previous.savingStage,
        bubble: acceptsBubbleState ? next.bubble ?? previous.bubble : previous.bubble,
        camera: acceptsBubbleState ? next.camera ?? previous.camera : previous.camera,
        bubbleRevision: Math.max(currentBubbleRevision, next.bubbleRevision ?? 0),
        cameraFilter: next.cameraFilter ?? previous.cameraFilter ?? "original",
        cameraBlur: next.cameraBlur ?? previous.cameraBlur ?? false,
        avatar: next.avatar ?? previous.avatar ?? AVATARS[0],
      };
      statusRef.current = merged;
      setStatus(merged);
      updateVisibility(merged);
    }).then((stop) => { unlistenStatus = stop; }).catch((cause) => console.warn("Could not listen for widget status", cause));
    const label = kind === "camera" ? "camera-bubble" : "recording-controls";
    void current.onMoved(({ payload }) => {
      void current.scaleFactor().then((scale) => {
        if (kind === "camera" && settingsOpenRef.current) {
          settingsBubbleCenterX.current = payload.x + Math.round(120 * scale) + settingsPositionOffsetX.current;
          settingsBubbleCenterY.current = payload.y + Math.round(106 * scale) + settingsPositionOffsetY.current;
        }
        return emitTo("recording-setup", "recodex:widget-moved", { label, x: payload.x + (kind === "camera" && settingsOpenRef.current ? settingsPositionOffsetX.current : 0), y: payload.y + (kind === "camera" && settingsOpenRef.current ? settingsPositionOffsetY.current : 0) });
      }).catch(() => undefined);
    }).then((stop) => { unlistenMoved = stop; }).catch((cause) => console.warn("Could not persist widget position", cause));
    if (kind === "controls") void listen<{ tool: AnnotationTool }>("recodex:annotation-state", (event) => setActiveTool(event.payload.tool))
      .then((stop) => { unlistenAnnotation = stop; }).catch((cause) => console.warn("Could not sync annotation tools", cause));
    return () => {
      unlistenStatus?.(); unlistenMoved?.(); unlistenAnnotation?.();
      document.documentElement.classList.remove("widget-document"); document.body.classList.remove("widget-body");
    };
  }, [kind]);

  useEffect(() => {
    if (kind !== "camera" || !bgReplacement || !status.camera || !status.active) {
      setSegmentationError("");
      setSegmentationReady(false);
      return;
    }
    let segmenter: import("@mediapipe/tasks-vision").ImageSegmenter | null = null;
    let raf = 0;
    let cancelled = false;
    let lastVideoTime = -1;
    const output = segmentationCanvas.current;
    const video = cameraPreview.current;
    if (!output || !video) return;
    const outputContext = output.getContext("2d");
    if (!outputContext) return;

    const input = document.createElement("canvas");
    input.width = 256;
    input.height = 256;
    const inputContext = input.getContext("2d");
    const personCanvas = document.createElement("canvas");
    personCanvas.width = 256;
    personCanvas.height = 256;
    const personContext = personCanvas.getContext("2d");
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = 256;
    maskCanvas.height = 256;
    const maskContext = maskCanvas.getContext("2d");
    if (!inputContext || !personContext || !maskContext) return;
    const maskImage = maskContext.createImageData(256, 256);
    output.width = 256;
    output.height = 256;
    setSegmentationError("");
    setSegmentationReady(false);

    const drawCameraCover = (context: CanvasRenderingContext2D) => {
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      const scale = Math.max(256 / sourceWidth, 256 / sourceHeight);
      const cropWidth = 256 / scale;
      const cropHeight = 256 / scale;
      const cropX = (sourceWidth - cropWidth) / 2;
      const cropY = (sourceHeight - cropHeight) / 2;
      context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, 256, 256);
    };

    const initialize = async () => {
      try {
        const { ImageSegmenter, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/mediapipe/models/selfie_segmenter.tflite" },
          runningMode: "VIDEO",
          outputCategoryMask: true,
          outputConfidenceMasks: true,
        });
        if (cancelled) {
          segmenter.close();
          return;
        }

        const renderFrame = () => {
          if (cancelled) return;
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0 || video.currentTime === lastVideoTime) {
            raf = requestAnimationFrame(renderFrame);
            return;
          }
          lastVideoTime = video.currentTime;
          try {
            drawCameraCover(inputContext);
            const result = segmenter?.segmentForVideo(input, performance.now());
            const confidenceMasks = result?.confidenceMasks ?? [];
            const confidenceMask = confidenceMasks.length === 1 ? confidenceMasks[0] : confidenceMasks[1];
            const categoryMask = result?.categoryMask;
            if (!confidenceMask && !categoryMask) throw new Error("MediaPipe returned no person mask.");
            const values = confidenceMask?.getAsFloat32Array();
            const categories = values ? null : categoryMask?.getAsUint8Array();
            const maskWidth = confidenceMask?.width ?? categoryMask?.width ?? 256;
            const maskHeight = confidenceMask?.height ?? categoryMask?.height ?? 256;
            for (let y = 0; y < 256; y += 1) {
              for (let x = 0; x < 256; x += 1) {
                const sourceX = Math.min(maskWidth - 1, Math.floor((x / 256) * maskWidth));
                const sourceY = Math.min(maskHeight - 1, Math.floor((y / 256) * maskHeight));
                const sourceIndex = sourceY * maskWidth + sourceX;
                const alpha = values
                  ? Math.round(Math.max(0, Math.min(1, (values[sourceIndex] - 0.12) / 0.58)) * 255)
                  : categories?.[sourceIndex] === 1 ? 255 : 0;
                const targetIndex = (y * 256 + x) * 4;
                maskImage.data[targetIndex] = 255;
                maskImage.data[targetIndex + 1] = 255;
                maskImage.data[targetIndex + 2] = 255;
                maskImage.data[targetIndex + 3] = alpha;
              }
            }
            maskContext.putImageData(maskImage, 0, 0);
            personContext.clearRect(0, 0, 256, 256);
            personContext.drawImage(input, 0, 0);
            personContext.globalCompositeOperation = "destination-in";
            personContext.drawImage(maskCanvas, 0, 0);
            personContext.globalCompositeOperation = "source-over";
            outputContext.clearRect(0, 0, 256, 256);
            const background = backgroundImageElement.current;
            if (background?.complete && background.naturalWidth > 0 && background.naturalHeight > 0) {
              const scale = Math.max(256 / background.naturalWidth, 256 / background.naturalHeight);
              const cropWidth = 256 / scale;
              const cropHeight = 256 / scale;
              const cropX = (background.naturalWidth - cropWidth) / 2;
              const cropY = (background.naturalHeight - cropHeight) / 2;
              outputContext.drawImage(background, cropX, cropY, cropWidth, cropHeight, 0, 0, 256, 256);
            } else {
              outputContext.fillStyle = bubbleBgColorRef.current;
              outputContext.fillRect(0, 0, 256, 256);
            }
            outputContext.drawImage(personCanvas, 0, 0);
            setSegmentationReady(true);
          } catch (cause) {
            console.error("Camera background segmentation failed", cause);
            segmenter?.close();
            segmenter = null;
            setSegmentationError("Background replacement is unavailable. Showing the original camera.");
            setSegmentationReady(false);
            return;
          }
          raf = requestAnimationFrame(renderFrame);
        };
        raf = requestAnimationFrame(renderFrame);
      } catch (cause) {
        console.error("Could not initialize camera background replacement", cause);
        if (!cancelled) {
          setSegmentationError("Background replacement is unavailable. Showing the original camera.");
          setSegmentationReady(false);
        }
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      segmenter?.close();
    };
  }, [kind, bgReplacement, status.camera, status.active]);

  useEffect(() => {
    if (kind !== "camera" || !status.active || !status.camera) return;
    let cancelled = false;
    const video = cameraPreview.current;
    const videoConstraints: MediaTrackConstraints = status.cameraDeviceId ? { deviceId: { exact: status.cameraDeviceId }, width: 640, height: 640 } : { width: 640, height: 640 };
    setCameraError("");
    void navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false }).then(async (stream) => {
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      widgetCameraStream.current = stream;
      if (video) { video.srcObject = stream; await video.play().catch(() => undefined); }
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!cancelled) setCameraDevices(devices.filter((device) => device.kind === "videoinput").map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Camera ${index + 1}` })));
    }).catch((cause) => {
      console.warn("Could not start the floating camera preview", cause);
      setCameraError("Camera preview unavailable. Check camera access in System Settings.");
      const next = { ...statusRef.current, camera: false };
      statusRef.current = next;
      setStatus(next);
      void emitTo("recording-setup", "recodex:camera-settings", { camera: false }).catch(() => undefined);
    });
    return () => {
      cancelled = true;
      widgetCameraStream.current?.getTracks().forEach((track) => track.stop());
      widgetCameraStream.current = null;
      if (video) video.srcObject = null;
    };
  }, [kind, status.active, status.camera, status.cameraDeviceId]);

  useEffect(() => {
    if (kind !== "controls" || !status.active || !status.recording || status.paused || status.saving) return;
    const tick = () => {
      const current = elapsedBase.current + Math.floor((Date.now() - runStartedAt.current) / 1000);
      elapsedRef.current = current;
      setWidgetElapsed(current);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [kind, status.active, status.recording, status.paused, status.saving]);

  const sendAction = (action: "pause" | "stop" | "home" | "microphone" | "bubble" | "new" | "close") => {
    if (statusRef.current.saving) return;
    if (action === "stop" && kind === "controls") {
      if (!statusRef.current.ready) return;
      const next = { ...statusRef.current, saving: true, savingStage: "finalizing" as const };
      statusRef.current = next;
      setStatus(next);
    }
    if (action === "bubble") {
      const nextBubble = !statusRef.current.bubble;
      const next = { ...statusRef.current, bubble: nextBubble, camera: nextBubble ? statusRef.current.camera : false };
      statusRef.current = next;
      setStatus(next);
      void WebviewWindow.getByLabel("camera-bubble").then((window: any) => {
        if (nextBubble) void window?.show().catch(() => undefined);
        else void window?.hide().catch(() => undefined);
      }).catch(() => undefined);
    }
    void emitTo("recording-setup", "recodex:widget-action", { action });
  };
  const [activeTool, setActiveTool] = useState<AnnotationTool>("cursor");
  const toggleAnnotation = async (tool: AnnotationTool) => {
    if (!status.screen || tool === "off") return;
    const nextTool: AnnotationTool = tool === "cursor" || activeTool === tool ? "cursor" : tool;
    setActiveTool(nextTool);
    try {
      if (nextTool === "cursor") await emitTo("recording-setup", "recodex:annotation-request", { tool: nextTool });
      else {
        await emitTo("annotation-overlay", "recodex:annotation-tool", { tool: nextTool }).catch(() => undefined);
        await emitTo("recording-setup", "recodex:annotation-request", { tool: nextTool });
      }
    } catch (cause) { console.warn("Could not activate annotation tool", cause); }
  };
  const beginDrag = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, select, input, [data-no-drag='true']")) return;
    void getCurrentWindow().startDragging().catch((cause) => console.warn("Could not move floating widget", cause));
  };
  const updateCameraSetting = (patch: Partial<Pick<WidgetStatus, "camera" | "cameraDeviceId" | "cameraFilter" | "cameraBlur" | "avatar">>) => {
    const next = { ...statusRef.current, ...patch };
    statusRef.current = next;
    setStatus(next);
    const { camera, cameraDeviceId } = patch;
    if (camera !== undefined || cameraDeviceId !== undefined) {
      void emitTo("recording-setup", "recodex:camera-settings", { camera, cameraDeviceId });
    }
  };
  const toggleSettings = async () => {
    const current = getCurrentWindow();
    try {
      const scale = await current.scaleFactor();
      if (!settingsOpen) {
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setCameraDevices(devices.filter((device) => device.kind === "videoinput").map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Camera ${index + 1}` })));
        const position = await current.outerPosition();
        const monitors = await availableMonitors();
        const centerX = position.x + Math.round(120 * scale);
        const centerY = position.y + Math.round(106 * scale);
        const monitor = monitors.find((item) => centerX >= item.position.x && centerX <= item.position.x + item.size.width && centerY >= item.position.y && centerY <= item.position.y + item.size.height);
        const workArea = monitor?.workArea;
        const width = CAMERA_SETTINGS_SIZE.width * scale;
        const height = Math.min(CAMERA_SETTINGS_SIZE.height, (workArea?.size.height ?? CAMERA_SETTINGS_SIZE.height * scale) / scale) * scale;
        const desiredY = position.y;
        const desiredX = centerX - Math.round(width / 2);
        const x = workArea ? Math.max(workArea.position.x, Math.min(desiredX, workArea.position.x + workArea.size.width - width)) : desiredX;
        const y = workArea ? Math.max(workArea.position.y, Math.min(desiredY, workArea.position.y + workArea.size.height - height)) : desiredY;
        const frameLeft = (centerX - x) / scale - 98;
        const frameTop = (centerY - y) / scale - 98;
        const belowSpace = workArea ? (workArea.position.y + workArea.size.height - centerY) / scale - 143 : height / scale - frameTop - 247;
        const aboveSpace = frameTop - 8;
        const panelBelow = belowSpace >= 180 || aboveSpace < 180;
        const panelMaxHeight = Math.max(120, Math.min(365, panelBelow ? belowSpace : aboveSpace));
        const panelTop = panelBelow ? frameTop + 247 : Math.max(0, frameTop - panelMaxHeight - 8);
        document.documentElement.style.setProperty("--camera-settings-panel-max-height", `${panelMaxHeight}px`);
        document.documentElement.style.setProperty("--camera-settings-panel-top", `${panelTop}px`);
        document.documentElement.style.setProperty("--camera-settings-panel-large-top", `${panelTop + (panelBelow ? 20 : 0)}px`);
        document.documentElement.style.setProperty("--camera-settings-frame-left", `${frameLeft}px`);
        document.documentElement.style.setProperty("--camera-settings-frame-top", `${frameTop}px`);
        document.documentElement.style.setProperty("--camera-settings-area-height", `${frameTop + 252}px`);
        document.documentElement.style.setProperty("--camera-settings-controls-top", `${frameTop + 211}px`);
        document.documentElement.style.setProperty("--camera-settings-panel-left", `${Math.max(0, Math.min(14, CAMERA_SETTINGS_SIZE.width - 346))}px`);
        settingsPositionOffsetX.current = centerX - x - Math.round((CAMERA_CLOSED_SIZE.width / 2) * scale);
        settingsPositionOffsetY.current = centerY - y - Math.round(106 * scale);
        settingsBubbleCenterX.current = centerX;
        settingsBubbleCenterY.current = centerY;
        settingsOpenRef.current = true;
        await current.setSize(new LogicalSize(CAMERA_SETTINGS_SIZE.width, height / scale));
        await current.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));
        setSettingsOpen(true);
      } else {
        settingsOpenRef.current = false;
        await current.setSize(CAMERA_CLOSED_SIZE);
        const closedDesiredX = settingsBubbleCenterX.current - Math.round((CAMERA_CLOSED_SIZE.width / 2) * scale);
        const closedDesiredY = settingsBubbleCenterY.current - Math.round(106 * scale);
        await current.setPosition(new PhysicalPosition(closedDesiredX, closedDesiredY));
        ["--camera-settings-panel-max-height", "--camera-settings-panel-top", "--camera-settings-panel-large-top", "--camera-settings-frame-left", "--camera-settings-frame-top", "--camera-settings-area-height", "--camera-settings-controls-top", "--camera-settings-panel-left"].forEach((property) => document.documentElement.style.removeProperty(property));
        settingsPositionOffsetX.current = 0;
        settingsPositionOffsetY.current = 0;
        setSettingsOpen(false);
        setAvatarPickerOpen(false);
      }
    } catch (cause) { console.warn("Could not resize camera widget", cause); }
  };
  const changeCamera = (enabled: boolean) => {
    updateCameraSetting({ camera: enabled });
  };

  if (kind === "camera") {
    const filterClass = `camera-filter-${status.cameraFilter ?? "original"}`;
    const videoFilter = [status.cameraFilter === "warm" ? "sepia(.28) saturate(1.15)" : status.cameraFilter === "mono" ? "grayscale(1)" : "", status.cameraBlur ? "blur(2px)" : ""].filter(Boolean).join(" ") || "none";
    const avatar = status.avatar || AVATARS[0];
    return <div className={`floating-root camera-widget-root ${settingsOpen ? "camera-settings-open" : ""}`} onMouseDown={beginDrag}>
      <div className="camera-bubble-area">
        <div className={`camera-widget-frame ${filterClass} ${cameraLarge ? "camera-frame-large" : ""}`} data-tauri-drag-region="true" title="Drag to move camera" style={{ borderColor: ringColor, borderWidth: ringThickness, borderStyle: "solid", background: bubbleBgImage ? `url(${bubbleBgImage}) center/cover no-repeat` : bubbleBgColor }}>
          {bgReplacement && <canvas ref={segmentationCanvas} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: "50%", filter: videoFilter, opacity: segmentationReady && !segmentationError ? 1 : 0, zIndex: 1 }} />}
          {status.camera && status.active
            ? <video ref={cameraPreview} autoPlay playsInline muted style={{ filter: videoFilter, position: bgReplacement ? "absolute" : "relative", inset: bgReplacement ? 0 : undefined, width: "100%", height: "100%", opacity: bgReplacement && segmentationReady && !segmentationError ? 0 : 1, pointerEvents: "none", zIndex: bgReplacement ? 0 : undefined }} />
            : <div className="camera-widget-placeholder"><div className="camera-avatar">{avatar}</div><span>Camera off</span></div>}
          {status.camera && status.active && <span className="camera-widget-live"><i /> LIVE</span>}
          <button className="camera-resize-button" onClick={() => setCameraLarge((large) => !large)} aria-label={cameraLarge ? "Shrink camera bubble" : "Enlarge camera bubble"} title={cameraLarge ? "Shrink" : "Enlarge"}><Icon name={cameraLarge ? "shrink" : "expand"} size={14} /></button>
        </div>
        <div className="camera-bubble-actions" data-no-drag="true">
          <button className={`camera-action-button ${status.camera ? "" : "camera-action-muted"}`} onClick={() => changeCamera(!status.camera)} aria-label={status.camera ? "Turn off camera" : "Turn on camera"} title={status.camera ? "Turn off camera" : "Turn on camera"}><Icon name="camera" size={16} /></button>
          <button className="camera-action-button camera-settings-trigger" onClick={() => void toggleSettings()} aria-expanded={settingsOpen} aria-label={settingsOpen ? "Close camera settings" : "Open camera settings"} title="Camera settings"><Icon name={settingsOpen ? "close" : "chevronDown"} size={15} /></button>
        </div>
      </div>
      {settingsOpen && <section className="camera-settings-panel" aria-label="Camera settings" data-no-drag="true">
        <header className="camera-settings-header"><strong>Camera settings</strong><button onClick={() => void toggleSettings()} aria-label="Close camera settings"><Icon name="close" size={16} /></button></header>
        {(cameraError || segmentationError || backgroundStorageError) && <div className="camera-panel-error">{cameraError || segmentationError || backgroundStorageError}</div>}
        <label className="camera-device-select"><Icon name="camera" size={17} /><select aria-label="Choose camera" value={status.cameraDeviceId ?? ""} onChange={(event) => updateCameraSetting({ cameraDeviceId: event.target.value })}>
          {cameraDevices.length === 0 && <option value="">Camera unavailable</option>}
          {cameraDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
        </select><Icon name="chevronDown" size={15} /></label>
        <div className="camera-settings-divider" />
        <div className="camera-panel-section-heading"><span>Filter</span><small>{status.cameraFilter ?? "original"} selected</small></div>
        <div className="camera-filter-options">
          {(["original", "warm", "mono"] as CameraFilter[]).map((filter) => <button key={filter} className={`camera-filter-option ${filterClass === `camera-filter-${filter}` ? "selected" : ""}`} onClick={() => updateCameraSetting({ cameraFilter: filter })} aria-pressed={filterClass === `camera-filter-${filter}`}>
            <span className={`camera-filter-preview camera-filter-${filter}`}><span>{avatar}</span></span><small>{filter === "mono" ? "Mono" : filter === "warm" ? "Warm" : "Original"}</small>
          </button>)}
        </div>
        <div className="camera-settings-divider" />
        <div className="camera-blur-row"><div><strong>Blur background</strong><small>Apply a soft blur to the preview</small></div><button role="switch" aria-checked={Boolean(status.cameraBlur)} className={`camera-settings-switch ${status.cameraBlur ? "on" : ""}`} onClick={() => updateCameraSetting({ cameraBlur: !status.cameraBlur })}><i /></button></div>
        <div className="camera-settings-divider" />
        <div className="camera-panel-section-heading"><span>Ring color</span><small>{ringColor}</small></div>
        <div className="camera-ring-colors">
          {["#4C8DF1", "#E01A4F", "#10B981", "#F59E0B", "#8B5CF6", "#FFFFFF", "#000000", "#F2F2F2"].map((color) => <button key={color} className={`camera-ring-color ${ringColor === color ? "selected" : ""}`} style={{ background: color }} onClick={() => setRingColor(color)} aria-label={`Use ${color} ring color`} />)}
        </div>
        <div className="camera-settings-divider" />
        <div className="camera-ring-thickness-row"><div><strong>Ring thickness</strong><small>{ringThickness}px</small></div><input type="range" min={1} max={12} value={ringThickness} onChange={(event) => setRingThickness(Number(event.target.value))} aria-label="Ring thickness" /></div>
        <div className="camera-settings-divider" />
        <div className="camera-panel-section-heading"><span>Bubble background</span><small>{bubbleBgImage ? "Image" : bubbleBgColor}</small></div>
        <div className="camera-ring-colors">
          {["#1A1A1A", "#4C8DF1", "#E01A4F", "#10B981", "#F59E0B", "#FFFFFF"].map((color) => <button key={color} className={`camera-ring-color ${bubbleBgColor === color && !bubbleBgImage ? "selected" : ""}`} style={{ background: color }} onClick={() => { setBubbleBgColor(color); void saveBackgroundImage(null); }} aria-label={`Use ${color} background`} />)}
          <button className="camera-ring-color" style={{ background: "linear-gradient(135deg,#4C8DF1,#E01A4F)" }} onClick={() => backgroundImageInput.current?.click()} aria-label="Choose background image or GIF" />
          {bubbleBgImage && <button className="camera-ring-color" style={{ background: "#F2F2F2", color: "#1A1A1A", fontSize: 10 }} onClick={() => { void saveBackgroundImage(null); }} aria-label="Clear background image">✕</button>}
        </div>
        <input ref={backgroundImageInput} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void saveBackgroundImage(file); event.target.value = ""; }} />
        <div className="camera-settings-divider" />
        <div className="camera-blur-row"><div><strong>Background replacement</strong><small>Replace webcam background with selected backdrop</small></div><button role="switch" aria-checked={bgReplacement} className={`camera-settings-switch ${bgReplacement ? "on" : ""}`} onClick={() => setBgReplacement((value) => !value)}><i /></button></div>
        <div className="camera-settings-divider" />
        <button className="camera-avatar-option" onClick={() => setAvatarPickerOpen((open) => !open)} aria-expanded={avatarPickerOpen}><span className="camera-avatar-option-icon">{avatar}</span><span><strong>Choose avatar</strong><small>Use an avatar instead of video</small></span><Icon name="chevronRight" size={16} /></button>
        {avatarPickerOpen && <div className="camera-avatar-grid">{AVATARS.map((item) => <button key={item} className={avatar === item ? "selected" : ""} onClick={() => { updateCameraSetting({ avatar: item, camera: false }); setAvatarPickerOpen(false); }} aria-label={`Choose ${item} avatar`}>{item}</button>)}</div>}
        <div className="camera-settings-divider" />
        <button className={`camera-power-action ${status.camera ? "turn-off" : "turn-on"}`} onClick={() => changeCamera(!status.camera)}><Icon name={status.camera ? "cameraOff" : "camera"} size={17} />{status.camera ? "Turn off camera" : "Turn on camera"}</button>
      </section>}
    </div>;
  }

  return <div className="floating-root controls-widget-root" onMouseDown={beginDrag} title="Drag to move">
    <div className={`controls-widget ${status.saving ? "is-saving" : ""} ${status.preparing ? "is-preparing" : ""} ${status.recording ? "is-recording" : "is-idle"}`}>
      {status.saving ? <div className="widget-saving-state" role="status" aria-live="polite">
        <span className="saving-spinner" aria-hidden="true" />
        <div className="widget-saving-copy"><strong>{status.savingStage === "finalizing" ? "FINALIZING RECORDING" : "SAVING RECORDING"}</strong><small>{status.savingStage === "finalizing" ? "Please wait while the video is prepared" : "Please wait while your video is saved"}</small></div>
      </div> : status.preparing ? <div className="widget-preparing-state"><span className="widget-drag-grip" aria-hidden="true">⠿</span><span className="preparing-spinner" /><div><strong>Preparing your recording</strong><small>Get ready — starting soon</small></div></div> : status.recording ? <>
        <span className="widget-drag-grip" aria-hidden="true">⠿</span>
        <div className="widget-recording-label"><span className="widget-rec-dot" /><div><strong>REC</strong><small>{status.paused ? "Paused" : "Recording"}</small></div></div>
        <span className="widget-time glass-timer">{formatTime(widgetElapsed)}</span>
        <span className="widget-divider" />
        <button className="widget-control pause-widget" disabled={!status.ready} onClick={() => sendAction("pause")} aria-label={status.paused ? "Resume recording" : "Pause recording"} title={status.paused ? "Resume" : "Pause"}><Icon name={status.paused ? "play" : "pause"} size={16} /></button>
        <button className={`widget-control microphone-widget ${status.microphone ? "" : "is-muted"}`} disabled={!status.ready || !status.microphoneAvailable} onClick={() => sendAction("microphone")} aria-label={status.microphone ? "Mute microphone" : "Unmute microphone"} title={status.microphone ? "Mute microphone" : status.microphoneAvailable ? "Unmute microphone" : "Microphone was unavailable when recording started"}><Icon name={status.microphone ? "mic" : "micOff"} size={16} />{status.microphone && <span className="audio-level-bars" ref={audioBars} aria-hidden="true">{[0.45, 0.72, 1, 0.65, 0.38].map((_, index) => <i key={index} style={{ transform: "scaleY(.2)" }} />)}</span>}</button>
        <button className={`widget-control camera-bubble-toggle ${status.bubble ? "selected" : ""}`} onClick={() => sendAction("bubble")} aria-label={status.bubble ? "Hide camera bubble and turn off camera" : "Show camera bubble"} title={status.bubble ? "Hide camera bubble and turn off camera" : "Show camera bubble"}><Icon name={status.bubble ? "camera" : "cameraOff"} size={16} /></button>
        <button className={`widget-control tool-widget annotate-toggle ${activeTool !== "cursor" ? "selected" : ""}`} disabled={!status.screen} onClick={() => void toggleAnnotation(activeTool === "cursor" ? "pen" : "cursor")} aria-label={activeTool === "cursor" ? "Open annotation tools" : "Return to cursor mode"} title={activeTool === "cursor" ? "Annotate" : "Cursor mode"}><Icon name="pen" size={16} /></button>
        <button className="widget-control home-widget-button" onClick={() => sendAction("home")} aria-label="Open Recodex library" title="Open Recodex library"><Icon name="home" size={17} /></button>
        <button className="widget-control stop-widget" disabled={!status.ready} onClick={() => sendAction("stop")} aria-label="Stop recording" title="Stop recording"><Icon name="stop" size={14} /></button>
      </> : <>
        <span className="widget-drag-grip" aria-hidden="true">⠿</span>
        <div className="widget-ready-brand"><span className="widget-ready-mark"><Icon name="logo" size={19} /></span><div><strong>Ready when you are</strong><small>Local recording · private by design</small></div></div>
        <button className="widget-start-recording" onClick={() => sendAction("new")}><Icon name="plus" size={15} /> New recording</button>
        {status.screen && <span className="widget-divider" />}
        {status.screen && <button className={`widget-control camera-bubble-toggle ${status.bubble ? "selected" : ""}`} onClick={() => sendAction("bubble")} aria-label={status.bubble ? "Hide camera bubble and turn off camera" : "Show camera bubble"} title={status.bubble ? "Hide camera bubble and turn off camera" : "Show camera bubble"}><Icon name={status.bubble ? "camera" : "cameraOff"} size={16} /></button>}
        <button className="widget-control home-widget-button" onClick={() => sendAction("home")} aria-label="Open Recodex dashboard" title="Open Recodex dashboard"><Icon name="home" size={17} /></button>
        <button className="widget-control close-widget-button" onClick={() => sendAction("close")} aria-label="Close floating widgets" title="Close floating widgets"><Icon name="close" size={15} /></button>
      </>}
    </div>
  </div>;
}
