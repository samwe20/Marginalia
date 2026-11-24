use rusqlite::{params, Connection};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use tauri::State;

use crate::index::IndexState;

fn link_db_path(state: &State<IndexState>) -> Result<PathBuf, String> {
    let base = state
        .db_path
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "Index not opened".to_string())?;
    Ok(base.with_file_name("links-index.sqlite"))
}

fn open_link_db(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS links (
            source_path TEXT NOT NULL,
            source_kind TEXT NOT NULL,
            target_path TEXT,
            raw_title TEXT NOT NULL,
            snippet TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);
        "#,
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

#[derive(Debug, Deserialize)]
pub struct LinkRow {
    pub source_path: String,
    pub source_kind: String,
    pub target_path: Option<String>,
    pub raw_title: String,
    pub snippet: String,
}

#[derive(Debug, serde::Serialize)]
pub struct BacklinkRow {
    pub source_path: String,
    pub source_kind: String,
    pub raw_title: String,
    pub snippet: String,
}

#[tauri::command]
pub fn link_index_rebuild(state: State<IndexState>, rows: Vec<LinkRow>) -> Result<u32, String> {
    let path = link_db_path(&state)?;
    let conn = open_link_db(&path)?;
    conn.execute("DELETE FROM links", []).map_err(|e| e.to_string())?;
    for row in &rows {
        conn.execute(
            "INSERT INTO links (source_path, source_kind, target_path, raw_title, snippet)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                row.source_path,
                row.source_kind,
                row.target_path,
                row.raw_title,
                row.snippet
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(rows.len() as u32)
}

#[tauri::command]
pub fn link_index_backlinks(state: State<IndexState>, target_path: String) -> Result<Vec<BacklinkRow>, String> {
    let path = link_db_path(&state)?;
    let conn = open_link_db(&path)?;
    let mut stmt = conn
        .prepare(
            "SELECT source_path, source_kind, raw_title, snippet FROM links WHERE target_path = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![target_path], |row| {
            Ok(BacklinkRow {
                source_path: row.get(0)?,
                source_kind: row.get(1)?,
                raw_title: row.get(2)?,
                snippet: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_and_reads_backlinks() {
        let db = std::env::temp_dir().join(format!("marginalia-links-test-{}.sqlite", std::process::id()));
        let _ = std::fs::remove_file(&db);
        let conn = open_link_db(&db).unwrap();
        conn.execute("DELETE FROM links", []).unwrap();
        conn.execute(
            "INSERT INTO links (source_path, source_kind, target_path, raw_title, snippet)
             VALUES ('poznamky/a.md', 'note', 'knihy/demo-babicka', 'Babička', 'snippet')",
            [],
        )
        .unwrap();
        let mut stmt = conn
            .prepare("SELECT source_path, source_kind, raw_title, snippet FROM links WHERE target_path = ?1")
            .unwrap();
        let count = stmt
            .query_map(params!["knihy/demo-babicka"], |_| Ok(()))
            .unwrap()
            .count();
        assert_eq!(count, 1);
    }
}