import { invoke } from "@tauri-apps/api/core";
import type { VideoItem } from "../shared/types";

const DB_NAME = "recora-library";
const STORE_NAME = "recordings";
const SETTINGS_STORE = "settings";

export function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 4);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
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

export async function createTemporaryRecordingFile(suggestedName: string): Promise<string> {
  return invoke<string>("create_temporary_recording_file", { suggestedName });
}

export async function appendBlobToTemporaryFile(path: string, blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = Array.from(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
    await invoke("append_temporary_recording_chunk", { path, bytes: chunk });
  }
}

export async function finalizeTemporaryRecordingFile(path: string, suggestedName: string): Promise<string> {
  return invoke<string>("finalize_temporary_recording_file", { path, suggestedName });
}

export async function importRecordingFile(sourcePath: string, suggestedName: string): Promise<string> {
  return invoke<string>("import_recording_file", { sourcePath, suggestedName });
}

export async function copyRecordingFile(sourcePath: string, suggestedName: string, directory: string | null): Promise<string> {
  return invoke<string>("copy_recording_file", { sourcePath, suggestedName, directory });
}

export async function readRecordingBlob(path: string, mimeType: string): Promise<Blob> {
  const bytes = await invoke<number[]>("read_recording_file", { path });
  return new Blob([Uint8Array.from(bytes)], { type: mimeType });
}

export async function readRecordingFileSize(path: string): Promise<number> {
  return invoke<number>("recording_file_size", { path });
}

export async function readVideos(): Promise<VideoItem[]> {
  const db = await openLibrary();
  const records = await new Promise<VideoItem[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as VideoItem[]);
    request.onerror = () => reject(request.error);
  });
  const migrated = await Promise.all(records.map(async (video) => {
    const legacyBlob = video.blob;
    let filePath = video.filePath;
    let filePaths = video.filePaths ?? (filePath ? [filePath] : []);
    if (filePath) {
      const extension = (video.mimeType || "video/mp4").includes("mp4") ? "mp4" : "webm";
      try {
        const originalPath = filePath;
        filePath = await importRecordingFile(originalPath, `${video.title}.${extension}`);
        filePaths = [...new Set([...filePaths, filePath])];
      } catch (cause) {
        if (legacyBlob) filePath = undefined;
        else console.warn("Could not migrate an existing recording into app storage", cause);
      }
    }
    if (!filePath && legacyBlob) {
      const extension = (video.mimeType || legacyBlob.type).includes("mp4") ? "mp4" : "webm";
      const temporaryPath = await createTemporaryRecordingFile(`${video.title}.${extension}`);
      await appendBlobToTemporaryFile(temporaryPath, legacyBlob);
      filePath = await finalizeTemporaryRecordingFile(temporaryPath, `${video.title}.${extension}`);
      filePaths = [filePath];
    }
    if (!filePath) throw new Error(`Recording "${video.title}" has no saved media file.`);
    const sizeBytes = video.sizeBytes ?? legacyBlob?.size ?? await readRecordingFileSize(filePath).catch(() => 0);
    const { blob: _legacyBlob, ...metadata } = video;
    const migratedVideo = { ...metadata, filePath, filePaths, sizeBytes };
    await putVideo(migratedVideo);
    return migratedVideo;
  }));
  return migrated.sort((a, b) => b.createdAt - a.createdAt);
}

export async function putVideo(video: VideoItem): Promise<void> {
  const db = await openLibrary();
  const { blob, ...metadata } = video;
  const record = { ...metadata, sizeBytes: video.sizeBytes ?? blob?.size ?? 0 };
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function removeVideo(id: string): Promise<void> {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
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
