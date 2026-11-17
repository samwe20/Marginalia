import { detectBookFileKind } from "./book-formats";
import {
  type BookBibliography,
  emptyBibliography,
  formatAuthorsDisplay,
  migrateBibliographyFromCard,
} from "./book-bibliography";
import { bookCardPath, bookSlug } from "./paths";
import type { BookMeta } from "./storage";
import { isTauri } from "./runtime";

export interface ParsedBookCard {
  title: string;
  author: string;
  sha256: string;
  path: string;
  updated: string;
  bibliography: BookBibliography;
  bibliographyUserEdited: boolean;
}

export interface LibraryBookEntry {
  slug: string;
  kind: "pdf" | "epub" | "mobi";
  title: string;
  author: string;
  sha256: string;
  filePath: string;
  updated?: string;
}

/** Stable library identity: content hash first, then normalized path — never title/metadata. */
export function libraryEntryIdentityKey(
  b: Pick<LibraryBookEntry, "sha256" | "filePath" | "slug">,
): string {
  const sha = (b.sha256 || "").trim().toLowerCase();
  if (sha.length >= 8) return `sha:${sha}`;
  const path = normalizeLibraryPath(b.filePath);
  if (path) return `path:${path}`;
  return `slug:${b.slug}`;
}

export function normalizeLibraryPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
}

function preferLibraryEntry(a: LibraryBookEntry, b: LibraryBookEntry): LibraryBookEntry {
  // Prefer the richer / more recently touched record; keep a stable slug from either side.
  const aUpdated = a.updated || "";
  const bUpdated = b.updated || "";
  const newer = bUpdated > aUpdated ? b : a;
  const older = newer === a ? b : a;
  return {
    ...older,
    ...newer,
    slug: older.slug || newer.slug,
    filePath: newer.filePath || older.filePath,
    sha256: newer.sha256 || older.sha256,
    title: newer.title || older.title,
    author: newer.author || older.author,
  };
}

/**
 * Merge recent + on-disk cards. Dedupes by content hash (then path), so a bibliography
 * rename must never surface the same book twice under two title-derived slugs.
 */
export function mergeLibraryEntries(recent: LibraryBookEntry[], onDisk: LibraryBookEntry[]): LibraryBookEntry[] {
  const byId = new Map<string, LibraryBookEntry>();
  const order: string[] = [];
  const rememberOrder = (id: string) => {
    if (!order.includes(id)) order.push(id);
  };

  for (const b of onDisk) {
    const id = libraryEntryIdentityKey(b);
    const prev = byId.get(id);
    byId.set(id, prev ? preferLibraryEntry(prev, b) : b);
  }
  for (const b of recent) {
    const id = libraryEntryIdentityKey(b);
    rememberOrder(id);
    const prev = byId.get(id);
    byId.set(id, prev ? preferLibraryEntry(prev, b) : b);
  }

  // Also collapse accidental slug collisions that share neither sha nor path keying.
  const bySlug = new Map<string, LibraryBookEntry>();
  for (const b of byId.values()) {
    const prev = bySlug.get(b.slug);
    bySlug.set(b.slug, prev ? preferLibraryEntry(prev, b) : b);
  }

  return [...bySlug.values()].sort((a, b) => {
    const ia = order.indexOf(libraryEntryIdentityKey(a));
    const ib = order.indexOf(libraryEntryIdentityKey(b));
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return (b.updated || "").localeCompare(a.updated || "");
  });
}

/** Deduplicate a recent-books list in place (by sha/path). */
export function dedupeRecentBooks(books: LibraryBookEntry[]): LibraryBookEntry[] {
  return mergeLibraryEntries(books, []);
}

export interface BookCardRecord {
  slug: string;
  card: ParsedBookCard;
}

/** All book cards under knihy/*.md (desktop + web storage). */
export async function listBookCardsWithSlugs(libraryRoot: string): Promise<BookCardRecord[]> {
  if (!libraryRoot) return [];
  const out: BookCardRecord[] = [];
  if (isTauri()) {
    const { readDir, readTextFile } = await import("@tauri-apps/plugin-fs");
    const dir = `${libraryRoot}/knihy`;
    try {
      const entries = await readDir(dir);
      for (const e of entries) {
        if (!e.isFile || !e.name?.endsWith(".md")) continue;
        const slug = e.name.slice(0, -3);
        try {
          const card = parseBookCardYaml(await readTextFile(`${dir}/${e.name}`));
          if (card) out.push({ slug, card });
        } catch {
          /* skip corrupt cards */
        }
      }
    } catch {
      return [];
    }
    return out;
  }
  const prefix = `marginalia:${libraryRoot}/knihy/`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix) || !key.endsWith(".md")) continue;
    const slug = key.slice(prefix.length, -3);
    const text = localStorage.getItem(key);
    if (!text) continue;
    const card = parseBookCardYaml(text);
    if (card) out.push({ slug, card });
  }
  return out;
}

