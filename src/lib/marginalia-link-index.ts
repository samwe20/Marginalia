import type { DemoBook, DemoNote, DemoQuote } from "./demo-data";
import { getDemoBooks, getDemoNotes, getDemoQuotes, isDemoEnabled } from "./demo-data";
import { type NoteIndex } from "./noteIndex";
import type { LibraryNote } from "./notes";
import { listNotes } from "./notes";
import type { NoteMeta } from "../types/folio";
import { bookIndexPath, noteIndexPath, quoteIndexPath } from "./marginalia-paths";
import { isTauri } from "./runtime";
import { loadAllQuotesFromLibrary } from "./storage";

function metaFromBook(b: DemoBook): NoteMeta {
  const path = bookIndexPath(b.slug);
  return {
    id: b.slug,
    title: b.title,
    path,
    relativePath: path,
    mtime: Date.now(),
    createdAt: null,
    kind: "book",
  };
}

function metaFromQuote(q: DemoQuote): NoteMeta {
  const path = quoteIndexPath(q.id);
  return {
    id: q.id,
    title: q.id,
    path,
    relativePath: path,
    mtime: Date.parse(q.created),
    createdAt: Date.parse(q.created),
    kind: "quote",
  };
}

function metaFromLibraryNote(n: LibraryNote): NoteMeta {
  const path = noteIndexPath(n.filename);
  return {
    id: n.id,
    title: n.title,
    path,
    relativePath: path,
    mtime: Date.parse(n.updated),
    createdAt: Date.parse(n.created),
    kind: "note",
  };
}

function metaFromDemoNote(n: DemoNote): NoteMeta {
  const path = noteIndexPath(n.filename);
  return {
    id: n.id,
    title: n.title,
    path,
    relativePath: path,
    mtime: Date.parse(n.updated),
    createdAt: Date.parse(n.created),
    kind: "note",
  };
}

export async function rebuildMarginaliaLinkIndex(
  index: NoteIndex,
  libraryRoot: string,
): Promise<void> {
  const metas: NoteMeta[] = [];
  const bookBySlug = new Map<string, DemoBook>();
  const quoteMetas: NoteMeta[] = [];

  if (isDemoEnabled()) {
    for (const b of getDemoBooks()) {
      bookBySlug.set(b.slug, b);
      metas.push(metaFromBook(b));
    }
    for (const q of getDemoQuotes()) {
      const m = metaFromQuote(q);
      quoteMetas.push(m);
      metas.push(m);
    }
    for (const n of getDemoNotes()) metas.push(metaFromDemoNote(n));
  }

  const notes = await listNotes(libraryRoot);
  for (const n of notes) metas.push(metaFromLibraryNote(n));

  const libraryQuotes = libraryRoot ? await loadAllQuotesFromLibrary(libraryRoot) : [];
  for (const q of libraryQuotes) {
    const path = quoteIndexPath(q.meta.id);
    metas.push({
      id: q.meta.id,
      title: q.meta.id,
      path,
      relativePath: path,
      mtime: Date.parse(q.meta.updated),
      createdAt: Date.parse(q.meta.created),
      kind: "quote",
    });
  }

  const dedup = new Map<string, NoteMeta>();
  for (const m of metas) dedup.set(m.path, m);
  index.setNotes([...dedup.values()]);

  for (const b of getDemoBooks()) {
    const m = dedup.get(bookIndexPath(b.slug));
    if (m) index.registerAlias(b.title, m);
  }
  for (const q of getDemoQuotes()) {
    const m = dedup.get(quoteIndexPath(q.id));
    if (!m) continue;
    index.registerAlias(q.id, m);
    const short = q.id.replace(/^demo-/, "");
    if (short !== q.id) index.registerAlias(short, m);
    const book = bookBySlug.get(q.bookSlug);
    if (book) index.registerAlias(`${book.title} — citace`, m);
  }
  for (const n of notes) {
    const m = dedup.get(noteIndexPath(n.filename));
    if (m) index.registerAlias(n.title, m);
  }
  for (const n of getDemoNotes()) {
    const m = dedup.get(noteIndexPath(n.filename));
    if (m) index.registerAlias(n.title, m);
  }

  if (isDemoEnabled()) {
    for (const q of getDemoQuotes()) {
      const body = q.comment.trim() ? q.comment : `> ${q.quoteText}`;
      index.setContent(quoteIndexPath(q.id), body);
    }
    for (const n of getDemoNotes()) index.setContent(noteIndexPath(n.filename), n.body);
  }
  for (const n of notes) index.setContent(noteIndexPath(n.filename), n.body);
  for (const q of libraryQuotes) {
    const body = q.comment.trim() ? q.comment : `> ${q.quoteText}`;
    const path = quoteIndexPath(q.meta.id);
    index.setContent(path, body);
    const m = dedup.get(path);
    if (m) {
      index.registerAlias(q.meta.id, m);
      if (q.meta.book_title.trim()) index.registerAlias(`${q.meta.book_title} — citace`, m);
    }
  }

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("link_index_rebuild", { rows: index.exportLinkRows() });
    } catch {
      /* optional until command is registered */
    }
  }
}