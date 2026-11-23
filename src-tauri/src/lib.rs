// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn recodex_capture_choose_source() -> *mut std::ffi::c_char;
    fn recodex_capture_start(path: *const std::ffi::c_char, microphone: i32) -> *mut std::ffi::c_char;
    fn recodex_capture_pause(paused: i32) -> *mut std::ffi::c_char;
    fn recodex_capture_set_microphone(enabled: i32) -> *mut std::ffi::c_char;
    fn recodex_capture_stop(expected_active_duration_seconds: f64) -> *mut std::ffi::c_char;
    fn recodex_capture_snapshot() -> *mut std::ffi::c_char;
    fn recodex_capture_free_error(value: *mut std::ffi::c_char);
}

#[cfg(target_os = "macos")]
fn native_capture_result(value: *mut std::ffi::c_char) -> Result<(), String> {
    if value.is_null() { return Ok(()); }
    let message = unsafe { std::ffi::CStr::from_ptr(value) }.to_string_lossy().into_owned();
    unsafe { recodex_capture_free_error(value); }
    Err(message)
}

#[tauri::command]
async fn native_capture_choose_source() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return tauri::async_runtime::spawn_blocking(|| unsafe {
            native_capture_result(recodex_capture_choose_source())
        }).await.map_err(|error| format!("Native capture picker failed: {error}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    { Err("Native ScreenCaptureKit recording is currently supported on macOS only.".into()) }
}

#[tauri::command]
async fn native_capture_start(path: String, microphone: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let path = std::ffi::CString::new(path).map_err(|_| "Recording path contains an invalid character")?;
        return tauri::async_runtime::spawn_blocking(move || unsafe {
            native_capture_result(recodex_capture_start(path.as_ptr(), i32::from(microphone)))
        }).await.map_err(|error| format!("Native recorder failed to start: {error}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = (path, microphone); Err("Native ScreenCaptureKit recording is currently supported on macOS only.".into()) }
}

#[tauri::command]
async fn native_capture_pause(paused: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return tauri::async_runtime::spawn_blocking(move || unsafe {
            native_capture_result(recodex_capture_pause(i32::from(paused)))
        }).await.map_err(|error| format!("Native recorder pause failed: {error}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = paused; Err("Native ScreenCaptureKit recording is currently supported on macOS only.".into()) }
}

#[tauri::command]
async fn native_capture_set_microphone(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return tauri::async_runtime::spawn_blocking(move || unsafe {
            native_capture_result(recodex_capture_set_microphone(i32::from(enabled)))
        }).await.map_err(|error| format!("Native microphone control failed: {error}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = enabled; Err("Native microphone control is currently supported on macOS only.".into()) }
}

#[tauri::command]
async fn native_capture_stop(expected_duration_seconds: f64) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return tauri::async_runtime::spawn_blocking(move || unsafe {
            native_capture_result(recodex_capture_stop(expected_duration_seconds))
        }).await.map_err(|error| format!("Native recorder failed to stop: {error}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = expected_duration_seconds; Err("Native ScreenCaptureKit recording is currently supported on macOS only.".into()) }
}

#[tauri::command]
fn native_capture_snapshot() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let value = unsafe { recodex_capture_snapshot() };
        if value.is_null() { return Err("ScreenCaptureKit has not delivered an annotation frame yet.".into()); }
        let encoded = unsafe { std::ffi::CStr::from_ptr(value) }.to_string_lossy().into_owned();
        unsafe { recodex_capture_free_error(value); }
        return Ok(encoded);
    }
    #[cfg(not(target_os = "macos"))]
    { Err("Native screen snapshots are currently supported on macOS only.".into()) }
}

#[tauri::command]
fn read_recording_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|error| format!("Could not read the finalized recording: {error}"))
}

#[tauri::command]
fn recording_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path).map(|metadata| metadata.len()).map_err(|error| format!("Could not inspect the recording file: {error}"))
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[tauri::command]
fn request_screen_capture_permission() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        if CGPreflightScreenCaptureAccess() { return true; }
        return CGRequestScreenCaptureAccess();
    }
    #[cfg(not(target_os = "macos"))]
    { true }
}

#[tauri::command]
fn open_capture_privacy_settings(section: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let privacy_section = match section.as_str() {
            "microphone" => "Privacy_Microphone",
            "camera" => "Privacy_Camera",
            _ => "Privacy_ScreenCapture",
        };
        let url = format!("x-apple.systempreferences:com.apple.preference.security?{privacy_section}");
        let status = std::process::Command::new("open")
            .arg(url)
            .status()
            .map_err(|error| format!("Could not open macOS Screen Recording settings: {error}"))?;
        if status.success() { Ok(()) } else { Err("macOS could not open Screen Recording settings.".into()) }
    }
    #[cfg(not(target_os = "macos"))]
    { Err("Capture permissions are managed by the operating system.".into()) }
}