export async function findBookCardBySha256(
  libraryRoot: string,
  sha256: string,
): Promise<BookCardRecord | null> {
  const want = sha256.trim().toLowerCase();
  if (want.length < 8) return null;
  const all = await listBookCardsWithSlugs(libraryRoot);
  return all.find((r) => r.card.sha256.trim().toLowerCase() === want) ?? null;
}

export async function findBookCardByPath(
  libraryRoot: string,
  filePath: string,
): Promise<BookCardRecord | null> {
  const want = normalizeLibraryPath(filePath);
  if (!want) return null;
  const all = await listBookCardsWithSlugs(libraryRoot);
  return all.find((r) => normalizeLibraryPath(r.card.path) === want) ?? null;
}

/** Book cards persisted under knihovna/knihy/*.md (desktop source of truth). */
export async function listLibraryBooksFromDisk(libraryRoot: string): Promise<LibraryBookEntry[]> {
  if (!libraryRoot) return [];
  try {
    const records = await listBookCardsWithSlugs(libraryRoot);
    const books: LibraryBookEntry[] = [];
    for (const { slug, card } of records) {
      if (!card.path) continue;
      const kind: "pdf" | "epub" | "mobi" = detectBookFileKind(card.path) ?? "pdf";
      books.push({
        slug,
        kind,
        title: card.title || slug,
        author: card.author,
        sha256: card.sha256,
        filePath: card.path,
        updated: card.updated,
      });
    }
    books.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
    return books;
  } catch {
    return [];
  }
}

function bookExt(name: string): string {
  const lower = name.toLowerCase();
  const m = lower.match(/\.(pdf|epub|mobi|azw3?)$/);
  if (!m) return ".pdf";
  if (m[1]!.startsWith("azw")) return `.${m[1]}`;
  return `.${m[1]}`;
}

function binaryStorageKey(slug: string, ext: string): string {
  return `marginalia:bookbin:${slug}${ext}`;
}

function pickScalar(yamlBody: string, key: string): string {
  const line = yamlBody.split("\n").find((l) => l.startsWith(`${key}:`));
  if (!line) return "";
  const raw = line.slice(key.length + 1).trim();
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw.replace(/^"|"$/g, "");
  }
}

function pickBool(yamlBody: string, key: string): boolean {
  const v = pickScalar(yamlBody, key);
  return v === "true";
}

function pickBibliographyJson(yamlBody: string): BookBibliography | null {
  const line = yamlBody.split("\n").find((l) => l.startsWith("bibliography:"));
  if (!line) return null;
  const raw = line.slice("bibliography:".length).trim();
  try {
    const parsed = JSON.parse(raw) as BookBibliography;
    return { ...emptyBibliography(), ...parsed, authors: parsed.authors?.length ? parsed.authors : emptyBibliography().authors };
  } catch {
    return null;
  }
}

export function serializeBookCardYaml(card: ParsedBookCard): string {
  const author = card.author.trim() || formatAuthorsDisplay(card.bibliography.authors);
  const bibJson = JSON.stringify(card.bibliography);
  return `---\n\ntitle: ${JSON.stringify(card.title)}\nauthor: ${JSON.stringify(author)}\nsha256: ${card.sha256}\npath: ${JSON.stringify(card.path)}\nupdated: ${card.updated}\nbibliography: ${bibJson}\nbibliography_user_edited: ${card.bibliographyUserEdited ? "true" : "false"}\n\n`;
}

export function parseBookCardYaml(content: string): ParsedBookCard | null {
  const closed = content.match(/^---\n([\s\S]*?)\n---/);
  const open = closed ?? content.match(/^---\n([\s\S]*)$/);
  if (!open) return null;
  const body = open[1];
  const title = pickScalar(body, "title");
  const author = pickScalar(body, "author");
  const bibRaw = pickBibliographyJson(body);
  const bibliography = migrateBibliographyFromCard(title, author, bibRaw);
  return {
    title,
    author: author || formatAuthorsDisplay(bibliography.authors),
    sha256: pickScalar(body, "sha256"),
    path: pickScalar(body, "path"),
    updated: pickScalar(body, "updated"),
    bibliography,
    bibliographyUserEdited: pickBool(body, "bibliography_user_edited"),
  };
}

