# Recodex project status

Last updated: 2026-11-24

This file is the working record for the Recodex desktop app: current architecture, completed work, user-visible failures, and the next engineering steps. Update it whenever a feature ships, a blocker changes, or the implementation plan changes.

## Product direction

Recodex is a local-first desktop screen and camera recorder built with Tauri, React, TypeScript, and Tailwind CSS. It has a recording setup flow, independent floating controls and camera bubble, and a library for playback and export.

The mandatory palette and typography rules are in [DESIGN_SYSTEM.md](../design/DESIGN_SYSTEM.md). Keep that document authoritative; any new view or widget must follow it.

## Current architecture

```text
src/
  App.tsx                         Tauri webview entry and widget selection
  components/                     Shared UI components and setup modal
  features/recording/              Dedicated setup/capture webview and event protocol
  pages/                           Dashboard, library, and video detail pages
  services/                        IndexedDB metadata and native file persistence
  shared/                          Shared domain types
  utils/                           Formatting and error helpers
  widgets/                         Floating controls, camera, and annotation UI
```

The query parameter `?widget=...` selects which Tauri webview is mounted. The dashboard and recording setup are separate webviews with separate JavaScript runtimes. The main window owns library and save-location preferences; clicking New recording opens the dedicated `recording-setup` webview. On macOS 15+, screen recording uses ScreenCaptureKit's direct MP4 recording output; macOS 14 uses the AVFoundation sample-writer fallback. The system content picker chooses the display or window. The setup webview coordinates native lifecycle and imports the finalized file into the library; floating controls include Home, pause, stop, microphone mute, camera-bubble visibility, and annotation. Hiding the camera bubble turns the camera off; showing it again leaves the camera off until enabled from the bubble. The camera bubble owns camera selection and visual settings, with static filter previews. The countdown is an independent floating window. When the dashboard gains focus, it hides the camera, controls, countdown, and annotation windows. Camera-only capture remains on the WebView MediaRecorder path. React Router or Zustand would only manage state inside one webview unless a bridge is added, so they are not currently used for cross-window recording control. Recording lifecycle messages use `features/recording/recordingEvents.ts`.

## Completed

