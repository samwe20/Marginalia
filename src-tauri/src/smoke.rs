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

#[derive(Clone, Serialize)]
pub struct SmokeDropPayload {
    pub library_root: String,
    pub file_path: String,
}

/// CI: same ingest path as library drag&drop (absolute fixture path).
#[tauri::command]
pub fn smoke_drop_book(app: AppHandle, library_root: String, file_path: String) -> Result<(), String> {
    if !smoke_mode() {
        return Err("Smoke mode is disabled (set MARGINALIA_SMOKE=1)".into());
    }
    let path = std::path::Path::new(&file_path);
    if !path.is_absolute() {
        return Err("file_path must be absolute".into());
    }
    app.emit(
        "marginalia-smoke-drop",
        SmokeDropPayload {
            library_root,
            file_path,
        },
    )
    .map_err(|e| e.to_string())
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
    let mut chapter = archive.by_name("chapter.xhtml").map_err(|e| e.to_string())?;
    let mut xml = String::new();
    use std::io::Read;
    chapter.read_to_string(&mut xml).map_err(|e| e.to_string())?;
    let re_body = regex::Regex::new(r"(?is)<body[^>]*>(.*?)</body>").map_err(|e| e.to_string())?;
    let body = re_body
        .captures(&xml)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str())
        .unwrap_or(&xml);
    let re_tags = regex::Regex::new(r"<[^>]+>").map_err(|e| e.to_string())?;
    let text = re_tags.replace_all(body, " ").to_string();
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.len() < 3 {
        return Err("fixture epub has no readable text".into());
    }
    Ok(collapsed)
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