#[tauri::command]
fn choose_recording_directory() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let script = r#"on run argv
try
  set selectedFolder to choose folder with prompt "Choose where Recodex recordings should be saved"
  return POSIX path of selectedFolder
on error number -128
  return "CANCELLED"
end try
end run"#;
        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|error| format!("Could not open the macOS folder picker: {error}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path == "CANCELLED" || path.is_empty() {
            return Ok(None);
        }
        Ok(Some(path))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Choosing a save folder is currently supported on macOS only.".into())
    }
}

#[tauri::command]
fn create_recording_file(directory: Option<String>, suggested_name: String) -> Result<String, String> {
    use std::{env, fs, fs::OpenOptions, path::PathBuf};

    let base_directory = match directory.filter(|path| !path.trim().is_empty()) {
        Some(path) => PathBuf::from(path),
        None => {
            let home = env::var_os("HOME").ok_or("Could not find the current user's home folder")?;
            PathBuf::from(home).join("Documents").join("Recodex")
        }
    };
    fs::create_dir_all(&base_directory).map_err(|error| format!("Could not create the recording folder: {error}"))?;

    let file_name: String = suggested_name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, ' ' | '-' | '_' | '.'))
        .collect();
    let file_name = if file_name.trim().is_empty() { "recodex-recording.webm" } else { file_name.trim() };
    let stem = std::path::Path::new(file_name).file_stem().and_then(|value| value.to_str()).unwrap_or("recodex-recording");
    let extension = std::path::Path::new(file_name).extension().and_then(|value| value.to_str()).unwrap_or("webm");

    for suffix in 0..10_000 {
        let candidate_name = if suffix == 0 { format!("{stem}.{extension}") } else { format!("{stem} ({suffix}).{extension}") };
        let path = base_directory.join(candidate_name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(_) => return Ok(path.to_string_lossy().into_owned()),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not create the recording file: {error}")),
        }
    }
    Err("Could not choose a unique filename for this recording.".into())
}

fn safe_recording_name(suggested_name: &str) -> (String, String) {
    let file_name: String = suggested_name.chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, ' ' | '-' | '_' | '.'))
        .collect();
    let file_name = if file_name.trim().is_empty() { "recodex-recording.webm" } else { file_name.trim() };
    let stem = std::path::Path::new(file_name).file_stem().and_then(|value| value.to_str()).unwrap_or("recodex-recording").to_string();
    let extension = std::path::Path::new(file_name).extension().and_then(|value| value.to_str()).unwrap_or("webm").to_string();
    (stem, extension)
}

fn unique_recording_path(directory: &std::path::Path, suggested_name: &str) -> Result<std::path::PathBuf, String> {
    use std::fs::OpenOptions;
    let (stem, extension) = safe_recording_name(suggested_name);
    std::fs::create_dir_all(directory).map_err(|error| format!("Could not create the recording folder: {error}"))?;
    for suffix in 0..10_000 {
        let name = if suffix == 0 { format!("{stem}.{extension}") } else { format!("{stem} ({suffix}).{extension}") };
        let path = directory.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(_) => return Ok(path),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not create the recording file: {error}")),
        }
    }
    Err("Could not choose a unique filename for this recording.".into())
}

#[tauri::command]
fn create_temporary_recording_file(app: tauri::AppHandle, suggested_name: String) -> Result<String, String> {
    use tauri::Manager;
    let directory = app.path().app_local_data_dir().map_err(|error| format!("Could not locate Recodex's local storage: {error}"))?.join(".temp");
    unique_recording_path(&directory, &suggested_name).map(|path| path.to_string_lossy().into_owned())
}

fn ensure_temporary_recording_path(app: &tauri::AppHandle, path: &str) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let temporary_directory = app.path().app_local_data_dir().map_err(|error| format!("Could not locate Recodex's local storage: {error}"))?.join(".temp");
    let canonical_directory = std::fs::canonicalize(&temporary_directory).map_err(|error| format!("Could not locate the temporary recording folder: {error}"))?;
    let recording_path = std::fs::canonicalize(path).map_err(|error| format!("Could not locate the temporary recording: {error}"))?;
    if !recording_path.starts_with(canonical_directory) {
        return Err("The recording path is outside Recodex's temporary storage.".into());
    }
    Ok(recording_path)
}

