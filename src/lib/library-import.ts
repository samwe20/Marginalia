import { detectBookFileKind } from "./book-formats";
import { findBookFilesOnDisk, isPathInsideLibrary } from "./library-scan";
import { ensureBookCard, type BookMeta } from "./storage";
import {
  findBookCardBySha256,
  listBookCardsWithSlugs,
  loadBookCard,
  persistBookFile,
  type LibraryBookEntry,
  type ParsedBookCard,
} from "./book-library";
import { isTauri } from "./runtime";
import { looksLikeTechnicalSlug, parseFilenameMeta } from "./filename-meta";

export type ImportRecentPush = (book: LibraryBookEntry) => void;

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bookKind(fileName: string): "pdf" | "epub" | "mobi" {
  return detectBookFileKind(fileName) ?? "pdf";
}

type ShaIndex = Map<string, string>; // sha256 → slug

function normalizePathKey(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

/**
 * Register one on-disk book (no reader open).
 * Identity is content hash — never create a second card when title/metadata differ.
 */
export async function registerBookFromDiskPath(
  libraryRoot: string,
  filePath: string,
  pushRecent: ImportRecentPush,
  shaIndex?: ShaIndex,
): Promise<string | null> {
  if (!isTauri()) return null;
  let buffer: ArrayBuffer;
  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(filePath);
    buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch {
    // Corrupt / unreadable: skip without throwing so scan continues.
    return null;
  }
  if (buffer.byteLength === 0) return null;

  let sha: string;
  try {
    sha = await sha256Hex(buffer);
  } catch {
    return null;
  }

  const name = filePath.replace(/^.*[/\\]/, "");
  const parsed = parseFilenameMeta(name);
  const title = parsed.title;
  const authorFromName = parsed.author;
  const kind = bookKind(name);
  const shaKey = sha.toLowerCase();

  let existingSlug = shaIndex?.get(shaKey) ?? "";
  let existingCard: ParsedBookCard | null = existingSlug
    ? await loadBookCard(libraryRoot, existingSlug)
    : null;
  // With a bulk shaIndex, never re-walk knihy/*.md (that was O(n²) and stalled stress at ~400/1000).
  if (!existingCard && !shaIndex) {
    const bySha = await findBookCardBySha256(libraryRoot, sha);
    if (bySha) {
      existingSlug = bySha.slug;
      existingCard = bySha.card;
    }
  }

  const bulk = Boolean(shaIndex);

  if (existingCard && existingSlug) {
    let nextTitle = existingCard.title || title;
    let nextAuthor = existingCard.author || authorFromName;
    if (looksLikeTechnicalSlug(nextTitle) && title) nextTitle = title;
    if (!nextAuthor && authorFromName) nextAuthor = authorFromName;
    const path = existingCard.path || filePath;
    const pathSame = normalizePathKey(path) === normalizePathKey(filePath) || !filePath;
    const shaSame = (existingCard.sha256 || "").trim().toLowerCase() === shaKey;
    const titleSame = (existingCard.title || "") === nextTitle;
    const authorSame = (existingCard.author || "") === nextAuthor;
    // Unchanged identity — do not rewrite the card (rescan must stay cheap).
    if (bulk && shaSame && pathSame && titleSame && authorSame) {
      shaIndex?.set(shaKey, existingSlug);
      pushRecent({
        slug: existingSlug,
        kind,
        title: nextTitle,
        author: nextAuthor,
        sha256: sha,
        filePath: path,
      });
      return existingSlug;
    }
    const slug = await ensureBookCard(
      libraryRoot,
      {
        title: nextTitle,
        author: nextAuthor,
        sha256: sha,
        filePath: path,
      },
      { slug: existingSlug, trustCallerIdentity: bulk },
    );
    shaIndex?.set(shaKey, slug);
    pushRecent({
      slug,
      kind,
      title: nextTitle,
      author: nextAuthor,
      sha256: sha,
      filePath: path,
    });
    return slug;
  }

  let storedPath = filePath;
  if (!isPathInsideLibrary(libraryRoot, filePath)) {
    const persisted = await persistBookFile(libraryRoot, { title, sha256: sha }, buffer, name);
    storedPath = persisted.storedPath;
  }

  const slug = await ensureBookCard(
    libraryRoot,
    {
      title,
      author: authorFromName,
      sha256: sha,
      filePath: storedPath,
    } satisfies BookMeta,
    { trustCallerIdentity: bulk },
  );
  shaIndex?.set(shaKey, slug);

  pushRecent({
    slug,
    kind,
    title,
    author: authorFromName,
    sha256: sha,
    filePath: storedPath,
    updated: new Date().toISOString(),
  });
  return slug;
}

function yieldToUi(): Promise<void> {
  // Prefer setTimeout over rAF: WebDriver/WebView needs the event loop to service
  // execute/async while a large scan (stress ~1000 books) is in progress.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export type SyncBooksOptions = {
  onProgress?: (registered: number) => void;
  yieldEvery?: number;
  /** When true, abort the loop ASAP (superseded scan job). */
  shouldAbort?: () => boolean;
};

export async function syncAllBooksFromLibraryFolder(
  libraryRoot: string,
  pushRecent: ImportRecentPush,
  opts?: SyncBooksOptions,
): Promise<number> {
  const paths = await findBookFilesOnDisk(libraryRoot);
  // One disk pass for existing cards — avoids O(n²) re-reads during large scans.
  const shaIndex: ShaIndex = new Map();
  const pathIndex = new Map<string, { slug: string; card: ParsedBookCard }>();
  for (const { slug, card } of await listBookCardsWithSlugs(libraryRoot)) {
    const sha = card.sha256.trim().toLowerCase();
    if (sha.length >= 8) shaIndex.set(sha, slug);
    if (card.path) pathIndex.set(normalizePathKey(card.path), { slug, card });
  }

  const yieldEvery = Math.max(1, opts?.yieldEvery ?? 16);
  let count = 0;
  for (let i = 0; i < paths.length; i++) {
    if (opts?.shouldAbort?.()) {
      throw new Error("library scan aborted (superseded)");
    }
    const p = paths[i]!;
    try {
      // Unchanged rescan fast-path: known path + sha → skip re-hash + skip card rewrite.
      const known = pathIndex.get(normalizePathKey(p));
      if (known?.card.sha256 && known.card.sha256.trim().length >= 8) {
        const shaKey = known.card.sha256.trim().toLowerCase();
        shaIndex.set(shaKey, known.slug);
        pushRecent({
          slug: known.slug,
          kind: bookKind(p.replace(/^.*[/\\]/, "")),
          title: known.card.title,
          author: known.card.author,
          sha256: known.card.sha256,
          filePath: known.card.path || p,
        });
        count += 1;
      } else {
        const slug = await registerBookFromDiskPath(libraryRoot, p, pushRecent, shaIndex);
        if (slug) count += 1;
      }
    } catch (e) {
      if (String(e).includes("aborted")) throw e;
      /* one corrupt file must not abort the whole scan */
    }
    opts?.onProgress?.(count);
    if (i % yieldEvery === yieldEvery - 1) await yieldToUi();
  }
  return count;
}
