/** Event names shared by the dashboard and the always-visible recorder webview. */
export const recordingEvents = {
  libraryChanged: "recora:library-changed",
  setupConfig: "recora:setup-config",
  countdownState: "recora:countdown-state",
  countdownSkip: "recora:countdown-skip",
} as const;
