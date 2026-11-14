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
}

export interface WikiTarget {
  raw: string;
  title: string;
  alias?: string;
}