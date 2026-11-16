use serde::Serialize;
use std::fs;
use tauri::{AppHandle, Emitter, Manager};

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

/// When set with MARGINALIA_SMOKE=1, boot must not auto-attach MARGINALIA_SMOKE_LIBRARY (S18 first-run).
#[tauri::command]
pub fn smoke_defer_fixture_library() -> bool {
    smoke_mode() && std::env::var("MARGINALIA_SMOKE_DEFER_LIBRARY").as_deref() == Ok("1")
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
pub fn smoke_open_book(
    app: AppHandle,
    #[allow(non_snake_case)] libraryRoot: Option<String>,
    #[allow(non_snake_case)] filePath: String,
) -> Result<(), String> {
    if !smoke_mode() {
        return Err("Smoke mode is disabled (set MARGINALIA_SMOKE=1)".into());
    }
    let path = std::path::Path::new(&filePath);
    if !path.is_absolute() {
        return Err("file_path must be absolute".into());
    }
    let library_root = libraryRoot.unwrap_or_default();
    app.emit(
        "marginalia-smoke-open",
        SmokeOpenPayload {
            library_root,
            file_path: filePath,
        },
    )
    .map_err(|e| e.to_string())
}

#[derive(Clone, Serialize)]
pub struct SmokeDropPayload {
    pub library_root: String,
    pub file_path: String,
}

/// CI: same ingest path as library drag&drop (absolute fixture path).
#[tauri::command]
pub fn smoke_drop_book(
    app: AppHandle,
    #[allow(non_snake_case)] libraryRoot: Option<String>,
    #[allow(non_snake_case)] filePath: String,
) -> Result<(), String> {
    if !smoke_mode() {
        return Err("Smoke mode is disabled (set MARGINALIA_SMOKE=1)".into());
    }
    let path = std::path::Path::new(&filePath);
    if !path.is_absolute() {
        return Err("file_path must be absolute".into());
    }
    let library_root = libraryRoot.unwrap_or_default();
    app.emit(
        "marginalia-smoke-drop",
        SmokeDropPayload {
            library_root,
            file_path: filePath,
        },
    )
    .map_err(|e| e.to_string())
}

/// Delete Tauri store prefs so the next boot matches a fresh install (CI only).
#[tauri::command]
pub fn smoke_reset_first_run(app: AppHandle) -> Result<(), String> {
    if !smoke_mode() {
        return Err("Smoke mode is disabled".into());
    }
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    let store = dir.join("marginalia-prefs.json");
    if store.is_file() {
        fs::remove_file(&store).map_err(|e| e.to_string())?;
    }
  let legacy = dir.join("stores").join("marginalia-prefs.json");
    if legacy.is_file() {
        fs::remove_file(&legacy).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Expected default library after ensureDefaultLibraryRoot (Documents/Marginalia).
#[tauri::command]
pub fn smoke_expected_documents_library(app: AppHandle) -> Result<String, String> {
    if !smoke_mode() {
        return Err("Smoke mode is disabled".into());
    }
    let docs = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?;
    Ok(docs.join("Marginalia").to_string_lossy().into_owned())
}

/// After S18, reattach CI fixture library for S03–S17 disk assertions.
#[tauri::command]
pub fn smoke_adopt_fixture_library(app: AppHandle) -> Result<String, String> {
    if !smoke_mode() {
        return Err("Smoke mode is disabled".into());
    }
    let lib = std::env::var("MARGINALIA_SMOKE_LIBRARY").map_err(|_| {
        "MARGINALIA_SMOKE_LIBRARY not set".to_string()
    })?;
    crate::allow_library_path(app, lib.clone())?;
    Ok(lib)
}

/// Capability gate: dialog plugin allowed in main window (see capabilities/default.json).
#[tauri::command]
pub fn smoke_dialog_capable() -> bool {
    if !smoke_mode() {
        return false;
    }
    const CAPS: &str = include_str!("../capabilities/default.json");
    CAPS.contains("dialog:allow-open")
}

/// CI: first text paragraph from fixture EPUB (chapter.xhtml), without foliate DOM.
#[tauri::command]
pub fn smoke_epub_fixture_paragraph() -> Result<String, String> {
    if !smoke_mode() {
        return Err("Smoke mode is disabled".into());
    }
    let path = std::env::var("MARGINALIA_FIXTURE_EPUB").map_err(|e| e.to_string())?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let re_body = regex::Regex::new(r"(?is)<body[^>]*>(.*?)</body>").map_err(|e| e.to_string())?;
    let re_tags = regex::Regex::new(r"<[^>]+>").map_err(|e| e.to_string())?;
    use std::io::Read;
    let mut best = String::new();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_lowercase();
        if !(name.ends_with(".xhtml") || name.ends_with(".html") || name.ends_with(".htm")) {
            continue;
        }
        if name.contains("nav") || name.contains("toc") {
            continue;
        }
        let mut xml = String::new();
        entry.read_to_string(&mut xml).map_err(|e| e.to_string())?;
        let body = re_body
            .captures(&xml)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str())
            .unwrap_or(&xml);
        let text = re_tags.replace_all(body, " ").to_string();
        let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
        if collapsed.len() > best.len() {
            best = collapsed;
        }
    }
    if best.len() < 3 {
        return Err("fixture epub has no readable text".into());
    }
    Ok(best.chars().take(240).collect())
}

/// CI: read a UTF-8 file under the smoke library (e.g. `knihy/<slug>.md`, `citace/...`).
#[tauri::command]
pub fn smoke_read_library_text(library_root: String, relative_path: String) -> Result<String, String> {
    if !smoke_mode() {
        return Err("Smoke mode is disabled".into());
    }
    if relative_path.contains("..") || relative_path.starts_with('/') || relative_path.starts_with('\\') {
        return Err("relative_path must stay inside library".into());
    }
    let path = std::path::Path::new(&library_root).join(&relative_path);
    if !path.starts_with(&library_root) {
        return Err("path escapes library root".into());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn smoke_list_quote_files(library_root: String, book_slug: String) -> Result<Vec<String>, String> {
    if !smoke_mode() {
        return Err("Smoke mode is disabled".into());
    }
    let dir = std::path::Path::new(&library_root)
        .join("citace")
        .join(&book_slug);
    let mut out = Vec::new();
    if !dir.is_dir() {
        return Ok(out);
    }
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                out.push(name.to_string());
            }
        }
    }
    out.sort();
    Ok(out)
}

/// CI: copy a fixture file into the library folder (rescan / „Obnovit knihy ze složky“).
#[tauri::command]
pub fn smoke_stage_file_in_library(
    library_root: String,
    dest_file_name: String,
    source_path: String,
) -> Result<String, String> {
    if !smoke_mode() {
        return Err("Smoke mode is disabled".into());
    }
    let src = std::path::Path::new(&source_path);
    if !src.is_file() {
        return Err(format!("source missing: {source_path}"));
    }
    let dest = std::path::Path::new(&library_root).join(&dest_file_name);
    if dest_file_name.contains("..") || std::path::Path::new(&dest_file_name).is_absolute() {
        return Err("dest_file_name must be a simple file name".into());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}