- Added the local recordings dashboard and recording detail page.
- Added screen or camera capture setup, microphone and camera toggles, and a configurable countdown.
- Added movable floating controls, camera bubble, and annotation overlay.
- Added camera settings in the bubble: live camera selection, original/warm/monochrome preview filters, soft blur, avatar selection, camera on/off, and bubble resizing.
- Moved Home into the floating recording controls and removed the separate home window.
- Added live microphone mute control to the floating recording bar.
- Added a recorder-bar camera-bubble toggle. Hiding the bubble disables its camera stream; showing it again displays the avatar until the camera is explicitly enabled.
- Removed the persisted camera-bubble pin as a visibility authority so startup and inactive widget status always close the bubble; the Preferences preview remains explicitly openable.
- Kept the camera bubble and floating controls available after a successful stop. The controls return to an idle state with a New recording action, and the bubble stays visible with the camera off.
- Made bubble visibility authoritative across the camera and controls webviews so hiding it disables the preview before hiding its window.
- Added a monotonic camera-bubble visibility revision so delayed status messages cannot undo a recent show/hide click; widget listeners reconcile visibility with the native window state, and button actions apply show/hide directly as well.
- Serialized annotation show/hide transitions so repeated snapshot/tool events cannot race each other, and status updates only close it on explicit inactive/finalizing states.
- Preserved the bubble's screen-space center while camera settings expand or collapse, subject to monitor work-area clamping.
- Added a live microphone level meter, a glass-effect timer shown only once recording begins, and a transparent setup window with a softened backdrop.
- Redesigned the recorder bar with distinct preparation, recording, idle, and saving states. Added an idle-only close action; the dashboard closes all floating windows whenever it appears or regains focus.
- Moved the configurable countdown into its own transparent floating window, shown with the camera bubble and controls during recording preparation. Dashboard dismissal does not reopen it during the active countdown.
- Replaced recorder failure toasts with a recovery dialog that explains ScreenCaptureKit finalization timeouts, shows the preserved recovery path, and exposes copyable technical diagnostics.
- Fixed post-save widget state reset: idle status explicitly clears `saving`, and library refresh notifications no longer block recorder cleanup.
- Reconciled requested widget visibility against the native window's actual `isVisible()` state, including windows shown directly during startup, so hide actions are not skipped by stale in-memory visibility flags.
- Kept microphone level updates out of the high-frequency React widget status render path; level bars update directly so they do not repaint the timer every 80 ms.
- Replaced live camera filter thumbnails with static avatar previews to avoid opening multiple camera renderers that flicker.
- Added local library metadata in IndexedDB and on-disk media storage. New recordings write to the app-local `.temp` folder, merge/finalize on disk, then move into app-local `recordings` and copy to the configured save folder. On success, the `.temp` recording and merged native segments are removed. On failure, recovery files remain in `.temp`. Existing IndexedDB video blobs migrate to disk when the library loads.
- Persisted floating widget positions in the shared IndexedDB settings store for restoration across app restarts.
- Added monitor work-area checks for the expanded camera settings panel and serialized camera-bubble show/hide operations. Edge placement still needs live macOS confirmation.
- Added a native macOS ScreenCaptureKit path for screen/window selection and frame capture, with direct MP4 recording output on macOS 15+. This replaces WebView display capture after repeated diagnostics showed live but muted tracks and zero encoded bytes.
- Added native pause/resume timing, finalization, file import, and native frame snapshots for screen annotations.
- Kept camera-only capture on the WebView MediaRecorder path.
- Split the former monolithic `App.tsx` into app entry, pages, widgets, shared types, storage service, feature event protocol, reusable UI components, and formatting utilities.
- Moved recording setup and capture ownership into its own Tauri webview; the main window now manages the library, save folder, and launch action.
- Added one save-folder preference in the main window. Folder choice is explicit; every recording is saved automatically there, or to `~/Documents/Recodex` by default. The folder is created automatically if it does not exist. Stop no longer opens a file picker.
- Added an `isRecording` local state guard so the dashboard cannot launch a second setup session during an active recording.
- Frontend production build passes with `npm run build`.

## Known issues (must remain visible until verified fixed)

### P0 — Native capture needs live macOS acceptance

The WebView screen recorder repeatedly produced a tiny MP4 header and no frames; diagnostics showed video and microphone tracks as `live`, `enabled`, and `muted`. This triggered the switch to ScreenCaptureKit, which captures screen/window frames outside WebKit. The user asked why it was not used earlier: the previous implementation stayed on browser APIs and tried to harden their lifecycle instead of changing capture engines when diagnostics proved the source was unusable. That was the wrong engineering call.

The Swift bridge compiles and `cargo check` passes, but live ScreenCaptureKit behavior, file duration, audio, pause/resume, permissions, and stop/finalize are not yet confirmed in a real recording. Do not mark the zero-frame issue fixed until acceptance confirms a playable recording with expected duration and file size. A zero-frame stop returns an explicit native capture error. ScreenCaptureKit microphone capture requires macOS 15; screen capture and the system picker require macOS 14. On macOS 14, microphone must be off for screen capture.

Latest reports: ScreenCaptureKit previously delivered 27 video frames and 73 microphone samples, but AVAssetWriter failed finalization with `AVFoundationErrorDomain -11800`. macOS 15+ uses Apple's `SCRecordingOutput` to write MP4 directly. Stop and pause now require the recording-output finish callback (up to 30 seconds) before checking file stability and duration; a stable file before callback completion is not accepted as finalized. Stop also compares the measured video-track duration with the active recorder time before joining/importing it and includes ScreenCaptureKit's reported duration and frame count in mismatch diagnostics. If ScreenCaptureKit stops early or the video timeline is materially shorter, the incomplete video is not added to the library and its recovery segments are kept. macOS 14 retains the AVAssetWriter fallback. These safeguards compile but still need live capture acceptance before the capture failure is marked resolved.

