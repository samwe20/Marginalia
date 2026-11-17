import type { QuoteDocument } from "./quote-markdown";

export type QuotesFilterState = {
  bookTitles: string[];
  authors: string[];
  dateFrom: string; // YYYY-MM-DD or ""
  dateTo: string;
  onlyWithNote: boolean;
};

export function emptyQuotesFilterState(): QuotesFilterState {
  return { bookTitles: [], authors: [], dateFrom: "", dateTo: "", onlyWithNote: false };
}

export function countActiveQuotesFilters(f: QuotesFilterState): number {
  let n = 0;
  if (f.bookTitles.length) n += 1;
  if (f.authors.length) n += 1;
  if (f.dateFrom || f.dateTo) n += 1;
  if (f.onlyWithNote) n += 1;
  return n;
}

function dayStartMs(isoDay: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return null;
  const t = Date.parse(`${isoDay}T00:00:00`);
  return Number.isFinite(t) ? t : null;
}

function dayEndMs(isoDay: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return null;
  const t = Date.parse(`${isoDay}T23:59:59.999`);
  return Number.isFinite(t) ? t : null;
}

export function localIsoDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function applyQuotesFilters(
  docs: QuoteDocument[],
  textQuery: string,
  filters: QuotesFilterState,
  liveMeta: { titleBySlug: Map<string, string>; authorBySlug: Map<string, string> },
): QuoteDocument[] {
  const q = textQuery.trim().toLowerCase();
  const fromMs = filters.dateFrom ? dayStartMs(filters.dateFrom) : null;
  const toMs = filters.dateTo ? dayEndMs(filters.dateTo) : null;
  const books = new Set(filters.bookTitles.map((t) => t.trim().toLowerCase()).filter(Boolean));
  const authors = new Set(filters.authors.map((a) => a.trim().toLowerCase()).filter(Boolean));

  return docs.filter((d) => {
    const liveTitle = (liveMeta.titleBySlug.get(d.meta.book_slug) || d.meta.book_title || "").trim();
    const liveAuthor = (liveMeta.authorBySlug.get(d.meta.book_slug) || d.meta.author || "").trim();

    if (books.size && !books.has(liveTitle.toLowerCase())) return false;
    if (authors.size && !authors.has(liveAuthor.toLowerCase())) return false;
    if (filters.onlyWithNote && !d.comment.trim()) return false;

    if (fromMs != null || toMs != null) {
      const created = Date.parse(d.meta.created);
      if (!Number.isFinite(created)) return false;
      if (fromMs != null && created < fromMs) return false;
      if (toMs != null && created > toMs) return false;
    }

    if (!q) return true;
    return (
      d.quoteText.toLowerCase().includes(q) ||
      d.comment.toLowerCase().includes(q) ||
      liveAuthor.toLowerCase().includes(q) ||
      liveTitle.toLowerCase().includes(q)
    );
  });
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "cs"),
  );
}
