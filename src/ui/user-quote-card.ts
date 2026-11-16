import type { QuoteDocument } from "../lib/quote-markdown";
import { escapeAttr, escapeHtml } from "../lib/html";

export function formatQuotePageLabel(page: string): string {
  const p = page.trim();
  if (/^\d+$/.test(p)) return `str. ${p}`;
  if (p.length > 28) return `${p.slice(0, 14)}…`;
  return p || "—";
}

function formatDateCs(iso: string): string {
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export type UserQuoteCardOpts = {
  showCommentEditor?: boolean;
  listAttrs?: Record<string, string>;
  bookAuthorFallback?: string;
};

export function renderUserQuoteCardHtml(doc: QuoteDocument, opts: UserQuoteCardOpts = {}): string {
  const author = opts.bookAuthorFallback?.trim() || doc.meta.author.trim() || "Neznámý autor";
  const book = doc.meta.book_title.trim() || "—";
  const when = formatDateCs(doc.meta.created);
  const attrs = Object.entries(opts.listAttrs ?? {})
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(" ");
  const commentBlock =
    opts.showCommentEditor !== false
      ? `<label class="quote-card__note-field">
          <span class="visually-hidden">Poznámka k citaci</span>
          <textarea class="quote-card__comment-input" data-quote-comment="${escapeAttr(doc.meta.id)}" rows="2" placeholder="Poznámka k citaci…">${escapeHtml(doc.comment)}</textarea>
        </label>`
      : doc.comment.trim()
        ? `<p class="quote-card__comment quote-card__comment--readonly">${escapeHtml(doc.comment)}</p>`
        : "";
  return `<li class="quote-card" ${attrs}>
    <div class="quote-card__page">${escapeHtml(formatQuotePageLabel(doc.meta.page))}</div>
    <div class="quote-card__text">${escapeHtml(doc.quoteText)}</div>
  <div class="tag-row quote-card__meta" aria-label="Metadata citace">
    <span class="tag-chip tag-chip--meta" title="Autor">${escapeHtml(author)}</span>
    <span class="tag-chip tag-chip--meta" title="Dílo">${escapeHtml(book)}</span>
    <span class="tag-chip tag-chip--meta" title="Vytvořeno">${escapeHtml(when)}</span>
  </div>
  ${commentBlock}
</li>`;
}