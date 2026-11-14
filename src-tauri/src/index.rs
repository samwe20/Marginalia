use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct IndexState {
    pub db_path: Mutex<Option<PathBuf>>,
}

impl Default for IndexState {
    fn default() -> Self {
        Self {
            db_path: Mutex::new(None),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IndexHit {
    pub quote_id: String,
    pub book_slug: String,
    pub text: String,
    pub snippet: String,
}

fn open_db(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
  let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS quotes (
            quote_id TEXT PRIMARY KEY,
            book_slug TEXT NOT NULL,
            book_title TEXT,
            author TEXT,
            body TEXT NOT NULL,
            path TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS quotes_fts USING fts5(
            quote_id UNINDEXED,
            book_slug UNINDEXED,
            text,
            tokenize = 'unicode61'
        );
        "#,
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

#[tauri::command]
pub fn index_open(app: AppHandle, state: State<IndexState>) -> Result<(), String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    let db_path = dir.join("quotes-index.sqlite");
    *state.db_path.lock().map_err(|e| e.to_string())? = Some(db_path);
    Ok(())
}

fn db_path(state: &State<IndexState>) -> Result<PathBuf, String> {
    state
        .db_path
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "Index not opened".into())
}

#[derive(Debug, Deserialize)]
pub struct QuoteIndexRow {
    pub quote_id: String,
    pub book_slug: String,
    pub book_title: Option<String>,
    pub author: Option<String>,
    pub body: String,
    pub path: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn index_upsert_quote(state: State<IndexState>, row: QuoteIndexRow) -> Result<(), String> {
    let path = db_path(&state)?;
    let conn = open_db(&path)?;
    upsert_in_conn(&conn, &row)
}

#[tauri::command]
pub fn index_remove_quote(state: State<IndexState>, quote_id: String) -> Result<(), String> {
    let path = db_path(&state)?;
    let conn = open_db(&path)?;
    conn.execute("DELETE FROM quotes WHERE quote_id = ?1", params![quote_id])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM quotes_fts WHERE quote_id = ?1",
        params![quote_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn upsert_in_conn(conn: &Connection, row: &QuoteIndexRow) -> Result<(), String> {
    conn.execute(
        "INSERT INTO quotes (quote_id, book_slug, book_title, author, body, path, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(quote_id) DO UPDATE SET
           book_slug=excluded.book_slug,
           book_title=excluded.book_title,
           author=excluded.author,
           body=excluded.body,
           path=excluded.path,
           updated_at=excluded.updated_at",
        params![
            row.quote_id,
            row.book_slug,
            row.book_title,
            row.author,
            row.body,
            row.path,
            row.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM quotes_fts WHERE quote_id = ?1",
        params![row.quote_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO quotes_fts (quote_id, book_slug, text) VALUES (?1, ?2, ?3)",
        params![row.quote_id, row.book_slug, row.body],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn index_rebuild(state: State<IndexState>, rows: Vec<QuoteIndexRow>) -> Result<u32, String> {
    let path = db_path(&state)?;
    let conn = open_db(&path)?;
    conn.execute("DELETE FROM quotes", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM quotes_fts", [])
        .map_err(|e| e.to_string())?;
    for row in &rows {
        upsert_in_conn(&conn, row)?;
    }
    Ok(rows.len() as u32)
}

#[tauri::command]
pub fn index_search(state: State<IndexState>, query: String, limit: u32) -> Result<Vec<IndexHit>, String> {
    let path = db_path(&state)?;
    let conn = open_db(&path)?;
    let fts_query = query
        .split_whitespace()
        .map(|t| format!("\"{}\"", t.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ");
    if fts_query.is_empty() {
        return Ok(vec![]);
    }
    let mut stmt = conn
        .prepare(
            "SELECT quote_id, book_slug, text, snippet(quotes_fts, 2, '[', ']', '…', 32)
             FROM quotes_fts WHERE quotes_fts MATCH ?1 LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let hits = stmt
        .query_map(params![fts_query, limit], |row| {
            Ok(IndexHit {
                quote_id: row.get(0)?,
                book_slug: row.get(1)?,
                text: row.get(2)?,
                snippet: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fts_search_finds_quote() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("test.sqlite");
        let conn = open_db(&db).unwrap();
        conn.execute(
            "INSERT INTO quotes (quote_id, book_slug, book_title, author, body, path, updated_at)
             VALUES ('q1', 'book', 'T', 'A', 'The quick brown fox', '/x', '2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO quotes_fts (quote_id, book_slug, text) VALUES ('q1', 'book', 'The quick brown fox')",
            [],
        )
        .unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT quote_id FROM quotes_fts WHERE quotes_fts MATCH '\"quick\"'",
            )
            .unwrap();
        let ids: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(Result::ok)
            .collect();
        assert_eq!(ids, vec!["q1"]);
    }
}