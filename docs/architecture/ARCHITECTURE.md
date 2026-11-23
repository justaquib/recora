# Recora architecture

## Overview

Recora is a Tauri desktop app: a React/TypeScript frontend rendered in multiple webviews, backed by a Rust/Tauri core and a native macOS ScreenCaptureKit recorder (Swift).

## Webview model

The query parameter `?widget=...` selects which React tree is mounted (`src/App.tsx`):

| `widget` | Component | Purpose |
| --- | --- | --- |
| (none) | `MainApp` | Library, save folder, launch recording |
| `setup` | `RecordingSetupWindow` | Capture setup and lifecycle owner |
| `camera` / `controls` / `home` | `FloatingWidget` | Floating camera bubble, recorder controls, home button |
| `annotations` | `AnnotationWidget` | Annotation overlay |

Each webview has its own JS runtime. Cross-window state is not shared via React/Zustand; coordination happens through Tauri events and the typed protocol in `src/features/recording/recordingEvents.ts`.

## Frontend layers

- `src/pages/` — page composition only.
- `src/components/` — reusable UI.
- `src/features/recording/` — capture setup webview and event protocol.
- `src/services/` — IndexedDB and native file persistence.
- `src/shared/` — domain types.
- `src/utils/` — formatting and error helpers.
- `src/widgets/` — floating windows.

## Native boundary

Tauri commands live in `src-tauri/src/lib.rs`. Screen capture on macOS is implemented in `src-tauri/src/native_recorder.swift` (ScreenCaptureKit + AVFoundation/SCRecordingOutput). Only the desktop boundary may call Tauri APIs; UI components must not own capture, persistence, or export logic.

## Data

- IndexedDB (`recora-library`, v3): `recordings`, `capture-sessions`, `settings`.
- Recordings are persisted to disk via `create_recording_file` / `write_recording_chunk`.
- Save folder preference is stored in `settings`.

## Rules

- Keep the main window focused on library and save-folder preferences.
- Keep capture lifecycle in the recorder feature webview.
- Keep cross-webview messages typed and centralized.
- Persist the recording blob locally before writing the configured folder.
- Update `docs/project/PROJECT_STATUS.md` when status changes.
