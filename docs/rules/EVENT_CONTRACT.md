# Event contract

Cross-webview messages are typed and centralized. Do not add ad-hoc event names.

## Events (`src/features/recording/recordingEvents.ts`)

| Event | Payload | Purpose |
| --- | --- | --- |
| `recora:library-changed` | none | Notify main window that recordings changed |
| `recora:setup-config` | setup config | Configure the recording setup webview |

## Widget status

`WidgetStatus` (in `src/shared/types.ts`) is the shared shape for floating widget state: active, ready, recording, paused, elapsed, camera, saving, screen, bubble, and a monotonic `bubbleRevision` used to ignore stale visibility updates.

## Native commands

Tauri commands exposed by `src-tauri/src/lib.rs`:

- `native_capture_choose_source`
- `native_capture_start(path, microphone)`
- `native_capture_pause(paused)`
- `native_capture_stop(expectedDurationSeconds)`
- `native_capture_snapshot`
- `create_temporary_recording_file(suggestedName)`
- `append_temporary_recording_chunk(path, bytes)`
- `finalize_temporary_recording_file(path, suggestedName)`
- `import_recording_file(sourcePath, suggestedName)`
- `copy_recording_file(sourcePath, directory, suggestedName)`
- `recording_file_size(path)`
- `delete_recording_file(path)`

All native commands return `Result<_, String>`; surface errors to the UI.

## Rules

- Add new events to `recordingEvents.ts` only.
- Keep payloads serializable and minimal.
- Prefer events over shared state across webviews.
