import { readRecordingBlob } from "../services/recordingStorage";

export async function generateVideoThumbnail(path: string, mimeType: string): Promise<string> {
  if (!path) return "";
  try {
    const blob = await readRecordingBlob(path, mimeType || "video/mp4");
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video load failed"));
    });
    const seekTime = Number.isFinite(video.duration) && video.duration > 1 ? Math.min(video.duration / 2, 5) : 0.5;
    video.currentTime = seekTime;
    await new Promise<void>((resolve) => { video.onseeked = () => window.setTimeout(resolve, 120); });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(url);
      return "";
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    URL.revokeObjectURL(url);
    return dataUrl;
  } catch {
    return "";
  }
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