#[tauri::command]
fn append_temporary_recording_chunk(app: tauri::AppHandle, path: String, bytes: Vec<u8>) -> Result<(), String> {
    use std::io::Write;
    let path = ensure_temporary_recording_path(&app, &path)?;
    let mut file = std::fs::OpenOptions::new().append(true).open(path).map_err(|error| format!("Could not open the temporary recording: {error}"))?;
    file.write_all(&bytes).map_err(|error| format!("Could not append the recording chunk: {error}"))?;
    file.sync_data().map_err(|error| format!("Could not flush the recording chunk to disk: {error}"))
}

#[tauri::command]
fn finalize_temporary_recording_file(app: tauri::AppHandle, path: String, suggested_name: String) -> Result<String, String> {
    use std::{fs, io};
    use tauri::Manager;
    let source = ensure_temporary_recording_path(&app, &path)?;
    let destination_directory = app.path().app_local_data_dir().map_err(|error| format!("Could not locate Recodex's local storage: {error}"))?.join("recordings");
    let destination = unique_recording_path(&destination_directory, &suggested_name)?;
    match fs::rename(&source, &destination) {
        Ok(()) => Ok(destination.to_string_lossy().into_owned()),
        Err(_) => {
            let mut input = fs::File::open(&source).map_err(|error| format!("Could not open the temporary recording for transfer: {error}"))?;
            let mut output = fs::OpenOptions::new().write(true).truncate(true).open(&destination).map_err(|error| format!("Could not create the library recording: {error}"))?;
            if let Err(error) = io::copy(&mut input, &mut output).and_then(|_| output.sync_all()) {
                let _ = fs::remove_file(&destination);
                return Err(format!("Could not finalize the library recording: {error}. The temporary copy remains at {}", source.display()));
            }
            fs::remove_file(&source).map_err(|error| format!("Recording was copied to {}, but its temporary copy could not be removed: {error}", destination.display()))?;
            Ok(destination.to_string_lossy().into_owned())
        }
    }
}

#[tauri::command]
fn import_recording_file(app: tauri::AppHandle, source_path: String, suggested_name: String) -> Result<String, String> {
    use std::{fs, io};
    use tauri::Manager;
    let library_directory = app.path().app_local_data_dir().map_err(|error| format!("Could not locate Recodex's local storage: {error}"))?.join("recordings");
    let canonical_library = fs::canonicalize(&library_directory).ok();
    let canonical_source = fs::canonicalize(&source_path).map_err(|error| format!("Could not locate the existing recording: {error}"))?;
    if canonical_library.as_ref().is_some_and(|directory| canonical_source.starts_with(directory)) {
        return Ok(canonical_source.to_string_lossy().into_owned());
    }
    let destination = unique_recording_path(&library_directory, &suggested_name)?;
    let mut input = match fs::File::open(&canonical_source) {
        Ok(file) => file,
        Err(error) => { let _ = fs::remove_file(&destination); return Err(format!("Could not open the existing recording: {error}")); }
    };
    let mut output = match fs::OpenOptions::new().write(true).truncate(true).open(&destination) {
        Ok(file) => file,
        Err(error) => { let _ = fs::remove_file(&destination); return Err(format!("Could not create the migrated recording: {error}")); }
    };
    if let Err(error) = io::copy(&mut input, &mut output).and_then(|_| output.sync_all()) {
        let _ = fs::remove_file(&destination);
        return Err(format!("Could not migrate the existing recording: {error}"));
    }
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
fn copy_recording_file(source_path: String, directory: Option<String>, suggested_name: String) -> Result<String, String> {
    use std::{env, fs, io, path::PathBuf};
    let source = PathBuf::from(&source_path);
    let destination_directory = match directory.filter(|path| !path.trim().is_empty()) {
        Some(path) => PathBuf::from(path),
        None => PathBuf::from(env::var_os("HOME").ok_or("Could not find the current user's home folder")?).join("Documents").join("Recodex"),
    };
    let destination = unique_recording_path(&destination_directory, &suggested_name)?;
    let mut input = match fs::File::open(&source) {
        Ok(file) => file,
        Err(error) => { let _ = fs::remove_file(&destination); return Err(format!("Could not open the recording for export: {error}")); }
    };
    let mut output = match fs::OpenOptions::new().write(true).truncate(true).open(&destination) {
        Ok(file) => file,
        Err(error) => { let _ = fs::remove_file(&destination); return Err(format!("Could not create the exported recording: {error}")); }
    };
    if let Err(error) = io::copy(&mut input, &mut output).and_then(|_| output.sync_all()) {
        let _ = fs::remove_file(&destination);
        return Err(format!("Could not export the recording: {error}"));
    }
    Ok(destination.to_string_lossy().into_owned())
}

fn ffmpeg_binary() -> &'static str {
    for candidate in ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"] {
        if std::path::Path::new(candidate).exists() {
            return candidate;
        }
    }
    "ffmpeg"
}

