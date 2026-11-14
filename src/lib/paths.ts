export const LIBRARY_SUBDIRS = {
  books: "knihy",
  quotes: "citace",
} as const;

export function bookSlug(title: string, sha256: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${base || "kniha"}-${sha256.slice(0, 8)}`;
}

export function quotePath(libraryRoot: string, bookSlugValue: string, quoteId: string): string {
  return `${libraryRoot}/${LIBRARY_SUBDIRS.quotes}/${bookSlugValue}/${quoteId}.md`;
}

export function bookCardPath(libraryRoot: string, bookSlugValue: string): string {
  return `${libraryRoot}/${LIBRARY_SUBDIRS.books}/${bookSlugValue}.md`;
}