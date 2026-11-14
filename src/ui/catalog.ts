import type { DemoBook, DemoQuote } from "../lib/demo-data";
import { escapeAttr, escapeHtml, formatDateCs } from "../lib/html";
import { renderMarkdownLite } from "../lib/markdown-lite";

const COLOR_LABEL: Record<DemoQuote["color"], string> = {
  yellow: "Žlutá",
  green: "Zelená",
  blue: "Modrá",
  rose: "Růžová",
};

export function renderTypographicCover(book: DemoBook): string {
  return `
    <div class="book-cover book-cover--${book.coverStyle}" aria-hidden="true">
      <span class="book-cover__initials">${escapeHtml(book.coverInitials)}</span>
      <span class="book-cover__line">${escapeHtml(book.coverSubtitle)}</span>
    </div>`;
}

export function renderDemoBookCard(book: DemoBook, opts?: { compact?: boolean }): string {
  const progress = Math.round(book.progress);
  return `
    <button type="button" class="book-card book-card--demo" data-demo-book="${escapeAttr(book.slug)}" title="${escapeAttr(book.title)}">
      ${renderTypographicCover(book)}
      <div class="book-card__title">${escapeHtml(book.title)}</div>
      <div class="book-card__meta">${escapeHtml(book.author)} · ${book.year}</div>
      <div class="book-card__format">${book.kind.toUpperCase()}</div>
      ${
        opts?.compact
          ? ""
          : `<div class="book-progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100">
        <div class="book-progress__bar" style="width:${progress}%"></div>
      </div>
      <span class="book-progress__label">${progress} % přečteno</span>`
      }
    </button>`;
}

export function renderQuoteDbCard(
  quote: DemoQuote,
  book: DemoBook | undefined,
  opts?: { showBook?: boolean },
): string {
  const bookLine = book
    ? `${book.title} · ${book.author}`
    : quote.bookSlug;
  return `
    <article class="quote-db-card" data-demo-quote="${escapeAttr(quote.id)}">
      <div class="quote-db-card__head">
        <span class="highlight-swatch highlight-swatch--${quote.color}" title="${COLOR_LABEL[quote.color]}"></span>
        ${opts?.showBook !== false ? `<span class="quote-db-card__book">${escapeHtml(bookLine)}</span>` : ""}
        <span class="quote-db-card__page">${escapeHtml(quote.page)}</span>
      </div>
      <blockquote class="quote-db-card__text">${escapeHtml(quote.quoteText)}</blockquote>
      ${
        quote.tags.length
          ? `<div class="tag-row">${quote.tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}</div>`
          : ""
      }
      <footer class="quote-db-card__foot">
        <time datetime="${escapeAttr(quote.created)}">${formatDateCs(quote.created)}</time>
        ${quote.comment.trim() ? `<span class="quote-db-card__has-note">Poznámka</span>` : ""}
      </footer>
    </article>`;
}

export function renderQuoteDetail(quote: DemoQuote, book: DemoBook | undefined): string {
  const bookLine = book ? `${book.title} (${book.author}, ${book.year})` : quote.bookSlug;
  return `
    <div class="page page--narrow">
      <button type="button" class="ghost-btn" id="btn-back-quotes">← Databáze citací</button>
      <article class="quote-detail">
        <header class="quote-detail__header">
          <span class="highlight-swatch highlight-swatch--${quote.color}"></span>
          <div>
            <h1 class="quote-detail__book">${escapeHtml(bookLine)}</h1>
            <p class="muted">${escapeHtml(quote.page)} · ${formatDateCs(quote.created)}</p>
          </div>
        </header>
        <blockquote class="quote-detail__quote">${escapeHtml(quote.quoteText)}</blockquote>
        ${
          quote.tags.length
            ? `<div class="tag-row">${quote.tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}</div>`
            : ""
        }
        ${
          quote.comment.trim()
            ? `<section class="quote-detail__note"><h2>Osobní poznámka</h2><div class="md-body">${renderMarkdownLite(quote.comment)}</div></section>`
            : `<p class="muted">K této citaci zatím není poznámka.</p>`
        }
      </article>
    </div>`;
}

export function renderBookDetailPage(book: DemoBook, quotes: DemoQuote[]): string {
  return `
    <div class="page">
      <button type="button" class="ghost-btn" id="btn-back-library-detail">← Knihovna</button>
      <div class="book-detail">
        <div class="book-detail__hero">
          ${renderTypographicCover(book)}
          <div class="book-detail__meta">
            <h1>${escapeHtml(book.title)}</h1>
            <p class="muted">${escapeHtml(book.author)} · ${book.year} · ${book.kind.toUpperCase()}</p>
            <div class="book-progress book-progress--lg" role="progressbar" aria-valuenow="${book.progress}" aria-valuemin="0" aria-valuemax="100">
              <div class="book-progress__bar" style="width:${book.progress}%"></div>
            </div>
            <span class="book-progress__label">${book.progress} % přečteno (ukázka)</span>
            <p class="muted book-detail__hint">Ukázková kniha — v prototypu nelze otevřít soubor, jen prohlédnout citace a poznámky.</p>
          </div>
        </div>
        <h2 class="section-title">Citace a poznámky (${quotes.length})</h2>
        <div class="quote-db-grid">
          ${quotes.length ? quotes.map((q) => renderQuoteDbCard(q, book, { showBook: false })).join("") : `<p class="muted">Žádné citace.</p>`}
        </div>
      </div>
    </div>`;
}