#[tauri::command]
fn export_recording_file(source_path: String, directory: Option<String>, suggested_name: String, quality: String, thumbnail_bytes: Vec<u8>) -> Result<String, String> {
    use std::{env, fs, process::Command, path::PathBuf};
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err(format!("Could not locate the existing recording: {}", source.display()));
    }
    let destination_directory = match directory.filter(|path| !path.trim().is_empty()) {
        Some(path) => PathBuf::from(path),
        None => PathBuf::from(env::var_os("HOME").ok_or("Could not find the current user's home folder")?).join("Documents").join("Recodex"),
    };
    let stem = std::path::Path::new(&suggested_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("recodex-recording");
    let destination = unique_recording_path(&destination_directory, &format!("{stem}.mp4"))?;
    let (crf, preset, audio_bitrate) = match quality.as_str() {
        "high" => ("18", "slow", "192k"),
        "low" => ("28", "fast", "96k"),
        _ => ("23", "medium", "128k"),
    };
    let thumbnail_path = if thumbnail_bytes.is_empty() {
        None
    } else {
        let temp_dir = std::env::temp_dir().join("recodex-export-thumb");
        fs::create_dir_all(&temp_dir).map_err(|error| format!("Could not create temporary folder: {error}"))?;
        let path = temp_dir.join(format!("thumb-{}.jpg", std::process::id()));
        fs::write(&path, &thumbnail_bytes).map_err(|error| format!("Could not write thumbnail: {error}"))?;
        Some(path)
    };
    let output = if let Some(thumb) = &thumbnail_path {
        Command::new(ffmpeg_binary())
            .args([
                "-y",
                "-i",
                source.to_str().ok_or("Recording path contains an invalid character")?,
                "-i",
                thumb.to_str().ok_or("Thumbnail path contains an invalid character")?,
                "-map",
                "0:v",
                "-map",
                "0:a?",
                "-map",
                "1",
                "-c:v:0",
                "libx264",
                "-preset",
                preset,
                "-crf",
                crf,
                "-c:a",
                "aac",
                "-b:a",
                audio_bitrate,
                "-c:v:1",
                "copy",
                "-disposition:v:1",
                "attached_pic",
                "-movflags",
                "+faststart",
                destination.to_str().ok_or("Export path contains an invalid character")?,
            ])
            .output()
            .map_err(|error| format!("Could not run ffmpeg for export: {error}"))?
    } else {
        Command::new(ffmpeg_binary())
            .args([
                "-y",
                "-i",
                source.to_str().ok_or("Recording path contains an invalid character")?,
                "-c:v",
                "libx264",
                "-preset",
                preset,
                "-crf",
                crf,
                "-c:a",
                "aac",
                "-b:a",
                audio_bitrate,
                "-movflags",
                "+faststart",
                destination.to_str().ok_or("Export path contains an invalid character")?,
            ])
            .output()
            .map_err(|error| format!("Could not run ffmpeg for export: {error}"))?
    };
    if let Some(thumb) = &thumbnail_path { let _ = fs::remove_file(thumb); }
    if !output.status.success() {
        let _ = fs::remove_file(&destination);
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Could not export the recording: {}", stderr.trim()));
    }
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
fn estimate_export_size(source_path: String, quality: String) -> Result<u64, String> {
    use std::{env, fs, process::Command, path::PathBuf};
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err(format!("Could not locate the existing recording: {}", source.display()));
    }
    let temp_dir = env::temp_dir().join("recodex-export-estimate");
    fs::create_dir_all(&temp_dir).map_err(|error| format!("Could not create temporary folder: {error}"))?;
    let destination = temp_dir.join(format!("estimate-{}-{}.mp4", std::process::id(), quality));
    let (crf, preset, audio_bitrate) = match quality.as_str() {
        "high" => ("18", "slow", "192k"),
        "low" => ("28", "fast", "96k"),
        _ => ("23", "medium", "128k"),
    };
    let output = Command::new(ffmpeg_binary())
        .args([
            "-y",
            "-i",
            source.to_str().ok_or("Recording path contains an invalid character")?,
            "-c:v",
            "libx264",
            "-preset",
            preset,
            "-crf",
            crf,
            "-c:a",
            "aac",
            "-b:a",
            audio_bitrate,
            "-movflags",
            "+faststart",
            destination.to_str().ok_or("Export path contains an invalid character")?,
        ])
        .output()
        .map_err(|error| format!("Could not run ffmpeg for estimate: {error}"))?;
    if !output.status.success() {
        let _ = fs::remove_file(&destination);
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Could not estimate export size: {}", stderr.trim()));
    }
    let size = fs::metadata(&destination).map(|metadata| metadata.len()).map_err(|error| format!("Could not inspect estimated file: {error}"))?;
    let _ = fs::remove_file(&destination);
    Ok(size)
}

