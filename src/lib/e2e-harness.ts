import { anchorFromPdfSelection } from "./anchor";
import { saveQuote, loadQuotesForBook, ensureBookCard, type BookMeta } from "./storage";
import { PdfReader } from "../readers/pdf-reader";
import { EpubReader } from "../readers/epub-reader";

export async function runPdfHighlightRestoreTest(pdfUrl: string): Promise<{
  saved: boolean;
  restored: boolean;
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

  const layer = container.querySelector(".textLayer") as HTMLElement | null;
  const full = layer?.textContent ?? "";
  const needle = "Marginalia";
  const start = full.indexOf(needle);
  if (start < 0) throw new Error("fixture text missing in PDF layer");
  const anchor = anchorFromPdfSelection(full, 0, start, start + needle.length, []);
  await saveQuote(libraryRoot, book, slug, needle, "1", anchor);

  container.innerHTML = "";
  const reader2 = new PdfReader({
    container,
    getMode: () => "off",
    onHighlight: async () => undefined,
  });
  await reader2.load(bytes);
  const docs = await loadQuotesForBook(libraryRoot, slug);
  await reader2.restoreHighlights(docs.map((d) => ({ anchor: d.meta.anchor, text: d.quoteText })));
  const restored = Boolean(container.querySelector(".quote-highlight"));

  container.remove();
  return { saved: Boolean(savedText || needle), restored, text: needle };
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

declare global {
  interface Window {
    __marginaliaE2E?: {
      runPdfHighlightRestoreTest: typeof runPdfHighlightRestoreTest;
      runEpubLoadTest: typeof runEpubLoadTest;
    };
  }
}

export function exposeE2EHarness(): void {
  window.__marginaliaE2E = { runPdfHighlightRestoreTest, runEpubLoadTest };
}