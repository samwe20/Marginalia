import { ulid } from "ulidx";
import type { Anchor } from "./anchor";
import {
  findBookCardByPath,
  findBookCardBySha256,
  loadBookCard,
  saveBookCard,
  type ParsedBookCard,
} from "./book-library";
import { migrateBibliographyFromCard } from "./book-bibliography";
import { bookSlug, LIBRARY_SUBDIRS, quotePath } from "./paths";
import {
  extractQuoteBodyForIndex,
  formatQuoteMarkdown,
  parseQuoteMarkdown,
  type QuoteDocument,
} from "./quote-markdown";
import { rebuildNotesSearchIndex } from "./note-search-index";
import { isTauri } from "./runtime";

export interface BookMeta {
  title: string;
  author: string;
  sha256: string;
  filePath: string;
}

export interface SavedQuote {
  doc: QuoteDocument;
  relativePath: string;
}

async function writeText(path: string, content: string): Promise<void> {
  if (isTauri()) {
    const { mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
    const dir = path.replace(/[/\\][^/\\]+$/, "");
    await mkdir(dir, { recursive: true });
    await writeTextFile(path, content);
    return;
  }
  const key = `marginalia:${path}`;
  localStorage.setItem(key, content);
}

async function indexUpsert(doc: QuoteDocument, absPath: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("index_upsert_quote", {
    row: {
      quote_id: doc.meta.id,
      book_slug: doc.meta.book_slug,
      book_title: doc.meta.book_title,
      author: doc.meta.author,
      body: extractQuoteBodyForIndex(doc),
      path: absPath,
      updated_at: doc.meta.updated,
    },
  });
}

/**
 * Upsert a book card. Identity is stable by content hash (then path), never by title —
 * renaming bibliography must not create a second card/slug.
 */
export async function ensureBookCard(
  libraryRoot: string,
  book: BookMeta,
  opts: { slug?: string; /** Bulk scan already resolved identity via sha/path index — skip O(n) disk walks. */ trustCallerIdentity?: boolean } = {},
): Promise<string> {
  const now = new Date().toISOString();
  let slug = opts.slug?.trim() || "";
  let existing: ParsedBookCard | null = slug ? await loadBookCard(libraryRoot, slug) : null;

  if (!opts.trustCallerIdentity) {
    if (!existing && book.sha256) {
      const bySha = await findBookCardBySha256(libraryRoot, book.sha256);
      if (bySha) {
        slug = bySha.slug;
        existing = bySha.card;
      }
    }
    if (!existing && book.filePath) {
      const byPath = await findBookCardByPath(libraryRoot, book.filePath);
      if (byPath) {
        slug = byPath.slug;
        existing = byPath.card;
      }
    }
  }
  if (!slug) slug = bookSlug(book.title, book.sha256);
  if (!existing) existing = await loadBookCard(libraryRoot, slug);

  const card: ParsedBookCard = existing ?? {
    title: book.title,
    author: book.author,
    sha256: book.sha256,
    path: book.filePath,
    updated: now,
    bibliography: migrateBibliographyFromCard(book.title, book.author, null),
    bibliographyUserEdited: false,
  };
  // Title/author updates stay on the same slug; never re-key identity from metadata.
  if (book.title.trim()) card.title = book.title;
  if (book.author.trim()) card.author = book.author;
  if (book.sha256.trim()) card.sha256 = book.sha256;
  if (book.filePath.trim()) card.path = book.filePath;
  card.updated = now;
  if (!existing) {
    card.bibliography = migrateBibliographyFromCard(book.title, book.author, null);
  }
  await saveBookCard(libraryRoot, slug, card);
  return slug;
}

async function indexRemoveQuote(quoteId: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("index_remove_quote", { quoteId });
  } catch {
    /* index optional */
  }
}

/** Soft-delete payload for undo — full markdown document + path. */
export type DeletedQuoteSnapshot = {
  libraryRoot: string;
  slug: string;
  absPath: string;
  doc: QuoteDocument;
  rawMarkdown: string;
};

export async function deleteQuote(
  libraryRoot: string,
  slug: string,
  quoteId: string,
): Promise<DeletedQuoteSnapshot | null> {
  const path = quotePath(libraryRoot, slug, quoteId);
  let raw = "";
  if (isTauri()) {
    const { readTextFile, remove, exists } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(path))) return null;
    raw = await readTextFile(path);
    await remove(path);
  } else {
    const key = `marginalia:${path}`;
    raw = localStorage.getItem(key) ?? "";
    if (!raw) return null;
    localStorage.removeItem(key);
  }
  const doc = parseQuoteMarkdown(raw);
  await indexRemoveQuote(quoteId);
  return { libraryRoot, slug, absPath: path, doc, rawMarkdown: raw };
}

