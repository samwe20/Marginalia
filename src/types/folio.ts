/** Types shared with Folio wikilink/backlinks (ported from samwe20/Folio). */

export type MarginaliaEntityKind = "note" | "book" | "quote";

export interface NoteMeta {
  id: string;
  title: string;
  path: string;
  relativePath: string;
  mtime: number;
  createdAt: number | null;
  kind?: MarginaliaEntityKind;
  /** Quote display — never show id/slug as the primary label. */
  quotePreview?: string;
  quoteBookTitle?: string;
  quotePage?: string;
  quoteBookSlug?: string;
}

export interface WikiTarget {
  raw: string;
  title: string;
  alias?: string;
}