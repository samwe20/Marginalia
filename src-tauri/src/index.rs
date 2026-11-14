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
    pub hit_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quote_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_title: Option<String>,
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
        CREATE TABLE IF NOT EXISTS notes (
            note_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            path TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            note_id UNINDEXED,
            title,
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

#[derive(Debug, Deserialize)]
pub struct NoteIndexRow {
    pub note_id: String,
    pub title: String,
    pub body: String,
    pub path: String,
    pub updated_at: String,
}

fn note_fts_text(title: &str, body: &str) -> String {
    format!("{title}\n{body}")
}

fn upsert_note_in_conn(conn: &Connection, row: &NoteIndexRow) -> Result<(), String> {
    conn.execute(
        "INSERT INTO notes (note_id, title, body, path, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(note_id) DO UPDATE SET
           title=excluded.title,
           body=excluded.body,
           path=excluded.path,
           updated_at=excluded.updated_at",
        params![row.note_id, row.title, row.body, row.path, row.updated_at],
    )
    .map_err(|e| e.to_string())?;
    let fts = note_fts_text(&row.title, &row.body);
    conn.execute(
        "DELETE FROM notes_fts WHERE note_id = ?1",
        params![row.note_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO notes_fts (note_id, title, text) VALUES (?1, ?2, ?3)",
        params![row.note_id, row.title, fts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn index_upsert_note(state: State<IndexState>, row: NoteIndexRow) -> Result<(), String> {
    let path = db_path(&state)?;
    let conn = open_db(&path)?;
    upsert_note_in_conn(&conn, &row)
}

#[tauri::command]
pub fn index_remove_note(state: State<IndexState>, note_id: String) -> Result<(), String> {
    let path = db_path(&state)?;
    let conn = open_db(&path)?;
    conn.execute("DELETE FROM notes WHERE note_id = ?1", params![note_id])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM notes_fts WHERE note_id = ?1",
        params![note_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn index_rebuild_notes(state: State<IndexState>, rows: Vec<NoteIndexRow>) -> Result<u32, String> {
    let path = db_path(&state)?;
    let conn = open_db(&path)?;
    conn.execute("DELETE FROM notes", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes_fts", [])
        .map_err(|e| e.to_string())?;
    for row in &rows {
        upsert_note_in_conn(&conn, &row)?;
    }
    Ok(rows.len() as u32)
}

fn prepare_fts_query(query: &str) -> Option<String> {
    let fts_query = query
        .split_whitespace()
        .map(|t| format!("\"{}\"", t.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" ");
    if fts_query.is_empty() {
        None
    } else {
        Some(fts_query)
    }
}

#[tauri::command]
pub fn index_search(state: State<IndexState>, query: String, limit: u32) -> Result<Vec<IndexHit>, String> {
    let path = db_path(&state)?;
    let conn = open_db(&path)?;
    let Some(fts_query) = prepare_fts_query(&query) else {
        return Ok(vec![]);
    };
    let per_kind = limit.max(1);
    let mut hits: Vec<IndexHit> = Vec::new();

    let mut quote_stmt = conn
        .prepare(
            "SELECT quote_id, book_slug, text, snippet(quotes_fts, 2, '[', ']', '…', 32)
             FROM quotes_fts WHERE quotes_fts MATCH ?1 LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let quote_hits = quote_stmt
        .query_map(params![fts_query, per_kind], |row| {
            Ok(IndexHit {
                hit_kind: "quote".into(),
                quote_id: Some(row.get(0)?),
                book_slug: Some(row.get(1)?),
                note_id: None,
                note_title: None,
                text: row.get(2)?,
                snippet: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    hits.extend(quote_hits);

    let mut note_stmt = conn
        .prepare(
            "SELECT note_id, title, text, snippet(notes_fts, 2, '[', ']', '…', 32)
             FROM notes_fts WHERE notes_fts MATCH ?1 LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let note_hits = note_stmt
        .query_map(params![fts_query, per_kind], |row| {
            Ok(IndexHit {
                hit_kind: "note".into(),
                quote_id: None,
                book_slug: None,
                note_id: Some(row.get(0)?),
                note_title: Some(row.get(1)?),
                text: row.get(2)?,
                snippet: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    hits.extend(note_hits);
    hits.truncate(limit as usize);
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

    #[test]
    fn fts_search_finds_note_in_poznamky() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("test.sqlite");
        let conn = open_db(&db).unwrap();
        let row = NoteIndexRow {
            note_id: "n1".into(),
            title: "Čtenářský deník".into(),
            body: "Poznámka o [[Hamlet]] a ironii.".into(),
            path: "/lib/poznamky/ctenarsky-denik.md".into(),
            updated_at: "2026-01-01".into(),
        };
        upsert_note_in_conn(&conn, &row).unwrap();
        let mut stmt = conn
            .prepare("SELECT note_id FROM notes_fts WHERE notes_fts MATCH '\"ironie\"'")
            .unwrap();
        let ids: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(Result::ok)
            .collect();
        assert_eq!(ids, vec!["n1"]);
    }
}