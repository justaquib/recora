// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn recora_capture_choose_source() -> *mut std::ffi::c_char;
    fn recora_capture_start(path: *const std::ffi::c_char, microphone: i32) -> *mut std::ffi::c_char;
    fn recora_capture_pause(paused: i32) -> *mut std::ffi::c_char;
    fn recora_capture_stop() -> *mut std::ffi::c_char;
    fn recora_capture_snapshot() -> *mut std::ffi::c_char;
    fn recora_capture_free_error(value: *mut std::ffi::c_char);
}

#[cfg(target_os = "macos")]
fn native_capture_result(value: *mut std::ffi::c_char) -> Result<(), String> {
    if value.is_null() { return Ok(()); }
    let message = unsafe { std::ffi::CStr::from_ptr(value) }.to_string_lossy().into_owned();
    unsafe { recora_capture_free_error(value); }
    Err(message)
}

#[tauri::command]
async fn native_capture_choose_source() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return tauri::async_runtime::spawn_blocking(|| unsafe {
            native_capture_result(recora_capture_choose_source())
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
            native_capture_result(recora_capture_start(path.as_ptr(), i32::from(microphone)))
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
            native_capture_result(recora_capture_pause(i32::from(paused)))
        }).await.map_err(|error| format!("Native recorder pause failed: {error}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = paused; Err("Native ScreenCaptureKit recording is currently supported on macOS only.".into()) }
}

#[tauri::command]
async fn native_capture_stop() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return tauri::async_runtime::spawn_blocking(|| unsafe {
            native_capture_result(recora_capture_stop())
        }).await.map_err(|error| format!("Native recorder failed to stop: {error}"))?;
    }
    #[cfg(not(target_os = "macos"))]
    { Err("Native ScreenCaptureKit recording is currently supported on macOS only.".into()) }
}

#[tauri::command]
fn native_capture_snapshot() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let value = unsafe { recora_capture_snapshot() };
        if value.is_null() { return Err("ScreenCaptureKit has not delivered an annotation frame yet.".into()); }
        let encoded = unsafe { std::ffi::CStr::from_ptr(value) }.to_string_lossy().into_owned();
        unsafe { recora_capture_free_error(value); }
        return Ok(encoded);
    }
    #[cfg(not(target_os = "macos"))]
    { Err("Native screen snapshots are currently supported on macOS only.".into()) }
}

#[tauri::command]
fn read_recording_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|error| format!("Could not read the finalized recording: {error}"))
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
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn choose_recording_directory() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let script = r#"on run argv
try
  set selectedFolder to choose folder with prompt "Choose where Recora recordings should be saved"
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
            PathBuf::from(home).join("Movies").join("Recora")
        }
    };
    fs::create_dir_all(&base_directory).map_err(|error| format!("Could not create the recording folder: {error}"))?;

    let file_name: String = suggested_name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, ' ' | '-' | '_' | '.'))
        .collect();
    let file_name = if file_name.trim().is_empty() { "recora-recording.webm" } else { file_name.trim() };
    let stem = std::path::Path::new(file_name).file_stem().and_then(|value| value.to_str()).unwrap_or("recora-recording");
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
        .invoke_handler(tauri::generate_handler![greet, native_capture_choose_source, native_capture_start, native_capture_pause, native_capture_stop, native_capture_snapshot, read_recording_file, request_screen_capture_permission, open_capture_privacy_settings, choose_recording_directory, create_recording_file, write_recording_chunk, delete_recording_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
