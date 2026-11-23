# Recora project status

Last updated: 2026-11-23

This file is the working record for the Recora desktop app: current architecture, completed work, user-visible failures, and the next engineering steps. Update it whenever a feature ships, a blocker changes, or the implementation plan changes.

## Product direction

Recora is a local-first desktop screen and camera recorder built with Tauri, React, TypeScript, and Tailwind CSS. It has a recording setup flow, independent floating controls and camera bubble, and a library for playback and export.

The mandatory palette and typography rules are in [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md). Keep that document authoritative; any new view or widget must follow it.

## Current architecture

```text
src/
  App.tsx                         Tauri webview entry and widget selection
  components/                     Shared UI components and setup modal
  features/recording/              Dedicated setup/capture webview and event protocol
  pages/                           Dashboard, library, and video detail pages
  services/                        IndexedDB and native file persistence
  shared/                          Shared domain types
  utils/                           Formatting and error helpers
  widgets/                         Floating controls, camera, and annotation UI
```

The query parameter `?widget=...` selects which Tauri webview is mounted. The dashboard and recording setup are separate webviews with separate JavaScript runtimes. The main window owns library and save-location preferences; clicking New recording opens the dedicated `recording-setup` webview. On macOS, screen recording is captured natively by ScreenCaptureKit and encoded directly to MP4 by AVFoundation in `src-tauri/src/native_recorder.swift`. The system content picker chooses the display or window. The setup webview coordinates the native lifecycle and imports the finalized file into the library; floating controls send pause/stop commands to it. Camera-only capture remains on the WebView MediaRecorder path. React Router or Zustand would only manage state inside one webview unless a bridge is added, so they are not currently used for cross-window recording control. Recording lifecycle messages use `features/recording/recordingEvents.ts`.

## Completed

- Added the local recordings dashboard and recording detail page.
- Added screen or camera capture setup, microphone and camera toggles, and a configurable countdown.
- Added movable floating controls, camera bubble, home widget, and annotation overlay.
- Added local IndexedDB library storage, native save/export, and delete behavior.
- Added a native macOS ScreenCaptureKit path for screen/window selection and frame capture, with direct AVFoundation MP4 encoding. This replaces WebView display capture after repeated diagnostics showed live but muted tracks and zero encoded bytes.
- Added native pause/resume timing, finalization, file import, and native frame snapshots for screen annotations.
- Kept camera-only capture on the WebView MediaRecorder path.
- Split the former monolithic `App.tsx` into app entry, pages, widgets, shared types, storage service, feature event protocol, reusable UI components, and formatting utilities.
- Moved recording setup and capture ownership into its own Tauri webview; the main window now manages the library, save folder, and launch action.
- Added one save-folder preference in the main window. Folder choice is explicit; every recording is saved automatically there, or to `~/Movies/Recora` by default. Stop no longer opens a file picker.
- Added an `isRecording` local state guard so the dashboard cannot launch a second setup session during an active recording.
- Frontend production build passes with `npm run build`.

## Known issues (must remain visible until verified fixed)

### P0 — Native capture needs live macOS acceptance

The WebView screen recorder repeatedly produced a tiny MP4 header and no frames; diagnostics showed video and microphone tracks as `live`, `enabled`, and `muted`. This triggered the switch to ScreenCaptureKit, which captures screen/window frames outside WebKit. The user asked why it was not used earlier: the previous implementation stayed on browser APIs and tried to harden their lifecycle instead of changing capture engines when diagnostics proved the source was unusable. That was the wrong engineering call.

The Swift bridge compiles and `cargo check` passes, but live ScreenCaptureKit behavior, file duration, audio, pause/resume, permissions, and stop/finalize are not yet confirmed in a real recording. Do not mark the zero-frame issue fixed until acceptance confirms a playable recording with expected duration and file size. A zero-frame stop returns an explicit native capture error. ScreenCaptureKit microphone capture requires macOS 15; screen capture and the system picker require macOS 14. On macOS 14, microphone must be off for screen capture.

Latest report: ScreenCaptureKit delivered 27 video frames and 73 microphone samples, but AVAssetWriter failed finalization with `AVFoundationErrorDomain -11800`. macOS 15+ now uses Apple's `SCRecordingOutput` to write MP4 directly instead of manually appending/muxing the sample buffers. Pause/resume closes the current native segment and starts another; Stop joins segments without paused gaps. macOS 14 retains the AVAssetWriter fallback. The UI shows native errors and preserves recovery files. This new path compiles but still needs live capture acceptance before the failure is marked resolved.

### P1 — Camera bubble is not composited into screen videos

The camera bubble remains an independent widget. The current native recording output records the selected screen/window and optional microphone, but does not composite camera frames into the saved video. Add native picture-in-picture composition if saved output should include the camera overlay.

### P1 — End-to-end capture behavior is unverified

Frontend/Rust/Swift compilation validate code shape only. They do not validate macOS screen-capture permissions, microphone capture, behavior while the dashboard is minimized, native recording-output finalization, automatic save, or playback duration.

## Current validation

- `swiftc -swift-version 5 -typecheck`: passed for the native ScreenCaptureKit bridge (with Sendable and newer-SDK deprecation warnings).
- `cargo check` from `src-tauri/`: passed with the native bridge integration.
- `cargo run --no-default-features --color always --`: launched successfully with the current native recorder; the debug executable no longer depends on the missing `libswift_Concurrency.dylib`.
- `npm run build`: passed with native capture orchestration and library import.
- `npm run tauri -- build --bundles app --no-sign`: passed with direct ScreenCaptureKit MP4 output; rebuilt `src-tauri/target/release/bundle/macos/Recora.app`.
- Live stop/minimize/automatic-save/playback acceptance: not run in this environment.

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
- Persist the recording blob locally before writing the configured folder so a filesystem error cannot erase a completed capture.
- Preserve the mandatory palette and typography rules in `DESIGN_SYSTEM.md` for all new and modified UI.
- Update this status document whenever “Completed,” “Known issues,” or “Next work” changes.
