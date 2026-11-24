import { escapeAttr, escapeHtml } from "../lib/html";
import { icons } from "./icons";
import {
  countActiveQuotesFilters,
  emptyQuotesFilterState,
  localIsoDay,
  type QuotesFilterState,
} from "../lib/quotes-filters";

export function renderQuotesFiltersChromeHtml(): string {
  return `
    <div class="quotes-toolbar">
      <label class="field field--inline quotes-filter page-search">
        <span class="sr-only">Hledat v citacích</span>
        <input type="search" id="quotes-filter" placeholder="Hledat v citacích…" autocomplete="off" />
      </label>
      <button type="button" class="ghost-btn quotes-filters-toggle" id="quotes-filters-toggle" aria-expanded="false" aria-controls="quotes-filters-panel">
        <span>Filtry</span>
        <span class="quotes-filters-count" id="quotes-filters-count" hidden></span>
        <span class="quotes-filters-chevron" aria-hidden="true">${icons.chevron}</span>
      </button>
      <button type="button" class="ghost-btn quotes-filters-clear" id="quotes-filters-clear" hidden>Vymazat filtry</button>
    </div>
    <div class="quotes-filters-panel" id="quotes-filters-panel" hidden>
      <div class="quotes-filters-grid">
        <fieldset class="quotes-filter-field">
          <legend>Kniha</legend>
          <div class="quotes-filter-checks" id="filter-books" role="group" aria-label="Filtrovat podle knihy"></div>
        </fieldset>
        <fieldset class="quotes-filter-field">
          <legend>Autor</legend>
          <div class="quotes-filter-checks" id="filter-authors" role="group" aria-label="Filtrovat podle autora"></div>
        </fieldset>
        <fieldset class="quotes-filter-field">
          <legend>Datum přidání</legend>
          <div class="quotes-date-row">
            <label class="field field--compact">Od
              <input type="date" id="filter-date-from" />
            </label>
            <label class="field field--compact">Do
              <input type="date" id="filter-date-to" />
            </label>
          </div>
          <div class="quotes-date-presets" role="group" aria-label="Rychlé datum">
            <button type="button" class="ghost-btn" data-date-preset="today">Dnes</button>
            <button type="button" class="ghost-btn" data-date-preset="week">Tento týden</button>
            <button type="button" class="ghost-btn" data-date-preset="month">Tento měsíc</button>
          </div>
        </fieldset>
        <label class="quotes-filter-switch">
          <input type="checkbox" id="filter-only-note" />
          <span>Jen s poznámkou</span>
        </label>
      </div>
    </div>
  `;
}

export function fillFilterOptionLists(
  root: ParentNode,
  books: string[],
  authors: string[],
  state: QuotesFilterState,
): void {
  const booksEl = root.querySelector("#filter-books");
  const authorsEl = root.querySelector("#filter-authors");
  if (booksEl) {
    booksEl.innerHTML = books
      .map(
        (title) => `<label class="quotes-check">
          <input type="checkbox" data-filter-book="${escapeAttr(title)}" ${state.bookTitles.includes(title) ? "checked" : ""} />
          <span>${escapeHtml(title)}</span>
        </label>`,
      )
      .join("");
  }
  if (authorsEl) {
    authorsEl.innerHTML = authors
      .map(
        (author) => `<label class="quotes-check">
          <input type="checkbox" data-filter-author="${escapeAttr(author)}" ${state.authors.includes(author) ? "checked" : ""} />
          <span>${escapeHtml(author)}</span>
        </label>`,
      )
      .join("");
  }
}

export function readQuotesFilterState(root: ParentNode): QuotesFilterState {
  const bookTitles = [...root.querySelectorAll<HTMLInputElement>("input[data-filter-book]:checked")].map(
    (el) => el.dataset.filterBook || "",
  );
  const authors = [...root.querySelectorAll<HTMLInputElement>("input[data-filter-author]:checked")].map(
    (el) => el.dataset.filterAuthor || "",
  );
  const dateFrom = (root.querySelector("#filter-date-from") as HTMLInputElement | null)?.value ?? "";
  const dateTo = (root.querySelector("#filter-date-to") as HTMLInputElement | null)?.value ?? "";
  const onlyWithNote = Boolean((root.querySelector("#filter-only-note") as HTMLInputElement | null)?.checked);
  return { bookTitles, authors, dateFrom, dateTo, onlyWithNote };
}

export function syncQuotesFilterChrome(root: ParentNode, state: QuotesFilterState, expanded: boolean): void {
  const toggle = root.querySelector<HTMLButtonElement>("#quotes-filters-toggle");
  const panel = root.querySelector<HTMLElement>("#quotes-filters-panel");
  const count = root.querySelector<HTMLElement>("#quotes-filters-count");
  const clear = root.querySelector<HTMLButtonElement>("#quotes-filters-clear");
  const active = countActiveQuotesFilters(state);
  if (toggle) toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  if (panel) panel.hidden = !expanded;
  if (count) {
    count.hidden = active === 0;
    count.textContent = active ? String(active) : "";
  }
  if (clear) clear.hidden = active === 0;
}

export function applyDatePreset(root: ParentNode, preset: "today" | "week" | "month"): void {
  const today = new Date();
  const to = localIsoDay(today);
  let fromDate = new Date(today);
  if (preset === "week") {
    const day = (today.getDay() + 6) % 7; // Monday=0
    fromDate.setDate(today.getDate() - day);
  } else if (preset === "month") {
    fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
  }
  const from = localIsoDay(fromDate);
  const fromEl = root.querySelector<HTMLInputElement>("#filter-date-from");
  const toEl = root.querySelector<HTMLInputElement>("#filter-date-to");
  if (fromEl) fromEl.value = from;
  if (toEl) toEl.value = to;
}

export function resetQuotesFilterControls(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement>("input[data-filter-book], input[data-filter-author]").forEach((el) => {
    el.checked = false;
  });
  const fromEl = root.querySelector<HTMLInputElement>("#filter-date-from");
  const toEl = root.querySelector<HTMLInputElement>("#filter-date-to");
  const noteEl = root.querySelector<HTMLInputElement>("#filter-only-note");
  if (fromEl) fromEl.value = "";
  if (toEl) toEl.value = "";
  if (noteEl) noteEl.checked = false;
  syncQuotesFilterChrome(root, emptyQuotesFilterState(), false);
}
