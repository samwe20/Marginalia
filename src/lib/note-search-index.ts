import { listNotes, type LibraryNote } from "./notes";
import { isTauri } from "./runtime";

export async function indexUpsertNote(libraryRoot: string, note: LibraryNote): Promise<void> {
  if (!isTauri() || !libraryRoot) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("index_upsert_note", {
    row: {
      note_id: note.id,
      title: note.title,
      body: note.body,
      path: `${libraryRoot}/poznamky/${note.filename}`,
      updated_at: note.updated,
    },
  });
}

export async function indexRemoveNote(noteId: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("index_remove_note", { note_id: noteId });
}

export async function rebuildNotesSearchIndex(libraryRoot: string): Promise<void> {
  if (!isTauri() || !libraryRoot) return;
  const notes = await listNotes(libraryRoot);
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("index_rebuild_notes", {
    rows: notes.map((n) => ({
      note_id: n.id,
      title: n.title,
      body: n.body,
      path: `${libraryRoot}/poznamky/${n.filename}`,
      updated_at: n.updated,
    })),
  });
}

/** Web / fallback substring search over in-app stored notes. */
export function searchNotesLocal(notes: LibraryNote[], query: string, limit = 20): LibraryNote[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return notes
    .filter((n) => `${n.title}\n${n.body}`.toLowerCase().includes(q))
    .slice(0, limit);
}

export function snippetForNote(note: LibraryNote, query: string, radius = 40): string {
  const hay = `${note.title}\n${note.body}`;
  const idx = hay.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx < 0) return note.title;
  const start = Math.max(0, idx - radius);
  const end = Math.min(hay.length, idx + query.length + radius);
  let s = hay.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) s = `…${s}`;
  if (end < hay.length) s = `${s}…`;
  return s;
}