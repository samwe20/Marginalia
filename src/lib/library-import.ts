import { detectBookFileKind } from "./book-formats";
import { findBookFilesOnDisk, isPathInsideLibrary } from "./library-scan";
import { ensureBookCard, type BookMeta } from "./storage";
import {
  findBookCardBySha256,
  persistBookFile,
  type LibraryBookEntry,
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

/**
 * Register one on-disk book (no reader open).
 * Identity is content hash — never create a second card when title/metadata differ.
 */
export async function registerBookFromDiskPath(
  libraryRoot: string,
  filePath: string,
  pushRecent: ImportRecentPush,
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

  const existingRec = await findBookCardBySha256(libraryRoot, sha);
  if (existingRec) {
    const existing = existingRec.card;
    let nextTitle = existing.title || title;
    let nextAuthor = existing.author || authorFromName;
    if (looksLikeTechnicalSlug(nextTitle) && title) nextTitle = title;
    if (!nextAuthor && authorFromName) nextAuthor = authorFromName;
    const path = existing.path || filePath;
    const slug = await ensureBookCard(
      libraryRoot,
      {
        title: nextTitle,
        author: nextAuthor,
        sha256: sha,
        filePath: path,
      },
      { slug: existingRec.slug },
    );
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

  const slug = await ensureBookCard(libraryRoot, {
    title,
    author: authorFromName,
    sha256: sha,
    filePath: storedPath,
  } satisfies BookMeta);

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

export async function syncAllBooksFromLibraryFolder(
  libraryRoot: string,
  pushRecent: ImportRecentPush,
): Promise<number> {
  const paths = await findBookFilesOnDisk(libraryRoot);
  let count = 0;
  for (const p of paths) {
    try {
      const slug = await registerBookFromDiskPath(libraryRoot, p, pushRecent);
      if (slug) count += 1;
    } catch {
      /* one corrupt file must not abort the whole scan */
    }
  }
  return count;
}
