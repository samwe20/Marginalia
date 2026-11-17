/** Bibliographic metadata stored on the book card (knihy/*.md). */

export interface BibliographyAuthor {
  family: string;
  given: string;
}

export interface BookBibliography {
  authors: BibliographyAuthor[];
  title: string;
  subtitle: string;
  year: string;
  publisher: string;
  place: string;
  edition: string;
  isbn: string;
  translator: string;
  editor: string;
  language: string;
}

export const emptyBibliography = (): BookBibliography => ({
  authors: [{ family: "", given: "" }],
  title: "",
  subtitle: "",
  year: "",
  publisher: "",
  place: "",
  edition: "",
  isbn: "",
  translator: "",
  editor: "",
  language: "",
});

export function formatAuthorDisplay(author: BibliographyAuthor): string {
  const f = author.family.trim();
  const g = author.given.trim();
  if (f && g) return `${g} ${f}`;
  return f || g;
}

export function formatAuthorsDisplay(authors: BibliographyAuthor[]): string {
  const parts = authors.map(formatAuthorDisplay).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} a ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} a ${parts[parts.length - 1]}`;
}

/** Parse legacy single-line author into structured authors (Czech-friendly heuristics). */
export function parseLegacyAuthor(author: string): BibliographyAuthor[] {
  const raw = author.trim();
  if (!raw) return [{ family: "", given: "" }];
  if (raw.includes(",")) {
    const [family, given] = raw.split(",", 2).map((s) => s.trim());
    return [{ family: family || "", given: given || "" }];
  }
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return [{ family: tokens[0]!, given: "" }];
  const family = tokens[tokens.length - 1]!;
  const given = tokens.slice(0, -1).join(" ");
  return [{ family, given }];
}

export function migrateBibliographyFromCard(
  title: string,
  author: string,
  bibliography?: BookBibliography | null,
): BookBibliography {
  const base = bibliography ? { ...bibliography, authors: [...bibliography.authors] } : emptyBibliography();
  if (!bibliography && author.trim()) {
    base.authors = parseLegacyAuthor(author);
  }
  if (!base.title.trim() && title.trim()) base.title = title.trim();
  if (base.authors.length === 0) base.authors = [{ family: "", given: "" }];
  return base;
}

export function bibliographyHasUserContent(bib: BookBibliography): boolean {
  return Boolean(
    bib.title.trim() ||
      bib.subtitle.trim() ||
      bib.year.trim() ||
      bib.publisher.trim() ||
      bib.place.trim() ||
      bib.edition.trim() ||
      bib.isbn.trim() ||
      bib.translator.trim() ||
      bib.editor.trim() ||
      bib.language.trim() ||
      bib.authors.some((a) => a.family.trim() || a.given.trim()),
  );
}