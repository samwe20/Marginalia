import type { QuoteDocument } from "../lib/quote-markdown";
import type { BookBibliography } from "../lib/book-bibliography";
import { looksLikeTechnicalSlug } from "../lib/filename-meta";
import { escapeAttr, escapeHtml } from "../lib/html";
import { icons } from "./icons";

/** Session-only: which inspector quote cards have metadata expanded. */
const expandedQuoteMetaIds = new Set<string>();

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
  bibliography?: BookBibliography | null;
  pageLabelOpts?: { chapter?: string; percent?: number };
  /**
   * Reader inspector: hide author/book/date chips and „Kopírovat citaci“ behind a chevron.
   * Quotes page leaves this unset so metadata stay visible.
   */
  collapseMeta?: boolean;
};

function displayBookTitle(raw: string, fallback?: string): string {
  const candidates = [fallback?.trim() || "", raw.trim()].filter(Boolean);
  for (const c of candidates) {
    if (!looksLikeTechnicalSlug(c)) return c;
  }
  return "—";
}

function displayAuthor(raw: string, fallback?: string): string {
  const a = fallback?.trim() || raw.trim();
  if (!a || looksLikeTechnicalSlug(a)) return fallback?.trim() || "Neznámý autor";
  return a;
}

function setMetaExpanded(card: HTMLElement, expanded: boolean): void {
  const id = card.dataset.quoteId ?? "";
  const btn = card.querySelector<HTMLButtonElement>(".quote-card__meta-toggle");
  const panel = card.querySelector<HTMLElement>(".quote-card__meta-panel");
  if (!btn || !panel) return;
  btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  btn.setAttribute("aria-label", expanded ? "Skrýt metadata citace" : "Zobrazit metadata citace");
  panel.hidden = !expanded;
  card.dataset.metaExpanded = expanded ? "1" : "0";
  if (id) {
    if (expanded) expandedQuoteMetaIds.add(id);
    else expandedQuoteMetaIds.delete(id);
  }
}

/** Wire chevron toggles after rendering inspector quote cards. */
export function bindQuoteMetaToggles(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".quote-card[data-collapse-meta='1']").forEach((card) => {
    const id = card.dataset.quoteId ?? "";
    const btn = card.querySelector<HTMLButtonElement>(".quote-card__meta-toggle");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    setMetaExpanded(card, id ? expandedQuoteMetaIds.has(id) : false);
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const open = btn.getAttribute("aria-expanded") === "true";
      setMetaExpanded(card, !open);
    });
  });
}

/** Expand the first inspector quote’s metadata (smoke / citation copy). */
export function expandFirstQuoteMeta(root: ParentNode): boolean {
  const card = root.querySelector<HTMLElement>(".quote-card[data-collapse-meta='1']");
  if (!card) return false;
  setMetaExpanded(card, true);
  return true;
}

/** Expand one quote card by id (backlink → reader). */
export function expandQuoteMetaById(root: ParentNode, quoteId: string): boolean {
  const card = root.querySelector<HTMLElement>(`.quote-card[data-quote-id="${CSS.escape(quoteId)}"]`);
  if (!card) return false;
  setMetaExpanded(card, true);
  card.classList.add("quote-card--focus");
  card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return true;
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
  const citeTools = opts.bibliography
    ? `<details class="quote-card__cite">
        <summary class="quote-card__cite-summary">Kopírovat citaci</summary>
        <div class="quote-card__cite-actions" role="group" aria-label="Formát citace">
          <button type="button" class="ghost-btn quote-card__cite-btn" data-copy-citation="informal" data-quote-id="${escapeAttr(doc.meta.id)}">Neformální</button>
          <button type="button" class="ghost-btn quote-card__cite-btn" data-copy-citation="iso690" data-quote-id="${escapeAttr(doc.meta.id)}">ČSN ISO 690</button>
          <button type="button" class="ghost-btn quote-card__cite-btn" data-copy-citation="apa7" data-quote-id="${escapeAttr(doc.meta.id)}">APA 7</button>
        </div>
      </details>`
    : "";
  const metaRow = `<div class="tag-row quote-card__meta" aria-label="Metadata citace">
    <span class="tag-chip tag-chip--meta" title="Autor">${escapeHtml(author)}</span>
    <span class="tag-chip tag-chip--meta" title="Dílo">${escapeHtml(book)}</span>
    <span class="tag-chip tag-chip--meta" title="Vytvořeno">${escapeHtml(when)}</span>
  </div>`;

  const deleteBtn = `<button type="button" class="quote-card__delete" data-delete-quote="${escapeAttr(doc.meta.id)}" aria-label="Smazat citaci">${icons.trash}</button>`;

  if (opts.collapseMeta) {
    const panelId = `quote-meta-${doc.meta.id}`;
    const expanded = expandedQuoteMetaIds.has(doc.meta.id);
    return `<li class="quote-card" ${attrs} data-quote-id="${escapeAttr(doc.meta.id)}" data-collapse-meta="1" data-meta-expanded="${expanded ? "1" : "0"}">
    <div class="quote-card__head">
      <div class="quote-card__page">${escapeHtml(formatQuotePageLabel(doc.meta.page, opts.pageLabelOpts))}</div>
      <div class="quote-card__head-actions">
        <button type="button" class="quote-card__meta-toggle" aria-expanded="${expanded ? "true" : "false"}" aria-controls="${escapeAttr(panelId)}" aria-label="${expanded ? "Skrýt metadata citace" : "Zobrazit metadata citace"}">
          <span class="quote-card__chevron" aria-hidden="true"></span>
        </button>
        ${deleteBtn}
      </div>
    </div>
    <div class="quote-card__text">${escapeHtml(doc.quoteText)}</div>
    ${commentBlock}
    <div class="quote-card__meta-panel" id="${escapeAttr(panelId)}" ${expanded ? "" : "hidden"}>
      ${metaRow}
      ${citeTools}
    </div>
  </li>`;
  }

  return `<li class="quote-card" ${attrs} data-quote-id="${escapeAttr(doc.meta.id)}">
    <div class="quote-card__head">
      <div class="quote-card__page">${escapeHtml(formatQuotePageLabel(doc.meta.page, opts.pageLabelOpts))}</div>
      <div class="quote-card__head-actions">${deleteBtn}</div>
    </div>
    <div class="quote-card__text">${escapeHtml(doc.quoteText)}</div>
  ${metaRow}
  ${citeTools}
  ${commentBlock}
</li>`;
}
