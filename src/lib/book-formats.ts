/** Supported on-disk book formats (foliate-js for EPUB + Kindle/MOBI). */
export type BookFileKind = "pdf" | "epub" | "mobi";

const MOBI_RE = /\.(mobi|azw3?)$/i;
const FOLIATE_RE = /\.(epub|mobi|azw3?)$/i;
const BOOK_SCAN_RE = /\.(pdf|epub|mobi|azw3?)$/i;

export function detectBookFileKind(fileName: string): BookFileKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (MOBI_RE.test(lower)) return "mobi";
  if (lower.endsWith(".epub")) return "epub";
  return null;
}

export function isFoliateBookFile(fileName: string): boolean {
  return FOLIATE_RE.test(fileName);
}

export function isSupportedBookFile(fileName: string): boolean {
  return detectBookFileKind(fileName) != null;
}

export function bookScanNamePattern(): RegExp {
  return BOOK_SCAN_RE;
}

export function mimeForBookFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".epub")) return "application/epub+zip";
  if (lower.endsWith(".azw3")) return "application/vnd.amazon.mobi8-ebook";
  if (lower.endsWith(".azw")) return "application/vnd.amazon.mobi8-ebook";
  if (lower.endsWith(".mobi")) return "application/x-mobipocket-ebook";
  return "application/octet-stream";
}

export const DIALOG_BOOK_EXTENSIONS = ["pdf", "epub", "mobi", "azw", "azw3"] as const;