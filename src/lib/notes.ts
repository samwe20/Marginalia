import { ulid } from "ulidx";
import { indexRemoveNote, indexUpsertNote } from "./note-search-index";
import { isTauri } from "./runtime";

export interface LibraryNote {
  id: string;
  title: string;
  filename: string;
  body: string;
  created: string;
  updated: string;
}

const DEMO_NOTES_KEY = "marginalia.notes";

function notePath(libraryRoot: string, filename: string): string {
  return `${libraryRoot}/poznamky/${filename}`;
}

function parseNoteFile(content: string, filename: string): LibraryNote | null {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const fm = m[1];
  const body = m[2].replace(/^\n/, "");
  const pick = (key: string) => {
    const line = fm.split("\n").find((l) => l.startsWith(`${key}:`));
    if (!line) return "";
    let v = line.slice(key.length + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      try {
        v = JSON.parse(v.replace(/^'/, '"').replace(/'$/, '"'));
      } catch {
        v = v.slice(1, -1);
      }
    }
    return v;
  };
  const id = pick("id") || filename.replace(/\.md$/i, "");
  return {
    id,
    title: pick("title") || filename.replace(/\.md$/i, ""),
    filename,
    body,
    created: pick("created") || new Date().toISOString(),
    updated: pick("updated") || new Date().toISOString(),
  };
}

function formatNoteFile(note: LibraryNote): string {
  return `---
id: ${note.id}
title: ${JSON.stringify(note.title)}
created: ${note.created}
updated: ${note.updated}
---
${note.body.endsWith("\n") ? note.body : `${note.body}\n`}`;
}

export async function listNotes(libraryRoot: string): Promise<LibraryNote[]> {
  if (!libraryRoot) return listLocalNotes();
  if (isTauri()) {
    const { readDir, readTextFile } = await import("@tauri-apps/plugin-fs");
    const dir = `${libraryRoot}/poznamky`;
    try {
      const entries = await readDir(dir);
      const notes: LibraryNote[] = [];
      for (const e of entries) {
        if (e.isFile && e.name?.endsWith(".md")) {
          const text = await readTextFile(`${dir}/${e.name}`);
          const n = parseNoteFile(text, e.name);
          if (n) notes.push(n);
        }
      }
      return notes.sort((a, b) => b.updated.localeCompare(a.updated));
    } catch {
      return [];
    }
  }
  return listLocalNotes();
}

function listLocalNotes(): LibraryNote[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_NOTES_KEY) ?? "[]") as LibraryNote[];
  } catch {
    return [];
  }
}

function saveLocalNotes(notes: LibraryNote[]) {
  localStorage.setItem(DEMO_NOTES_KEY, JSON.stringify(notes));
}

export async function saveNote(libraryRoot: string, note: LibraryNote): Promise<void> {
  const payload = formatNoteFile(note);
  if (isTauri() && libraryRoot) {
    const { mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = notePath(libraryRoot, note.filename);
    await mkdir(`${libraryRoot}/poznamky`, { recursive: true });
    await writeTextFile(path, payload);
    await indexUpsertNote(libraryRoot, note);
    return;
  }
  const list = listLocalNotes();
  const idx = list.findIndex((n) => n.id === note.id);
  if (idx >= 0) list[idx] = note;
  else list.unshift(note);
  saveLocalNotes(list);
}

export async function deleteNote(libraryRoot: string, id: string): Promise<void> {
  if (isTauri() && libraryRoot) {
    const notes = await listNotes(libraryRoot);
    const note = notes.find((n) => n.id === id);
    if (note) {
      const { remove } = await import("@tauri-apps/plugin-fs");
      await remove(notePath(libraryRoot, note.filename));
      await indexRemoveNote(note.id);
    }
    return;
  }
  saveLocalNotes(listLocalNotes().filter((n) => n.id !== id));
}

export const DEFAULT_NOTE_TITLE = "Bez názvu";

/** Same rule as Folio: a portable filename that can move between Windows, macOS and the web. */
export function safeNoteTitle(title: string): string {
  let safe = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .replace(/[. ]+$/, "");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
  return safe || DEFAULT_NOTE_TITLE;
}

async function noteFileExists(libraryRoot: string, filename: string): Promise<boolean> {
  if (isTauri() && libraryRoot) {
    const { exists } = await import("@tauri-apps/plugin-fs");
    return exists(notePath(libraryRoot, filename));
  }
  const lower = filename.toLowerCase();
  return listLocalNotes().some((n) => n.filename.toLowerCase() === lower);
}

/** Folio: `Title.md`, then `Title 2.md`, `Title 3.md`… — never an existing file (except `ownFilename`). */
async function freeNoteFilename(libraryRoot: string, title: string, ownFilename?: string): Promise<string> {
  const safe = safeNoteTitle(title);
  const own = ownFilename?.toLowerCase();
  let filename = `${safe}.md`;
  for (let i = 2; filename.toLowerCase() !== own && (await noteFileExists(libraryRoot, filename)); i += 1) {
    filename = `${safe} ${i}.md`;
  }
  return filename;
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, "");
}

/** Creates and saves a new note file; never overwrites an existing note. */
export async function createNote(libraryRoot: string, title: string, body?: string): Promise<LibraryNote> {
  const filename = await freeNoteFilename(libraryRoot, title);
  const now = new Date().toISOString();
  const finalTitle = titleFromFilename(filename);
  const note: LibraryNote = {
    id: ulid(),
    title: finalTitle,
    filename,
    body: body ?? `# ${finalTitle}\n\n`,
    created: now,
    updated: now,
  };
  await saveNote(libraryRoot, note);
  return note;
}

/** Folio: renaming the title renames the file; a taken name gets ` 2`, ` 3`… */
export async function renameNote(libraryRoot: string, note: LibraryNote, newTitle: string): Promise<LibraryNote> {
  const filename = await freeNoteFilename(libraryRoot, newTitle, note.filename);
  const renamed: LibraryNote = {
    ...note,
    title: titleFromFilename(filename),
    filename,
    updated: new Date().toISOString(),
  };
  if (isTauri() && libraryRoot && filename !== note.filename) {
    const { rename } = await import("@tauri-apps/plugin-fs");
    await rename(notePath(libraryRoot, note.filename), notePath(libraryRoot, filename));
    await indexRemoveNote(note.id);
  }
  await saveNote(libraryRoot, renamed);
  return renamed;
}