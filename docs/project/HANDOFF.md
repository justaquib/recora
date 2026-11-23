# Handoff

Last updated: 2026-11-23

## Current state

- Docs reorganized into `docs/{architecture,design,development,project,rules}`.
- Agent instructions renamed from `CLAUDE.md` to `AGENTS.md` (universal).
- The library stores metadata in IndexedDB and media files on disk. Capture stages chunks in app-local `.temp`, then moves successful recordings into app-local `recordings` and copies them to the configured folder. Failed finalization retains recovery files.
- The default external save folder is `~/Documents/Recodex`; native save/export creates it on demand.
- Floating camera settings are clamped to monitor work areas; bubble visibility is explicitly applied to the camera window. Positions persist in the shared IndexedDB settings store; Zustand was not added because it would be local to each webview.
- After successful stop/save, controls stay open in an idle state with a New recording action; the camera bubble remains visible with its camera off. The microphone level meter and glass timer are wired into the control widget, and the setup window uses a transparent backdrop.
- The floating recorder has separate preparing, recording, saving, and idle layouts. Idle controls include a close action. Dashboard focus dismisses all floating windows, including countdown and annotation.
- Countdown now has its own transparent floating webview, positioned alongside the recorder and camera widgets during preparation; it can be skipped from that window.
- Capture failures in the setup window use a modal with a concise explanation, preserved recovery-file path, expandable diagnostics, and a copy-details action.
- Camera show/hide state carries a monotonic revision to reject delayed events. Annotation window transitions are serialized to avoid overlapping show/hide operations.
- Native MP4 finalization now waits up to 30 seconds for ScreenCaptureKit's finish callback before checking file stability or duration; the prior 2-second wait silently continued on timeout and could inspect an incomplete segment.
- Native capture still needs live macOS acceptance (see PROJECT_STATUS).

## Open blockers

- P0: live ScreenCaptureKit capture acceptance (playable duration, audio, pause/resume, stop, save, playback).
- P1: camera bubble not composited into screen videos.
- P1: end-to-end capture behavior unverified.
- P1: bubble anchoring at monitor edges, microphone meter responsiveness, and post-stop restart flow need live macOS acceptance.
- P0: validate a 45–60 second ScreenCaptureKit recording after the finalization callback change; the recovery file from the latest report contains only about 9 seconds of playable media.

## Next steps

1. Live-verify native capture (10s/45s, with/without mic, minimized dashboard).
2. Compose camera into saved video if required.
3. Extract capture/session lifecycle from `RecordingSetupWindow`.
4. Add lifecycle-focused validation and package the actual app bundle.

## Key files

- `src/App.tsx` — webview selection.
- `src/features/recording/RecordingSetupWindow.tsx` — capture owner.
- `src/features/recording/recordingEvents.ts` — cross-webview contract.
- `src/services/recordingStorage.ts` — metadata in IndexedDB, media file staging and migration.
- `src-tauri/src/lib.rs` — Tauri commands.
- `src-tauri/src/native_recorder.swift` — ScreenCaptureKit recorder.

## Commands

- `npm run build`
- `cd src-tauri && cargo check`
- `swiftc -swift-version 5 -typecheck src-tauri/src/native_recorder.swift`
- `npm run tauri dev`