export async function restoreDeletedQuote(snapshot: DeletedQuoteSnapshot): Promise<QuoteDocument> {
  const { absPath, rawMarkdown, doc } = snapshot;
  if (isTauri()) {
    const { mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
    const dir = absPath.replace(/[/\\][^/\\]+$/, "");
    await mkdir(dir, { recursive: true });
    await writeTextFile(absPath, rawMarkdown);
  } else {
    localStorage.setItem(`marginalia:${absPath}`, rawMarkdown);
  }
  await indexUpsert(doc, absPath);
  return doc;
}

export async function updateQuoteComment(
  libraryRoot: string,
  bookSlug: string,
  quoteId: string,
  comment: string,
): Promise<QuoteDocument | null> {
  const dir = `${libraryRoot}/citace/${bookSlug}`;
  const path = `${dir}/${quoteId}.md`;
  let raw: string;
  if (isTauri()) {
    const { readTextFile, writeTextFile } = await import("@tauri-apps/plugin-fs");
    try {
      raw = await readTextFile(path);
    } catch {
      return null;
    }
    const doc = parseQuoteMarkdown(raw);
    doc.comment = comment.trim();
    doc.meta.updated = new Date().toISOString();
    const md = formatQuoteMarkdown(doc);
    await writeTextFile(path, md);
    await indexUpsert(doc, path);
    return doc;
  }
  const key = `marginalia:${path}`;
  raw = localStorage.getItem(key) ?? "";
  if (!raw) return null;
  const doc = parseQuoteMarkdown(raw);
  doc.comment = comment.trim();
  doc.meta.updated = new Date().toISOString();
  localStorage.setItem(key, formatQuoteMarkdown(doc));
  return doc;
}

export async function saveQuote(
  libraryRoot: string,
  book: BookMeta,
  slug: string,
  quoteText: string,
  pageLabel: string,
  anchor: Anchor,
  comment = "",
): Promise<SavedQuote> {
  const id = ulid();
  const now = new Date().toISOString();
  const doc: QuoteDocument = {
    meta: {
      id,
      book_slug: slug,
      book_title: book.title,
      author: book.author,
      page: pageLabel,
      color: "yellow",
      tags: [],
      created: now,
      updated: now,
      anchor,
    },
    quoteText,
    comment,
  };
  const path = quotePath(libraryRoot, slug, id);
  const md = formatQuoteMarkdown(doc);
  await writeText(path, md);
  await indexUpsert(doc, path);
  return { doc, relativePath: path };
}


/** Rewrite live book title/author onto every quote file for a slug (bibliography sync). */
export async function syncQuotesBookMeta(
  libraryRoot: string,
  slug: string,
  meta: { title: string; author: string },
): Promise<number> {
  const docs = await loadQuotesForBook(libraryRoot, slug);
  let n = 0;
  for (const doc of docs) {
    const title = meta.title.trim();
    const author = meta.author.trim();
    if (doc.meta.book_title === title && doc.meta.author === author) continue;
    doc.meta.book_title = title || doc.meta.book_title;
    doc.meta.author = author || doc.meta.author;
    doc.meta.updated = new Date().toISOString();
    const path = quotePath(libraryRoot, slug, doc.meta.id);
    await writeText(path, formatQuoteMarkdown(doc));
    await indexUpsert(doc, path);
    n += 1;
  }
  return n;
}

export async function loadAllQuotesFromLibrary(libraryRoot: string): Promise<QuoteDocument[]> {
  if (!libraryRoot) return [];
  const root = `${libraryRoot}/${LIBRARY_SUBDIRS.quotes}`;
  const docs: QuoteDocument[] = [];
  if (isTauri()) {
    const { readDir } = await import("@tauri-apps/plugin-fs");
    try {
      const slugs = await readDir(root);
      for (const s of slugs) {
        if (!s.isDirectory || !s.name) continue;
        try {
          docs.push(...(await loadQuotesForBook(libraryRoot, s.name)));
        } catch {
          /* skip unreadable quote dirs */
        }
      }
    } catch {
      return [];
    }
    return docs.sort((a, b) => b.meta.updated.localeCompare(a.meta.updated));
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("marginalia:") && key.includes("/citace/") && key.endsWith(".md")) {
      docs.push(parseQuoteMarkdown(localStorage.getItem(key)!));
    }
  }
  return docs;
}

export async function loadQuotesForBook(libraryRoot: string, slug: string): Promise<QuoteDocument[]> {
  const dir = `${libraryRoot}/citace/${slug}`;
  const docs: QuoteDocument[] = [];
  if (isTauri()) {
    const { readDir, readTextFile } = await import("@tauri-apps/plugin-fs");
    try {
      const entries = await readDir(dir);
      for (const e of entries) {
        if (e.isFile && e.name?.endsWith(".md")) {
          try {
            const text = await readTextFile(`${dir}/${e.name}`);
            docs.push(parseQuoteMarkdown(text));
          } catch {
            /* skip corrupt quote files */
          }
        }
      }
    } catch {
      return [];
    }
    return docs;
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("marginalia:") && key.includes(`/citace/${slug}/`) && key.endsWith(".md")) {
      docs.push(parseQuoteMarkdown(localStorage.getItem(key)!));
    }
  }
  return docs.filter((d) => d.meta.book_slug === slug);
}

export async function openLibraryIndex(libraryRoot?: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("index_open");
  if (libraryRoot) await rebuildNotesSearchIndex(libraryRoot);
}