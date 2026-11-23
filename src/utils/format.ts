export function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(size)} ${units[unit]}`;
}
export function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(timestamp);
}
export function friendlyError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "Permission was denied. Allow access in System Settings, then try again.";
  if (error instanceof DOMException && error.name === "NotFoundError") return "No matching camera or microphone was found. Check your connected devices.";
  if (error instanceof DOMException && error.name === "NotReadableError") return "That device is being used by another app. Close it there and try again.";
  if (typeof error === "string" && error.trim()) return error;
  return error instanceof Error ? error.message : "Something went wrong while starting your recording.";
}

