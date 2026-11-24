import { loadDesktopReaderFlow, saveDesktopReaderFlow } from "./desktop-prefs";

/**
 * How foliate lays out EPUB/MOBI text (Settings → Čtení EPUB/MOBI).
 * - "scrolled": vertical scrolling like the PDF reader; the reader buttons jump between chapters.
 * - "paginated": one column per page; the reader buttons turn pages.
 */
export type FoliateFlow = "paginated" | "scrolled";

const STORAGE_KEY = "marginalia.readerFlow";

export const DEFAULT_FOLIATE_FLOW: FoliateFlow = "scrolled";

let cachedFlow: FoliateFlow | null = null;

export function loadReaderFlow(): FoliateFlow {
  if (cachedFlow) return cachedFlow;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cachedFlow = raw === "paginated" || raw === "scrolled" ? raw : DEFAULT_FOLIATE_FLOW;
  } catch {
    cachedFlow = DEFAULT_FOLIATE_FLOW;
  }
  return cachedFlow;
}

/** Hydrate the synchronous reader preference from Tauri's durable store at app startup. */
export async function hydrateReaderFlow(): Promise<FoliateFlow> {
  const desktopFlow = await loadDesktopReaderFlow();
  cachedFlow = desktopFlow ?? loadReaderFlow();
  try {
    localStorage.setItem(STORAGE_KEY, cachedFlow);
  } catch {
    /* The durable desktop store remains authoritative when localStorage is unavailable. */
  }
  return cachedFlow;
}

export async function saveReaderFlow(flow: FoliateFlow): Promise<void> {
  cachedFlow = flow;
  try {
    localStorage.setItem(STORAGE_KEY, flow);
  } catch {
    /* Continue with the durable desktop store. */
  }
  await saveDesktopReaderFlow(flow);
}

export function foliateNavLabels(flow: FoliateFlow): { prev: string; next: string; prevTitle: string; nextTitle: string } {
  return flow === "scrolled"
    ? { prev: "‹ Předchozí", next: "Další ›", prevTitle: "Předchozí kapitola", nextTitle: "Další kapitola" }
    : { prev: "‹", next: "›", prevTitle: "Předchozí strana", nextTitle: "Další strana" };
}
