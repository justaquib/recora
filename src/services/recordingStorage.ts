import { invoke } from "@tauri-apps/api/core";
import type { VideoItem } from "../shared/types";

const DB_NAME = "recora-library";
const STORE_NAME = "recordings";
const CAPTURE_STORE = "capture-sessions";
const SETTINGS_STORE = "settings";

export function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains(CAPTURE_STORE)) request.result.createObjectStore(CAPTURE_STORE, { keyPath: "sessionId" });
      if (!request.result.objectStoreNames.contains(SETTINGS_STORE)) request.result.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readSetting<T>(key: string): Promise<T | undefined> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get(key);
    request.onsuccess = () => resolve(request.result?.value as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SETTINGS_STORE, "readwrite").objectStore(SETTINGS_STORE).put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export type CaptureSession = { sessionId: string; blob: Blob; mimeType: string };
export async function putCaptureSession(session: CaptureSession) {
  const db = await openLibrary();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(CAPTURE_STORE, "readwrite").objectStore(CAPTURE_STORE).put(session);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
}
export async function takeCaptureSession(sessionId: string): Promise<CaptureSession | undefined> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CAPTURE_STORE, "readwrite");
    const store = transaction.objectStore(CAPTURE_STORE);
    const request = store.get(sessionId);
    request.onsuccess = () => {
      const session = request.result as CaptureSession | undefined;
      if (session) store.delete(sessionId);
      resolve(session);
    };
    request.onerror = () => reject(request.error);
  });
}

export function waitForIce(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, 5000);
    function done() {
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onState);
      resolve();
    }
    function onState() { if (peer.iceGatheringState === "complete") done(); }
    peer.addEventListener("icegatheringstatechange", onState);
  });
}

export async function readVideos(): Promise<VideoItem[]> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as VideoItem[]).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
}

export async function putVideo(video: VideoItem) {
  const db = await openLibrary();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(video);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function removeVideo(id: string) {
  const db = await openLibrary();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function saveBlobToDisk(blob: Blob, suggestedName: string, directory: string | null): Promise<string> {
  const path = await invoke<string>("create_recording_file", { directory, suggestedName });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 256 * 1024;
  try {
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = Array.from(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
      await invoke("write_recording_chunk", { path, bytes: chunk, firstChunk: offset === 0 });
    }
    if (bytes.length === 0) await invoke("write_recording_chunk", { path, bytes: [], firstChunk: true });
    return path;
  } catch (error) {
    throw error instanceof Error ? error : new Error("Could not write the selected recording file.");
  }
}

export function readBlobDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(duration !== null && Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null);
    };
    const timeout = window.setTimeout(() => finish(null), 5000);
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(video.duration);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

