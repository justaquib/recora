# Handoff

Last updated: 2026-11-23

## Current state

- Docs reorganized into `docs/{architecture,design,development,project,rules}`.
- Agent instructions renamed from `CLAUDE.md` to `AGENTS.md` (universal).
- Frontend/backend code unchanged; native capture still needs live macOS acceptance (see PROJECT_STATUS).

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
- `src/services/recordingStorage.ts` — IndexedDB + disk persistence.
- `src-tauri/src/lib.rs` — Tauri commands.
- `src-tauri/src/native_recorder.swift` — ScreenCaptureKit recorder.

## Commands

- `npm run build`
- `cd src-tauri && cargo check`
- `swiftc -swift-version 5 -typecheck src-tauri/src/native_recorder.swift`
- `npm run tauri dev`
