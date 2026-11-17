import type { BookBibliography, BibliographyAuthor } from "../lib/book-bibliography";
import { escapeAttr, escapeHtml } from "../lib/html";

export function renderReaderBibliographyFields(bib: BookBibliography): string {
  const authorRows = bib.authors
    .map(
      (a, i) => `<div class="reader-bib-author-row" data-author-index="${i}">
      <input type="text" class="reader-bib-input reader-bib-given" data-bib-field="author-given" data-author-index="${i}" placeholder="Jméno" value="${escapeAttr(a.given)}" />
      <input type="text" class="reader-bib-input reader-bib-family" data-bib-field="author-family" data-author-index="${i}" placeholder="Příjmení" value="${escapeAttr(a.family)}" />
    </div>`,
    )
    .join("");
  const field = (id: string, label: string, key: keyof BookBibliography, value: string) =>
    `<label class="reader-bib-field"><span>${escapeHtml(label)}</span>
      <input type="text" class="reader-bib-input" id="${id}" data-bib-field="${key}" value="${escapeAttr(value)}" /></label>`;
  return `<div class="reader-bib-body">
    <div class="reader-bib-authors">
      <span class="reader-bib-section-label">Autoři</span>
      ${authorRows}
      <button type="button" class="ghost-btn reader-bib-add-author" id="reader-bib-add-author">+ Další autor</button>
    </div>
    ${field("reader-bib-title", "Název", "title", bib.title)}
    ${field("reader-bib-subtitle", "Podnázev", "subtitle", bib.subtitle)}
    ${field("reader-bib-year", "Rok vydání", "year", bib.year)}
    ${field("reader-bib-publisher", "Nakladatel", "publisher", bib.publisher)}
    ${field("reader-bib-place", "Místo vydání", "place", bib.place)}
    ${field("reader-bib-edition", "Vydání", "edition", bib.edition)}
    ${field("reader-bib-isbn", "ISBN", "isbn", bib.isbn)}
    ${field("reader-bib-translator", "Překladatel", "translator", bib.translator)}
    ${field("reader-bib-editor", "Editor", "editor", bib.editor)}
    ${field("reader-bib-language", "Jazyk", "language", bib.language)}
  </div>`;
}

export function readBibliographyFromForm(root: ParentNode): BookBibliography {
  const q = (sel: string) => (root.querySelector(sel) as HTMLInputElement | null)?.value.trim() ?? "";
  const authors: BibliographyAuthor[] = [];
  root.querySelectorAll<HTMLElement>(".reader-bib-author-row").forEach((row) => {
    const i = row.dataset.authorIndex ?? "0";
    authors.push({
      given: q(`[data-bib-field="author-given"][data-author-index="${i}"]`),
      family: q(`[data-bib-field="author-family"][data-author-index="${i}"]`),
    });
  });
  if (!authors.length) authors.push({ given: "", family: "" });
  return {
    authors,
    title: q('[data-bib-field="title"]'),
    subtitle: q('[data-bib-field="subtitle"]'),
    year: q('[data-bib-field="year"]'),
    publisher: q('[data-bib-field="publisher"]'),
    place: q('[data-bib-field="place"]'),
    edition: q('[data-bib-field="edition"]'),
    isbn: q('[data-bib-field="isbn"]'),
    translator: q('[data-bib-field="translator"]'),
    editor: q('[data-bib-field="editor"]'),
    language: q('[data-bib-field="language"]'),
  };
}