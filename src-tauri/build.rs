use std::{env, path::PathBuf, process::Command};

fn main() {
    tauri_build::build();
    println!("cargo:rerun-if-changed=src/native_recorder.swift");

    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }

    let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR is set by Cargo"));
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH").expect("target architecture is set by Cargo");
    let swift_arch = match target_arch.as_str() {
        "aarch64" => "arm64",
        "x86_64" => "x86_64",
        other => panic!("Unsupported macOS architecture for native screen capture: {other}"),
    };
    let target = format!("{swift_arch}-apple-macosx14.0");
    let archive = out_dir.join("librecodex_native_capture.a");
    let cache = out_dir.join("swift-module-cache");
    std::fs::create_dir_all(&cache).expect("create Swift module cache");

    let status = Command::new("swiftc")
        .args([
            "-swift-version", "5",
            "-emit-library", "-static", "-parse-as-library",
            "-target", &target,
            "-module-cache-path", cache.to_str().expect("UTF-8 build path"),
            "src/native_recorder.swift",
            "-o", archive.to_str().expect("UTF-8 archive path"),
        ])
        .status()
        .expect("Swift compiler is required to build Recodex's macOS ScreenCaptureKit recorder");
    assert!(status.success(), "Failed to compile native ScreenCaptureKit recorder");

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=recodex_native_capture");
    for framework in ["AVFoundation", "ScreenCaptureKit", "CoreMedia", "CoreVideo", "Foundation", "AppKit"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
}
