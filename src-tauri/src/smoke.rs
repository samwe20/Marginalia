use serde::Serialize;
use tauri::{AppHandle, Emitter};

fn smoke_mode() -> bool {
    std::env::var("MARGINALIA_SMOKE").as_deref() == Ok("1")
}

#[derive(Clone, Serialize)]
pub struct SmokeOpenPayload {
    pub library_root: String,
    pub file_path: String,
}

#[derive(Clone, Serialize)]
pub struct SmokeFixtures {
    pub library_root: Option<String>,
    pub pdf_path: Option<String>,
    pub epub_path: Option<String>,
}

#[tauri::command]
pub fn smoke_is_enabled() -> bool {
    smoke_mode()
}

#[tauri::command]
pub fn smoke_fixture_paths() -> SmokeFixtures {
    if !smoke_mode() {
        return SmokeFixtures {
            library_root: None,
            pdf_path: None,
            epub_path: None,
        };
    }
    SmokeFixtures {
        library_root: std::env::var("MARGINALIA_SMOKE_LIBRARY").ok(),
        pdf_path: std::env::var("MARGINALIA_FIXTURE_PDF").ok(),
        epub_path: std::env::var("MARGINALIA_FIXTURE_EPUB").ok(),
    }
}

/// CI only: bypass native file dialog when MARGINALIA_SMOKE=1 is set at process start.
#[tauri::command]
pub fn smoke_open_book(app: AppHandle, library_root: String, file_path: String) -> Result<(), String> {
    if !smoke_mode() {
        return Err("Smoke mode is disabled (set MARGINALIA_SMOKE=1)".into());
    }
  let path = std::path::Path::new(&file_path);
    if !path.is_absolute() {
        return Err("file_path must be absolute".into());
    }
    app.emit(
        "marginalia-smoke-open",
        SmokeOpenPayload {
            library_root,
            file_path,
        },
    )
    .map_err(|e| e.to_string())
}