# Recora architecture

## Overview

Recora is a Tauri desktop app: a React/TypeScript frontend rendered in multiple webviews, backed by a Rust/Tauri core and a native macOS ScreenCaptureKit recorder (Swift).

## Webview model

The query parameter `?widget=...` selects which React tree is mounted (`src/App.tsx`):

| `widget` | Component | Purpose |
| --- | --- | --- |
| (none) | `MainApp` | Library, save folder, launch recording |
| `setup` | `RecordingSetupWindow` | Capture setup and lifecycle owner |
| `camera` / `controls` | `FloatingWidget` | Floating camera bubble and recorder controls |
| `annotations` | `AnnotationWidget` | Annotation overlay |

Each webview has its own JS runtime. Live coordination happens through Tauri events; durable preferences such as widget positions use the shared IndexedDB settings store. A Zustand store would be local to each webview, so it is not used for cross-window persistence.

After successful recording finalization, the recorder controls remain visible in an idle state and can reopen setup for another capture. The camera bubble stays visible with its camera off. During capture, the setup webview meters microphone input and sends level values to the controls webview; the timer is driven by recording state and appears after the widgets are shown.

## Frontend layers

- `src/pages/` — page composition only.
- `src/components/` — reusable UI.
- `src/features/recording/` — capture setup webview and event protocol.
- `src/services/` — recording metadata in IndexedDB and media files on disk.
- `src/shared/` — domain types.
- `src/utils/` — formatting and error helpers.
- `src/widgets/` — floating windows.

## Native boundary

Tauri commands live in `src-tauri/src/lib.rs`. Screen capture on macOS is implemented in `src-tauri/src/native_recorder.swift` (ScreenCaptureKit + AVFoundation/SCRecordingOutput). Only the desktop boundary may call Tauri APIs; UI components must not own capture, persistence, or export logic.

## Data

- IndexedDB (`recora-library`, v4): recording metadata and preferences only. Older records with media blobs migrate to disk on library load.
- Recording media is written to the app-local `.temp` directory while capturing, merged/finalized on disk, then moved into the app-local `recordings` directory. Successful finalization removes the `.temp` file and native segment files; failed finalization keeps recovery files. A copy is placed in the configured save folder. The library stores file paths and metadata, never the media bytes.
- Save folder preference is stored in `settings`.
- When no folder is selected, the app copies finalized recordings to `~/Documents/Recora`, creating the directory when needed.

## Rules

- Keep the main window focused on library and save-folder preferences.
- Keep capture lifecycle in the recorder feature webview.
- Keep cross-webview messages typed and centralized.
- Persist capture chunks to the app-local temporary file before finalization. Do not store video blobs in IndexedDB.
- Update `docs/project/PROJECT_STATUS.md` when status changes.
