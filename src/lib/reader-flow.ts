/**
 * How foliate lays out EPUB/MOBI text.
 * - "paginated": foliate columns; the reader buttons turn pages.
 * - "scrolled": vertical scrolling like the PDF reader; the reader buttons jump between chapters.
 */
export type FoliateFlow = "paginated" | "scrolled";

export const FOLIATE_FLOW: FoliateFlow = "paginated";

export function foliateNavLabels(flow: FoliateFlow): { prev: string; next: string; prevTitle: string; nextTitle: string } {
  return flow === "scrolled"
    ? { prev: "‹ Předchozí", next: "Další ›", prevTitle: "Předchozí kapitola", nextTitle: "Další kapitola" }
    : { prev: "‹", next: "›", prevTitle: "Předchozí strana", nextTitle: "Další strana" };
}
