/** Event names shared by the dashboard and the always-visible recorder webview. */
export const recordingEvents = {
  libraryChanged: "recodex:library-changed",
  setupConfig: "recodex:setup-config",
  recordingPreferences: "recodex:recording-preferences",
  countdownState: "recodex:countdown-state",
  countdownSkip: "recodex:countdown-skip",
} as const;