export async function loadBookCard(libraryRoot: string, slug: string): Promise<ParsedBookCard | null> {
  const path = bookCardPath(libraryRoot, slug);
  if (isTauri()) {
    const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(path))) return null;
    return parseBookCardYaml(await readTextFile(path));
  }
  const text = localStorage.getItem(`marginalia:${path}`);
  return text ? parseBookCardYaml(text) : null;
}

export async function saveBookCard(libraryRoot: string, slug: string, card: ParsedBookCard): Promise<void> {
  const path = bookCardPath(libraryRoot, slug);
  const body = serializeBookCardYaml(card);
  if (isTauri()) {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, body);
    return;
  }
  localStorage.setItem(`marginalia:${path}`, body);
}

export async function updateBookCardAuthor(
  libraryRoot: string,
  slug: string,
  author: string,
): Promise<void> {
  const card =
    (await loadBookCard(libraryRoot, slug)) ??
    ({
      title: slug,
      author: "",
      sha256: "",
      path: "",
      updated: "",
      bibliography: emptyBibliography(),
      bibliographyUserEdited: false,
    } satisfies ParsedBookCard);
  card.author = author.trim();
  card.bibliography = migrateBibliographyFromCard(card.title, author, card.bibliography);
  card.bibliographyUserEdited = true;
  card.updated = new Date().toISOString();
  await saveBookCard(libraryRoot, slug, card);
}

export async function updateBookCardBibliography(
  libraryRoot: string,
  slug: string,
  bibliography: BookBibliography,
  opts: { userEdited?: boolean; title?: string } = {},
): Promise<ParsedBookCard> {
  const card =
    (await loadBookCard(libraryRoot, slug)) ??
    ({
      title: slug,
      author: "",
      sha256: "",
      path: "",
      updated: "",
      bibliography: emptyBibliography(),
      bibliographyUserEdited: false,
    } satisfies ParsedBookCard);
  if (opts.title?.trim()) card.title = opts.title.trim();
  card.bibliography = bibliography;
  card.author = formatAuthorsDisplay(bibliography.authors);
  if (opts.userEdited) card.bibliographyUserEdited = true;
  card.updated = new Date().toISOString();
  await saveBookCard(libraryRoot, slug, card);
  return card;
}

export async function updateBookCardPath(libraryRoot: string, slug: string, newPath: string): Promise<void> {
  const card = await loadBookCard(libraryRoot, slug);
  if (!card) return;
  card.path = newPath;
  card.updated = new Date().toISOString();
  await saveBookCard(libraryRoot, slug, card);
}

/**
 * Copy book bytes into knihovna/knihy/ and return stored path (absolute on desktop).
 * Slug is stable: reuse existing card for the same content hash when present.
 */
export async function persistBookFile(
  libraryRoot: string,
  book: Pick<BookMeta, "title" | "sha256">,
  data: ArrayBuffer,
  originalName: string,
  opts: { slug?: string } = {},
): Promise<{ slug: string; storedPath: string }> {
  let slug = opts.slug?.trim() || "";
  if (!slug && book.sha256) {
    const existing = await findBookCardBySha256(libraryRoot, book.sha256);
    if (existing) slug = existing.slug;
  }
  if (!slug) slug = bookSlug(book.title, book.sha256);
  const ext = bookExt(originalName);
  const fileName = `${slug}${ext}`;
  const storedPath = `${libraryRoot}/knihy/${fileName}`;

  if (isTauri()) {
    const { mkdir, writeFile, exists } = await import("@tauri-apps/plugin-fs");
    await mkdir(`${libraryRoot}/knihy`, { recursive: true });
    // Keep a single binary per slug; overwrite in place when re-importing the same book.
    if (!(await exists(storedPath))) {
      await writeFile(storedPath, new Uint8Array(data));
    } else {
      await writeFile(storedPath, new Uint8Array(data));
    }
    return { slug, storedPath };
  }

  const bytes = new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  localStorage.setItem(binaryStorageKey(slug, ext), btoa(binary));
  localStorage.setItem(`marginalia:bookpath:${slug}`, storedPath);
  return { slug, storedPath };
}

async function deleteBookCardFile(libraryRoot: string, slug: string): Promise<void> {
  const path = bookCardPath(libraryRoot, slug);
  if (isTauri()) {
    const { remove, exists } = await import("@tauri-apps/plugin-fs");
    if (await exists(path)) await remove(path);
    return;
  }
  localStorage.removeItem(`marginalia:${path}`);
}

