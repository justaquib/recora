# Development setup

## Prerequisites

- Node.js + npm
- Rust toolchain + Cargo
- Tauri CLI (via npm devDependency)
- Xcode toolchain (macOS, for Swift bridge)

## Install

```sh
npm install
```

## Run (dev)

```sh
npm run tauri dev
```

## Frontend only

```sh
npm run dev
npm run build
```

## Rust / Swift checks

```sh
cd src-tauri && cargo check
swiftc -swift-version 5 -typecheck src-tauri/src/native_recorder.swift
```

## Clean native build

```sh
cargo clean --manifest-path src-tauri/Cargo.toml
```

## Package

```sh
npm run tauri -- build --bundles app --no-sign
```

## Notes

- Native ScreenCaptureKit recording is macOS-only; other platforms return an explicit error.
- Screen capture requires macOS 14+; microphone capture requires macOS 15+.
- Live capture acceptance (permissions, audio, pause/resume, playback) is manual; see `docs/project/PROJECT_STATUS.md`.
