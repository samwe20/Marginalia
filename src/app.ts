import type { HighlightMode } from "./lib/highlighter";
import { openLibraryIndex, saveQuote, loadQuotesForBook, ensureBookCard, type BookMeta } from "./lib/storage";
import { isTauri } from "./lib/runtime";
import { PdfReader } from "./readers/pdf-reader";
import { EpubReader } from "./readers/epub-reader";

type ViewKind = "library" | "pdf" | "epub";

export async function bootApp(root: HTMLElement): Promise<void> {
  root.innerHTML = "";
  const state = {
    libraryRoot: localStorage.getItem("marginalia.libraryRoot") ?? "",
    mode: "highlight" as HighlightMode,
    book: null as BookMeta | null,
    slug: "",
    view: "library" as ViewKind,
  };

  const header = document.createElement("header");
  header.className = "app-header";
  header.innerHTML = `
    <strong>Marginália</strong>
    <button type="button" id="btn-library">Knihovna</button>
    <button type="button" id="btn-highlight">Zvýrazňovač</button>
    <input id="search" placeholder="Hledat citace…" />
    <span id="status"></span>
  `;

  const main = document.createElement("main");
  main.className = "app-main";
  const reader = document.createElement("section");
  reader.className = "reader";
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  main.append(reader, sidebar);
  root.append(header, main);

  const status = header.querySelector("#status")!;
  const search = header.querySelector<HTMLInputElement>("#search")!;

  let pdf: PdfReader | null = null;
  let epub: EpubReader | null = null;

  const setStatus = (msg: string) => {
    status.textContent = msg;
  };

  const pickLibrary = async () => {
    if (isTauri()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        state.libraryRoot = selected;
        localStorage.setItem("marginalia.libraryRoot", selected);
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("allow_library_path", { path: selected });
        await openLibraryIndex();
        setStatus(`Knihovna: ${selected}`);
      }
    } else {
      state.libraryRoot = "/Marginalia";
      localStorage.setItem("marginalia.libraryRoot", state.libraryRoot);
      setStatus("Web režim — localStorage");
    }
  };

  const renderSidebar = (quotes: { quoteText: string; page: string }[]) => {
    sidebar.innerHTML = `<h2>Citace</h2><ul>${quotes
      .map((q) => `<li><small>${q.page}</small> ${escapeHtml(q.quoteText)}</li>`)
      .join("")}</ul>`;
  };

  const openBookFile = async (file: File) => {
    try {
    const buffer = (await file.arrayBuffer()).slice(0);
    const sha = await sha256Hex(buffer);
    state.book = {
      title: file.name.replace(/\.[^.]+$/, ""),
      author: "",
      sha256: sha,
      filePath: file.name,
    };
    if (!state.libraryRoot) await pickLibrary();
    state.slug = await ensureBookCard(state.libraryRoot, state.book);

    if (file.name.toLowerCase().endsWith(".pdf")) {
      state.view = "pdf";
      pdf?.destroy();
      epub?.destroy();
      epub = null;
      reader.innerHTML = '<div id="pdf-root" class="pdf-root"></div>';
      const pdfRoot = reader.querySelector("#pdf-root") as HTMLElement;
      pdf = new PdfReader({
        container: pdfRoot,
        getMode: () => state.mode,
        onHighlight: async ({ text, pageIndex, anchor }) => {
          await saveQuote(
            state.libraryRoot,
            state.book!,
            state.slug,
            text,
            String(pageIndex + 1),
            anchor,
          );
          const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
          renderSidebar(docs.map((d) => ({ quoteText: d.quoteText, page: d.meta.page })));
          setStatus(`Uloženo (${text.length} znaků)`);
        },
      });
      await pdf.load(buffer);
      const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
      await pdf.restoreHighlights(docs.map((d) => ({ anchor: d.meta.anchor, text: d.quoteText })));
      renderSidebar(docs.map((d) => ({ quoteText: d.quoteText, page: d.meta.page })));
    } else if (file.name.toLowerCase().endsWith(".epub")) {
      state.view = "epub";
      epub?.destroy();
      pdf?.destroy();
      pdf = null;
      reader.innerHTML = '<div id="epub-root" class="epub-root"></div>';
      const epubRoot = reader.querySelector("#epub-root") as HTMLElement;
      epub = new EpubReader({
        container: epubRoot,
        getMode: () => state.mode,
        onHighlight: async ({ text, cfi, anchor }) => {
          await saveQuote(state.libraryRoot, state.book!, state.slug, text, cfi, anchor);
          const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
          renderSidebar(docs.map((d) => ({ quoteText: d.quoteText, page: d.meta.page })));
        },
      });
      const epubBytes = buffer.slice(0);
      await epub.load(new File([epubBytes], file.name, { type: "application/epub+zip" }));
      const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
      await epub.restoreHighlights(docs.map((d) => ({ anchor: d.meta.anchor })));
      renderSidebar(docs.map((d) => ({ quoteText: d.quoteText, page: d.meta.page })));
    }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
      console.error(err);
    }
  };

  const libraryPanel = () => {
    reader.innerHTML = `
      <motion-library class="library-panel">
        <p>Vyberte složku knihovny a otevřete PDF nebo EPUB.</p>
        <button type="button" id="btn-pick-library">Složka knihovny…</button>
        <input type="file" id="file-open" accept=".pdf,.epub" />
      </motion-library>
    `;
    reader.querySelector("#btn-pick-library")?.addEventListener("click", () => void pickLibrary());
    reader.querySelector<HTMLInputElement>("#file-open")?.addEventListener("change", (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (file) void openBookFile(file);
    });
  };

  header.querySelector("#btn-library")?.addEventListener("click", () => {
    state.view = "library";
    libraryPanel();
  });
  header.querySelector("#btn-highlight")?.addEventListener("click", () => {
    state.mode = state.mode === "highlight" ? "off" : "highlight";
    setStatus(`Režim: ${state.mode}`);
  });

  search.addEventListener("keydown", async (ev) => {
    if (ev.key !== "Enter" || !isTauri()) return;
    const q = search.value.trim();
    if (!q) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await openLibraryIndex();
    const hits = (await invoke("index_search", { query: q, limit: 20 })) as {
      snippet: string;
      quote_id: string;
    }[];
    sidebar.innerHTML = `<h2>Výsledky</h2><ul>${hits
      .map((h) => `<li>${escapeHtml(h.snippet)}</li>`)
      .join("")}</ul>`;
  });

  if (state.libraryRoot) void openLibraryIndex();
  libraryPanel();
  if (!state.libraryRoot) setStatus("Nenastavena knihovna");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (isTauri()) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}