async function relocateQuotesToSlug(
  libraryRoot: string,
  fromSlug: string,
  toSlug: string,
): Promise<number> {
  if (fromSlug === toSlug) return 0;
  const { loadQuotesForBook } = await import("./storage");
  const { formatQuoteMarkdown } = await import("./quote-markdown");
  const { quotePath } = await import("./paths");
  const docs = await loadQuotesForBook(libraryRoot, fromSlug);
  let moved = 0;
  for (const doc of docs) {
    doc.meta.book_slug = toSlug;
    doc.meta.updated = new Date().toISOString();
    const dest = quotePath(libraryRoot, toSlug, doc.meta.id);
    const src = quotePath(libraryRoot, fromSlug, doc.meta.id);
    const body = formatQuoteMarkdown(doc);
    if (isTauri()) {
      const { mkdir, writeTextFile, remove, exists } = await import("@tauri-apps/plugin-fs");
      const dir = dest.replace(/[/\\][^/\\]+$/, "");
      await mkdir(dir, { recursive: true });
      await writeTextFile(dest, body);
      if (await exists(src)) await remove(src);
    } else {
      localStorage.setItem(`marginalia:${dest}`, body);
      localStorage.removeItem(`marginalia:${src}`);
    }
    moved += 1;
  }
  return moved;
}

export interface MergeDuplicateBooksResult {
  groupsMerged: number;
  cardsRemoved: number;
  quotesMoved: number;
  canonicalSlugs: string[];
}

/**
 * Merge duplicate book cards that share the same content hash (or path).
 * Keeps one canonical card, relocates quotes, removes duplicate .md cards.
 * Never deletes book binaries.
 */
export async function mergeDuplicateBookCards(libraryRoot: string): Promise<MergeDuplicateBooksResult> {
  const empty: MergeDuplicateBooksResult = {
    groupsMerged: 0,
    cardsRemoved: 0,
    quotesMoved: 0,
    canonicalSlugs: [],
  };
  if (!libraryRoot) return empty;

  const records = await listBookCardsWithSlugs(libraryRoot);
  const groups = new Map<string, BookCardRecord[]>();
  for (const r of records) {
    const key = libraryEntryIdentityKey({
      slug: r.slug,
      sha256: r.card.sha256,
      filePath: r.card.path,
    });
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  let groupsMerged = 0;
  let cardsRemoved = 0;
  let quotesMoved = 0;
  const canonicalSlugs: string[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    groupsMerged += 1;

    // Prefer user-edited bibliography, then the slug that already has quotes, then oldest slug.
    const scored = await Promise.all(
      group.map(async (r) => {
        const { loadQuotesForBook } = await import("./storage");
        const quotes = await loadQuotesForBook(libraryRoot, r.slug);
        return { r, quotes: quotes.length, edited: r.card.bibliographyUserEdited };
      }),
    );
    scored.sort((a, b) => {
      if (a.edited !== b.edited) return a.edited ? -1 : 1;
      if (a.quotes !== b.quotes) return b.quotes - a.quotes;
      return a.r.slug.localeCompare(b.r.slug);
    });
    const canonical = scored[0]!.r;
    canonicalSlugs.push(canonical.slug);

    // Fold metadata from duplicates into canonical.
    for (const { r } of scored.slice(1)) {
      if (!canonical.card.title && r.card.title) canonical.card.title = r.card.title;
      if (r.card.bibliographyUserEdited && !canonical.card.bibliographyUserEdited) {
        canonical.card.bibliography = r.card.bibliography;
        canonical.card.bibliographyUserEdited = true;
        canonical.card.title = r.card.title || canonical.card.title;
        canonical.card.author = r.card.author || canonical.card.author;
      } else if (
        r.card.title &&
        r.card.title.trim() &&
        (!canonical.card.title || canonical.card.title === canonical.slug)
      ) {
        canonical.card.title = r.card.title;
      }
      if (!canonical.card.path && r.card.path) canonical.card.path = r.card.path;
      if (!canonical.card.sha256 && r.card.sha256) canonical.card.sha256 = r.card.sha256;
      quotesMoved += await relocateQuotesToSlug(libraryRoot, r.slug, canonical.slug);
      await deleteBookCardFile(libraryRoot, r.slug);
      cardsRemoved += 1;
    }
    canonical.card.updated = new Date().toISOString();
    await saveBookCard(libraryRoot, canonical.slug, canonical.card);
  }

  return { groupsMerged, cardsRemoved, quotesMoved, canonicalSlugs };
}

export async function readBookBytes(
  _libraryRoot: string,
  slug: string,
  storedPath: string,
): Promise<ArrayBuffer | null> {
  if (isTauri()) {
    const { exists, readFile } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(storedPath))) return null;
    const bytes = await readFile(storedPath);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  const ext = storedPath.match(/\.(pdf|epub|mobi|azw3?)$/i)?.[0]?.toLowerCase() ?? ".pdf";
  const b64 = localStorage.getItem(binaryStorageKey(slug, ext));
  if (!b64) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}