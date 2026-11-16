import { ulid } from "ulidx";
import type { Anchor } from "./anchor";
import { bookCardPath, bookSlug, LIBRARY_SUBDIRS, quotePath } from "./paths";
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

export async function ensureBookCard(libraryRoot: string, book: BookMeta): Promise<string> {
  const slug = bookSlug(book.title, book.sha256);
  const path = bookCardPath(libraryRoot, slug);
  const now = new Date().toISOString();
  const body = `---\n\ntitle: ${JSON.stringify(book.title)}\nauthor: ${JSON.stringify(book.author)}\nsha256: ${book.sha256}\npath: ${JSON.stringify(book.filePath)}\nupdated: ${now}\n\n`;
  await writeText(path, body);
  return slug;
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
  return docs;
}

export async function openLibraryIndex(libraryRoot?: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("index_open");
  if (libraryRoot) await rebuildNotesSearchIndex(libraryRoot);
}