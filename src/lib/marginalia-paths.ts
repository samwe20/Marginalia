/** Stable index paths (Marginália extension atop Folio NoteIndex). */
export function bookIndexPath(slug: string): string {
  return `knihy/${slug}`;
}

export function quoteIndexPath(quoteId: string): string {
  return `citace/${quoteId}`;
}

export function noteIndexPath(filename: string): string {
  return `poznamky/${filename}`;
}