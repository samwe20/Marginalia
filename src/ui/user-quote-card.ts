import type { QuoteDocument } from "../lib/quote-markdown";
import { looksLikeTechnicalSlug } from "../lib/filename-meta";
import { escapeAttr, escapeHtml } from "../lib/html";

/** Narrow type so this module works on branches without bibliography. */
export type BookBibliography = { title?: string } | null;

export function formatQuotePageLabel(page: string, opts?: { chapter?: string; percent?: number }): string {
  const p = page.trim();
  if (/^\d+$/.test(p)) return `str. ${p}`;
  // Never show raw EPUB CFI in the UI.
  if (/^EPUBCFI\(/i.test(p) || p.startsWith("epubcfi(") || /\/\d+!/.test(p)) {
    const chapter = opts?.chapter?.trim();
    if (chapter) return chapter;
    if (typeof opts?.percent === "number" && Number.isFinite(opts.percent)) {
      return `${Math.round(opts.percent)} %`;
    }
    return "v knize";
  }
  if (p.length > 48) return `${p.slice(0, 40)}…`;
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
  bookTitleFallback?: string;
  bibliography?: BookBibliography;
  pageLabelOpts?: { chapter?: string; percent?: number };
};

function displayBookTitle(raw: string, fallback?: string): string {
  const candidates = [fallback?.trim() || "", raw.trim()].filter(Boolean);
  for (const c of candidates) {
    if (!looksLikeTechnicalSlug(c)) return c;
  }
  return "—";
}

function displayAuthor(raw: string, fallback?: string): string {
  const a = (fallback?.trim() || raw.trim());
  if (!a || looksLikeTechnicalSlug(a)) return fallback?.trim() || "Neznámý autor";
  return a;
}

export function renderUserQuoteCardHtml(doc: QuoteDocument, opts: UserQuoteCardOpts = {}): string {
  const author = displayAuthor(doc.meta.author, opts.bookAuthorFallback);
  const book = displayBookTitle(doc.meta.book_title, opts.bookTitleFallback);
  const when = formatDateCs(doc.meta.created);
  const attrs = Object.entries(opts.listAttrs ?? {})
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(" ");
  const commentBlock =
    opts.showCommentEditor !== false
      ? `<div class="quote-card__note-field">
          <textarea class="quote-card__comment-input" data-quote-comment="${escapeAttr(doc.meta.id)}" rows="2" placeholder="Poznámka k citaci…" aria-label="Poznámka k citaci">${escapeHtml(doc.comment)}</textarea>
        </div>`
      : doc.comment.trim()
        ? `<div class="quote-card__comment quote-card__comment--readonly md-body" data-quote-comment-md="${escapeAttr(doc.meta.id)}"></div>`
        : "";
  const citeTools =
    opts.bibliography ?
      `<details class="quote-card__cite">
        <summary class="quote-card__cite-summary">Kopírovat citaci</summary>
        <div class="quote-card__cite-actions" role="group" aria-label="Formát citace">
          <button type="button" class="ghost-btn quote-card__cite-btn" data-copy-citation="informal" data-quote-id="${escapeAttr(doc.meta.id)}">Neformální</button>
          <button type="button" class="ghost-btn quote-card__cite-btn" data-copy-citation="iso690" data-quote-id="${escapeAttr(doc.meta.id)}">ČSN ISO 690</button>
          <button type="button" class="ghost-btn quote-card__cite-btn" data-copy-citation="apa7" data-quote-id="${escapeAttr(doc.meta.id)}">APA 7</button>
        </div>
      </details>`
    : "";
  return `<li class="quote-card" ${attrs} data-quote-id="${escapeAttr(doc.meta.id)}">
    <div class="quote-card__page">${escapeHtml(formatQuotePageLabel(doc.meta.page, opts.pageLabelOpts))}</div>
    <div class="quote-card__text">${escapeHtml(doc.quoteText)}</div>
  <div class="tag-row quote-card__meta" aria-label="Metadata citace">
    <span class="tag-chip tag-chip--meta" title="Autor">${escapeHtml(author)}</span>
    <span class="tag-chip tag-chip--meta" title="Dílo">${escapeHtml(book)}</span>
    <span class="tag-chip tag-chip--meta" title="Vytvořeno">${escapeHtml(when)}</span>
  </div>
  ${citeTools}
  ${commentBlock}
</li>`;
}
