/** Human-readable labels for quotes in backlinks / lists (never ULID/slug). */

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export function looksLikeUlid(value: string): boolean {
  return ULID_RE.test(value.trim());
}

export function quotePreviewLabel(text: string, max = 80): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "Citace";
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function formatQuoteBacklinkSubtitle(bookTitle: string, pageLabel: string): string {
  const book = bookTitle.trim() || "Kniha";
  const page = pageLabel.trim();
  return page ? `${book} · ${page}` : book;
}