#[tauri::command]
fn embed_thumbnail_in_video(source_path: String, thumbnail_bytes: Vec<u8>, in_place: bool) -> Result<String, String> {
    use std::{env, fs, process::Command, path::PathBuf};
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err(format!("Could not locate the existing recording: {}", source.display()));
    }
    if thumbnail_bytes.is_empty() {
        return Err("No thumbnail is available for this recording.".into());
    }
    let temp_dir = std::env::temp_dir().join("recodex-embed-thumb");
    fs::create_dir_all(&temp_dir).map_err(|error| format!("Could not create temporary folder: {error}"))?;
    let thumb_path = temp_dir.join(format!("thumb-{}.jpg", std::process::id()));
    fs::write(&thumb_path, &thumbnail_bytes).map_err(|error| format!("Could not write thumbnail: {error}"))?;
    let output_path = if in_place {
        source.with_file_name(format!("{}-thumb.mp4", source.file_stem().and_then(|v| v.to_str()).unwrap_or("recodex-recording")))
    } else {
        let directory = source.parent().map(PathBuf::from).unwrap_or_else(|| PathBuf::from(env::var_os("HOME").unwrap_or_default()).join("Documents").join("Recodex"));
        fs::create_dir_all(&directory).map_err(|error| format!("Could not create destination folder: {error}"))?;
        directory.join(format!("{}-thumb.mp4", source.file_stem().and_then(|v| v.to_str()).unwrap_or("recodex-recording")))
    };
    let output = Command::new(ffmpeg_binary())
        .args([
            "-y",
            "-i",
            source.to_str().ok_or("Recording path contains an invalid character")?,
            "-i",
            thumb_path.to_str().ok_or("Thumbnail path contains an invalid character")?,
            "-map",
            "0",
            "-map",
            "1",
            "-c",
            "copy",
            "-disposition:v:1",
            "attached_pic",
            output_path.to_str().ok_or("Output path contains an invalid character")?,
        ])
        .output()
        .map_err(|error| format!("Could not run ffmpeg: {error}"))?;
    let _ = fs::remove_file(&thumb_path);
    if !output.status.success() {
        let _ = fs::remove_file(&output_path);
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Could not add thumbnail to video: {}", stderr.trim()));
    }
    if in_place {
        fs::remove_file(&source).map_err(|error| format!("Could not remove original recording: {error}"))?;
        fs::rename(&output_path, &source).map_err(|error| format!("Could not replace recording: {error}"))?;
        Ok(source.to_string_lossy().into_owned())
    } else {
        Ok(output_path.to_string_lossy().into_owned())
    }
}

#[tauri::command]
fn write_recording_chunk(path: String, bytes: Vec<u8>, first_chunk: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::{fs::OpenOptions, io::Write, path::Path};
        let destination = Path::new(&path);
        let mut options = OpenOptions::new();
        options.write(true).create(true);
        if first_chunk { options.truncate(true); } else { options.append(true); }
        let mut file = options.open(destination).map_err(|error| format!("Could not open the selected file: {error}"))?;
        file.write_all(&bytes).map_err(|error| format!("Could not write the recording: {error}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, bytes, first_chunk);
        Err("Saving recordings to a chosen location is currently supported on macOS only.".into())
    }
}

#[tauri::command]
fn delete_recording_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("Could not delete the saved file: {error}")),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("Deleting a saved file is currently supported on macOS only.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![native_capture_choose_source, native_capture_start, native_capture_pause, native_capture_set_microphone, native_capture_stop, native_capture_snapshot, read_recording_file, recording_file_size, request_screen_capture_permission, open_capture_privacy_settings, choose_recording_directory, create_recording_file, write_recording_chunk, create_temporary_recording_file, append_temporary_recording_chunk, finalize_temporary_recording_file, import_recording_file, copy_recording_file, export_recording_file, estimate_export_size, embed_thumbnail_in_video, delete_recording_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
