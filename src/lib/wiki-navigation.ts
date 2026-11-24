import type { NoteIndex } from "./noteIndex";
import { bookIndexPath, noteIndexPath, quoteIndexPath } from "./marginalia-paths";
import { getDemoBook, getDemoQuote } from "./demo-data";
import { createNote } from "./notes";
import type { NoteMeta } from "../types/folio";

export interface WikiNavigationHandlers {
  openBookDetail: (slug: string) => void;
  openQuoteDetail: (id: string) => void;
  /** Open a library quote in the reader at its locus (PDF/EPUB/MOBI). */
  openLibraryQuote: (quoteId: string) => void;
  openNoteEditor: (noteId: string) => void;
  createNoteWithTitle: (title: string) => Promise<void>;
  toast: (msg: string, kind?: "info" | "error" | "success") => void;
}

export function openWikiTarget(
  index: NoteIndex,
  title: string,
  createIfMissing: boolean,
  handlers: WikiNavigationHandlers,
): void {
  const hit = index.resolve(title);
  if (!hit) {
    if (!createIfMissing) {
      handlers.toast(`Odkaz „${title}“ nenalezen`, "info");
      return;
    }
    if (window.confirm(`Vytvořit novou poznámku „${title}"?`)) {
      void handlers.createNoteWithTitle(title);
    }
    return;
  }
  if (hit.kind === "book" || hit.path.startsWith("knihy/")) {
    const slug = hit.id;
    const demo = getDemoBook(slug);
    if (demo) handlers.openBookDetail(slug);
    else handlers.toast(`Kniha „${hit.title}" — otevřete soubor z knihovny.`, "info");
    return;
  }
  if (hit.kind === "quote" || hit.path.startsWith("citace/")) {
    const id = hit.id || hit.path.replace(/^citace\//, "");
    if (getDemoQuote(id)) handlers.openQuoteDetail(id);
    else handlers.openLibraryQuote(id);
    return;
  }
  handlers.openNoteEditor(hit.id);
}

export function indexPathForDemoBook(slug: string): string {
  return bookIndexPath(slug);
}

export function indexPathForDemoQuote(id: string): string {
  return quoteIndexPath(id);
}

export function indexPathForNoteFilename(filename: string): string {
  return noteIndexPath(filename);
}

export async function createNoteFromTitle(
  libraryRoot: string,
  title: string,
  index: NoteIndex,
  handlers: Pick<WikiNavigationHandlers, "openNoteEditor" | "toast">,
): Promise<void> {
  const note = await createNote(libraryRoot, title);
  handlers.toast("Poznámka vytvořena", "success");
  const meta: NoteMeta = {
    id: note.id,
    title: note.title,
    path: noteIndexPath(note.filename),
    relativePath: noteIndexPath(note.filename),
    mtime: Date.now(),
    createdAt: Date.parse(note.created),
    kind: "note",
  };
  index.setNotes([...index.getNotes(), meta]);
  index.setContent(meta.path, note.body);
  index.registerAlias(note.title, meta);
  handlers.openNoteEditor(note.id);
}
