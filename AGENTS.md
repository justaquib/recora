# Project Rules

## Documentation

- `docs/design/DESIGN_SYSTEM.md` — mandatory palette and typography.
- `docs/architecture/ARCHITECTURE.md` — webview model and native boundary.
- `docs/development/SETUP.md` — build and run.
- `docs/development/CONTRIBUTING.md` — workflow and validation.
- `docs/rules/CODING_STANDARDS.md` — coding and styling rules.
- `docs/rules/EVENT_CONTRACT.md` — cross-webview and native command contract.
- `docs/project/PROJECT_STATUS.md` — current status and next work.
- `docs/project/HANDOFF.md` — handoff snapshot for agents/sessions.

## Git Push Confirmation

- **Always ask the user for explicit confirmation before running `git push`** to any remote.
- This applies to all branches and all remotes.
- Do not push automatically; wait for the user to approve.
- Before pushing, summarize what will be pushed (branch, remote, commit count) and ask "Push now?" or similar.