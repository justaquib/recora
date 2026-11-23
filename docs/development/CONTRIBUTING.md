# Contributing

## Before you start

- Read `docs/design/DESIGN_SYSTEM.md` — the palette and typography rules are mandatory for all UI.
- Read `docs/architecture/ARCHITECTURE.md` for layering and native-boundary rules.
- Check `docs/project/PROJECT_STATUS.md` for current blockers and next work.

## Workflow

1. Keep changes focused and small.
2. Preserve the mandatory color palette (only `--ink`, `--pink`, `--accent`, `--paper` and their alpha variants).
3. Keep page components focused on composition; put lifecycle and persistence in feature/service modules.
4. Keep Tauri APIs at the desktop boundary.
5. Keep cross-webview messages typed and centralized in `recordingEvents.ts`.
6. Update `docs/project/PROJECT_STATUS.md` when "Completed", "Known issues", or "Next work" changes.

## Documentation hygiene

## Documentation hygiene

- When moving or renaming any `.md` file, update all relative links and references to it across the repo (including other docs and `AGENTS.md`).
- Keep cross-references between docs valid; verify with a repo-wide search before finishing.
- Add a `HANDOFF.md` entry when handing off work to another agent/session.

## Validation

- `cargo check` (in `src-tauri/`) must pass for native changes.
- `swiftc -swift-version 5 -typecheck` for Swift bridge changes.
- Live macOS capture acceptance remains manual.

## Commit / push

- Never push without explicit user confirmation.
- Do not commit secrets or keys.
