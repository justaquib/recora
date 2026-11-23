# Handoff

Last updated: 2026-11-23

## Current state

- Docs reorganized into `docs/{architecture,design,development,project,rules}`.
- Agent instructions renamed from `CLAUDE.md` to `AGENTS.md` (universal).
- The library stores metadata in IndexedDB and media files on disk. Capture stages chunks in app-local `.temp`, then moves successful recordings into app-local `recordings` and copies them to the configured folder. Failed finalization retains recovery files.
- The default external save folder is `~/Documents/Recora`; native save/export creates it on demand.
- Floating camera settings are clamped to monitor work areas; bubble visibility is explicitly applied to the camera window. Positions persist in the shared IndexedDB settings store; Zustand was not added because it would be local to each webview.
- Native capture still needs live macOS acceptance (see PROJECT_STATUS).

## Open blockers

- P0: live ScreenCaptureKit capture acceptance (playable duration, audio, pause/resume, stop, save, playback).
- P1: camera bubble not composited into screen videos.
- P1: end-to-end capture behavior unverified.

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
