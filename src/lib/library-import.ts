import { bookSlug } from "./paths";
import { findBookFilesOnDisk, isPathInsideLibrary } from "./library-scan";
import { ensureBookCard, type BookMeta } from "./storage";
import { loadBookCard, persistBookFile, type LibraryBookEntry } from "./book-library";
import { isTauri } from "./runtime";

export type ImportRecentPush = (book: LibraryBookEntry) => void;

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bookKind(fileName: string): "pdf" | "epub" {
  return fileName.toLowerCase().endsWith(".epub") ? "epub" : "pdf";
}

/** Register one on-disk book (no reader open). Copies into knihy/ only when file lies outside library root. */
export async function registerBookFromDiskPath(
  libraryRoot: string,
  filePath: string,
  pushRecent: ImportRecentPush,
): Promise<string | null> {
  if (!isTauri()) return null;
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const bytes = await readFile(filePath);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const sha = await sha256Hex(buffer);
  const name = filePath.replace(/^.*[/\\]/, "");
  const title = name.replace(/\.[^.]+$/, "");
  const slug = bookSlug(title, sha);
  const existing = await loadBookCard(libraryRoot, slug);
  if (existing?.sha256 === sha && existing.path) {
    pushRecent({
      slug,
      kind: bookKind(name),
      title: existing.title || title,
      author: existing.author ?? "",
      sha256: sha,
      filePath: existing.path,
    });
    return slug;
  }

  let storedPath = filePath;
  if (!isPathInsideLibrary(libraryRoot, filePath)) {
    const persisted = await persistBookFile(libraryRoot, { title, sha256: sha }, buffer, name);
    storedPath = persisted.storedPath;
  }

  await ensureBookCard(libraryRoot, {
    title,
    author: "",
    sha256: sha,
    filePath: storedPath,
  } satisfies BookMeta);

  const card: LibraryBookEntry = {
    slug,
    kind: bookKind(name),
    title,
    author: "",
    sha256: sha,
    filePath: storedPath,
    updated: new Date().toISOString(),
  };
  pushRecent(card);
  return slug;
}

export async function syncAllBooksFromLibraryFolder(
  libraryRoot: string,
  pushRecent: ImportRecentPush,
): Promise<number> {
  const paths = await findBookFilesOnDisk(libraryRoot);
  let count = 0;
  for (const p of paths) {
    const slug = await registerBookFromDiskPath(libraryRoot, p, pushRecent);
    if (slug) count += 1;
  }
  return count;
}