### P2 — Camera bubble background replacement still not working

The MediaPipe camera-bubble path now uses a fixed square camera crop so the segmentation mask and source pixels stay aligned, handles the checked-in single-mask selfie model as well as two-class outputs, reuses its canvases, skips duplicate camera frames, and falls back to raw video if the model fails. The compositor paints solid colors or decoded image/GIF frames beneath the masked person; image assets are stored in IndexedDB with migration from the prior localStorage data URL. The frontend build passes, but live camera acceptance on macOS is still required before this issue is marked fixed.

### P1 — Camera bubble is not composited into screen videos

The camera bubble remains an independent widget. The current native recording output records the selected screen/window and optional microphone, but does not composite camera frames into the saved video. Add native picture-in-picture composition if saved output should include the camera overlay.

### P1 — End-to-end capture behavior is unverified

Frontend/Rust/Swift compilation validate code shape only. They do not validate macOS screen-capture permissions, microphone capture, behavior while the dashboard is minimized, native recording-output finalization, automatic save, or playback duration.

## Current validation

- `npm run build`: passed after the floating-widget lifecycle, microphone meter, timer, and setup backdrop changes.
- `cargo check --offline` from `src-tauri/`: passed with app-local staging, file migration, and save-folder copy commands.
- `npm run tauri -- build --bundles app --no-sign`: passed with the storage and widget changes; rebuilt `src-tauri/target/release/bundle/macos/Recodex.app`.
- `swiftc -module-cache-path /private/tmp/recodex-swift-cache-check -swift-version 5 -typecheck src-tauri/src/native_recorder.swift`: passed after callback fallback and duration guard (existing concurrency and deprecation warnings remain).
- Live capture, long-duration playback, pause/resume, auto-save, microphone-meter accuracy, widget edge placement, and restart position restoration: not run in this environment.

## Next work

1. **Live-verify native capture.** Test 10- and 45-second screen recordings, with and without microphone, while minimizing the dashboard. Check playable duration, file size, audio, pause/resume, stop, and library playback.
2. **Handle camera overlay output.** If saved screen video should include the camera bubble, compose camera frames with ScreenCaptureKit frames in a native writer pipeline; the current bubble is a separate overlay only.
3. **Finish component boundaries.** `RecordingSetupWindow` still owns capture orchestration and recorder setup state. Extract its capture/session lifecycle into a focused recording controller, move save/delete/export actions into a library feature service, and extract countdown, delete confirmation, and toast overlays into focused components.
4. **Add lifecycle-focused validation.** Once the live failure stage is known, cover start → pause → resume → stop → persistence with focused tests or a repeatable manual acceptance checklist. Keep permissions and actual macOS capture as manual integration checks.
5. **Package and validate the actual desktop build.** Confirm the tested binary is the one the user launches; a frontend build alone does not replace a previously installed app bundle.

## Architecture guidelines

- Keep the main window focused on library and save-folder preferences; keep capture lifecycle in the recorder feature and its Tauri webview.
- Keep page components focused on page composition; put recording lifecycle and library operations in their feature/service modules.
- Keep Tauri window/event APIs at the desktop boundary. Do not make UI components own unrelated capture, persistence, or export responsibilities.
- Keep cross-webview messages typed and centralized. A UI timer is not proof that encoded media is being produced.
- Persist media chunks in the app-local temporary file during capture; never store recording bytes in IndexedDB.
- Preserve the mandatory palette and typography rules in `DESIGN_SYSTEM.md` for all new and modified UI.
- Update this status document whenever “Completed,” “Known issues,” or “Next work” changes.
