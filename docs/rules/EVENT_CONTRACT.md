# Event contract

Cross-webview messages are typed and centralized. Do not add ad-hoc event names.

## Events (`src/features/recording/recordingEvents.ts`)

| Event | Payload | Purpose |
| --- | --- | --- |
| `recora:library-changed` | none | Notify main window that recordings changed |
| `recora:setup-config` | setup config | Configure the recording setup webview |

## Widget status

`WidgetStatus` (in `src/shared/types.ts`) is the shared shape for floating widget state: active, ready, paused, elapsed, camera, saving, screen, bubble.

## Native commands

Tauri commands exposed by `src-tauri/src/lib.rs`:

- `native_capture_choose_source`
- `native_capture_start(path, microphone)`
- `native_capture_pause(paused)`
- `native_capture_stop`
- `native_capture_snapshot`
- `create_recording_file(directory, suggestedName)`
- `write_recording_chunk(path, bytes, firstChunk)`

All native commands return `Result<_, String>`; surface errors to the UI.

## Rules

- Add new events to `recordingEvents.ts` only.
- Keep payloads serializable and minimal.
- Prefer events over shared state across webviews.
