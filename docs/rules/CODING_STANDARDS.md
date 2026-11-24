# Coding standards

## General

- TypeScript strict; no `any` unless justified.
- Prefer editing existing files over creating new ones.
- No comments unless asked; code should be self-explanatory.
- Match existing style, imports, and patterns.

## Frontend

- Functional React components; hooks at top level.
- Pages compose; features own lifecycle; services own persistence.
- No direct Tauri `invoke` in components except through service modules.
- Cross-webview communication only via `src/features/recording/recordingEvents.ts`.
- IndexedDB schema changes require a version bump in `openLibrary()` and migration handling.

## Styling

- Use CSS custom properties from `src/App.css` only.
- Allowed base colors: `--ink` `#1A1A1A`, `--pink` `#E01A4F`, `--accent` `#4C8DF1`, `--paper` `#F2F2F2`, plus alpha variants.
- 4 px spacing rhythm; 8 px common gaps.
- 6–8 px control radii, 9–14 px panel radii.

## Native

- Rust commands stay thin wrappers around Swift FFI; business logic in Swift.
- Native errors must surface to the UI; never swallow capture failures.
- macOS-only features return explicit errors on other platforms.

## Naming

- Files: PascalCase for components, camelCase for modules/utilities.
- Types: PascalCase; events prefixed `recodex:`.

## Implementation Constraints

- Do not add or use any third-party API without explicit user approval.
- Do not add or use another programming language for implementation without explicit user approval.
