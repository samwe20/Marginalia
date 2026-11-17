mod index;
mod library;
mod links;
mod smoke;

use index::IndexState;
use std::path::Path;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

#[cfg(windows)]
fn remember_library_root_for_installer(app: &tauri::AppHandle, path: &Path) -> Result<(), String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key_path = format!(r"Software\{}", app.config().identifier);
    let (key, _) = hkcu.create_subkey(key_path).map_err(|e| e.to_string())?;
    let value = path.to_string_lossy().into_owned();
    key.set_value("LibraryRoot", &value)
        .map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn remember_library_root_for_installer(
    _app: &tauri::AppHandle,
    _path: &Path,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn allow_library_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let path = Path::new(&path);
    if !path.is_absolute() {
        return Err("Library path must be absolute".into());
    }
    app.fs_scope()
        .allow_directory(path, true)
        .map_err(|e| e.to_string())?;
    app.asset_protocol_scope()
        .allow_directory(path, true)
        .map_err(|e| e.to_string())?;
    remember_library_root_for_installer(&app, path)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(IndexState::default())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            allow_library_path,
            index::index_open,
            index::index_rebuild,
            index::index_upsert_quote,
            index::index_remove_quote,
            index::index_upsert_note,
            index::index_remove_note,
            index::index_rebuild_notes,
            index::index_search,
            links::link_index_rebuild,
            links::link_index_backlinks,
            library::sha256_file,
            smoke::smoke_is_enabled,
            smoke::smoke_fixture_paths,
            smoke::smoke_open_book,
            smoke::smoke_drop_book,
            smoke::smoke_dialog_capable,
            smoke::smoke_list_quote_files,
            smoke::smoke_read_library_text,
            smoke::smoke_epub_fixture_paragraph,
            smoke::smoke_defer_fixture_library,
            smoke::smoke_reset_first_run,
            smoke::smoke_expected_documents_library,
            smoke::smoke_adopt_fixture_library,
            smoke::smoke_stage_file_in_library,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Marginalia");
}
