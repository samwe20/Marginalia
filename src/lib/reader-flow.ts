/**
 * How foliate lays out EPUB/MOBI text (Settings → Čtení EPUB/MOBI).
 * - "scrolled": vertical scrolling like the PDF reader; the reader buttons jump between chapters.
 * - "paginated": one column per page; the reader buttons turn pages.
 */
export type FoliateFlow = "paginated" | "scrolled";

const STORAGE_KEY = "marginalia.readerFlow";

export const DEFAULT_FOLIATE_FLOW: FoliateFlow = "scrolled";

export function loadReaderFlow(): FoliateFlow {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "paginated" || raw === "scrolled" ? raw : DEFAULT_FOLIATE_FLOW;
  } catch {
    return DEFAULT_FOLIATE_FLOW;
  }
}

export function saveReaderFlow(flow: FoliateFlow): void {
  localStorage.setItem(STORAGE_KEY, flow);
}

export function foliateNavLabels(flow: FoliateFlow): { prev: string; next: string; prevTitle: string; nextTitle: string } {
  return flow === "scrolled"
    ? { prev: "‹ Předchozí", next: "Další ›", prevTitle: "Předchozí kapitola", nextTitle: "Další kapitola" }
    : { prev: "‹", next: "›", prevTitle: "Předchozí strana", nextTitle: "Další strana" };
}
