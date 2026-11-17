const KEY_PREFIX = "marginalia.readerPosition:";

export function loadReaderPosition(slug: string): string | null {
  if (!slug) return null;
  const raw = localStorage.getItem(KEY_PREFIX + slug);
  return raw && raw.startsWith("epubcfi(") ? raw : null;
}

export function saveReaderPosition(slug: string, cfi: string): void {
  if (!slug || !cfi.startsWith("epubcfi(")) return;
  localStorage.setItem(KEY_PREFIX + slug, cfi);
}
