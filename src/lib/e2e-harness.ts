import { saveQuote, loadQuotesForBook, ensureBookCard, type BookMeta } from "./storage";
import { PdfReader } from "../readers/pdf-reader";
import { EpubReader } from "../readers/epub-reader";

export async function runPdfHighlightRestoreTest(pdfUrl: string): Promise<{
  saved: boolean;
  restored: boolean;
  painted: number;
  restoredCount: number;
  paintedVisible: boolean;
  restoredVisible: boolean;
  text: string;
}> {
  const libraryRoot = "/Marginalia";
  localStorage.setItem("marginalia.libraryRoot", libraryRoot);

  const bytes = (await fetch(pdfUrl).then((r) => r.arrayBuffer())).slice(0);
  const book: BookMeta = {
    title: "fixture-pdf",
    author: "Test",
    sha256: "fixture",
    filePath: "sample.pdf",
  };
  const slug = await ensureBookCard(libraryRoot, book);

  const container = document.createElement("div");
  container.style.width = "800px";
  document.body.appendChild(container);

  let savedText = "";
  const reader = new PdfReader({
    container,
    getMode: () => "highlight",
    onHighlight: async ({ text, pageIndex, anchor }) => {
      savedText = text;
      await saveQuote(libraryRoot, book, slug, text, String(pageIndex + 1), anchor);
    },
  });
  await reader.load(bytes);
  const draft = reader.quoteDraftFromFirstText();
  if (!draft) throw new Error("fixture text missing in PDF layer");
  reader.paintHighlight(draft.layer, draft.range);
  await saveQuote(libraryRoot, book, slug, draft.text, String(draft.pageIndex + 1), draft.anchor);
  savedText = draft.text;
  const painted = reader.highlightPaintCount();
  const firstMark = container.querySelector<HTMLElement>("mark.quote-highlight");
  const paintedVisible = Boolean(
    firstMark && getComputedStyle(firstMark).backgroundColor !== "rgba(0, 0, 0, 0)",
  );

  container.innerHTML = "";
  const reader2 = new PdfReader({
    container,
    getMode: () => "off",
    onHighlight: async () => undefined,
  });
  await reader2.load(bytes);
  const docs = await loadQuotesForBook(libraryRoot, slug);
  await reader2.restoreHighlights(docs.map((d) => ({ anchor: d.meta.anchor, text: d.quoteText })));
  const restoredCount = reader2.highlightPaintCount();
  const restoredMark = container.querySelector<HTMLElement>("mark.quote-highlight");
  const restoredVisible = Boolean(
    restoredMark && getComputedStyle(restoredMark).backgroundColor !== "rgba(0, 0, 0, 0)",
  );
  const restored = restoredCount > 0;

  container.remove();
  return {
    saved: Boolean(savedText),
    restored,
    painted,
    restoredCount,
    paintedVisible,
    restoredVisible,
    text: savedText,
  };
}

export async function runPdfTextLayerTest(pdfUrl: string): Promise<{
  spanCount: number;
  canSelectText: boolean;
  sampleText: string;
}> {
  const bytes = (await fetch(pdfUrl).then((r) => r.arrayBuffer())).slice(0);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const reader = new PdfReader({
    container,
    getMode: () => "off",
    onHighlight: async () => undefined,
  });
  await reader.load(bytes);
  const layer = container.querySelector(".textLayer") as HTMLElement | null;
  const spans = layer?.querySelectorAll("span") ?? [];
  const sampleText = (layer?.textContent ?? "").trim();
  let canSelectText = spans.length > 0;
  if (layer && spans.length > 0) {
    const range = document.createRange();
    range.setStart(spans[0].firstChild ?? spans[0], 0);
    range.setEnd(spans[0].firstChild ?? spans[0], Math.min(3, (spans[0].textContent ?? "").length));
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    canSelectText = Boolean(sel && sel.toString().length > 0);
    sel?.removeAllRanges();
  }
  reader.destroy();
  container.remove();
  return { spanCount: spans.length, canSelectText, sampleText };
}

export async function runEpubLoadTest(epubUrl: string): Promise<boolean> {
  const bytes = (await fetch(epubUrl).then((r) => r.arrayBuffer())).slice(0);
  const container = document.createElement("div");
  container.style.height = "600px";
  document.body.appendChild(container);
  const reader = new EpubReader({
    container,
    getMode: () => "off",
    onHighlight: async () => undefined,
  });
  try {
    await reader.load(new File([bytes], "sample.epub", { type: "application/epub+zip" }));
  } catch (cause) {
    reader.destroy();
    container.remove();
    throw cause;
  }
  for (let i = 0; i < 200; i++) {
    const view = container.querySelector("foliate-view");
    if (view) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const view = container.querySelector("foliate-view") as
    | (HTMLElement & { renderer?: { root?: HTMLElement } })
    | null;
  const text =
    view?.renderer?.root?.textContent ?? view?.textContent ?? container.textContent ?? "";
  const ok = Boolean(view) && text.trim().length > 10;
  reader.destroy();
  container.remove();
  return ok;
}

export async function runEpubHighlightRestoreTest(
  bookUrl: string,
  fileName = "sample.epub",
): Promise<{ cfi: string; painted: number; restored: number }> {
  const bytes = await fetch(bookUrl).then((r) => r.arrayBuffer());
  const container = document.createElement("div");
  container.style.width = "800px";
  container.style.height = "600px";
  document.body.appendChild(container);

  const makeReader = () =>
    new EpubReader({
      container,
      flow: "scrolled",
      getMode: () => "highlight",
      onHighlight: async () => undefined,
    });

  const reader = makeReader();
  await reader.load(new File([bytes.slice(0)], fileName));
  let draft = reader.quoteDraftFromFirstText();
  for (let i = 0; !draft && i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 100));
    draft = reader.quoteDraftFromFirstText();
  }
  if (!draft?.range) throw new Error("No live foliate range for highlight");
  if (!draft.cfi.startsWith("epubcfi(")) throw new Error(`Invalid foliate CFI: ${draft.cfi}`);
  reader.paintHighlight(draft.range);
  await new Promise((r) => setTimeout(r, 200));
  const painted = reader.highlightPaintCount();
  const anchor = draft.anchor;
  const cfi = draft.cfi;
  reader.destroy();

  const reader2 = makeReader();
  await reader2.load(new File([bytes.slice(0)], fileName));
  await reader2.restoreHighlights([{ anchor }]);
  await new Promise((r) => setTimeout(r, 200));
  const restored = reader2.highlightPaintCount();
  reader2.destroy();
  container.remove();
  return { cfi, painted, restored };
}

declare global {
  interface Window {
    __marginaliaE2E?: {
      runPdfHighlightRestoreTest: typeof runPdfHighlightRestoreTest;
      runEpubLoadTest: typeof runEpubLoadTest;
      runEpubHighlightRestoreTest: typeof runEpubHighlightRestoreTest;
      runPdfTextLayerTest: typeof runPdfTextLayerTest;
    };
  }
}

export function exposeE2EHarness(): void {
  window.__marginaliaE2E = {
    runPdfHighlightRestoreTest,
    runEpubLoadTest,
    runEpubHighlightRestoreTest,
    runPdfTextLayerTest,
  };
}