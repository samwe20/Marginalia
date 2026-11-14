import type { HighlightMode } from "./lib/highlighter";
import {
  openLibraryIndex,
  saveQuote,
  loadQuotesForBook,
  ensureBookCard,
  type BookMeta,
} from "./lib/storage";
import { isTauri } from "./lib/runtime";
import { PdfReader } from "./readers/pdf-reader";
import { EpubReader } from "./readers/epub-reader";
import { icons } from "./ui/icons";
import { mountToastRegion } from "./ui/toast";

type Route = "library" | "quotes" | "search" | "settings" | "reader";

interface RecentBook extends BookMeta {
  slug: string;
  kind: "pdf" | "epub";
}

const ROUTE_LABEL: Record<Exclude<Route, "reader">, string> = {
  library: "Knihovna",
  quotes: "Citace",
  search: "Hledat",
  settings: "Nastavení",
};

export async function bootApp(root: HTMLElement): Promise<void> {
  root.innerHTML = "";
  const toast = mountToastRegion(document.body);

  const statusEl = document.createElement("div");
  statusEl.id = "status";
  statusEl.className = "sr-only";
  statusEl.setAttribute("aria-live", "polite");
  root.appendChild(statusEl);

  const setStatus = (msg: string) => {
    statusEl.textContent = msg;
  };

  const state = {
    libraryRoot: localStorage.getItem("marginalia.libraryRoot") ?? "",
    mode: "highlight" as HighlightMode,
    book: null as BookMeta | null,
    slug: "",
    route: "library" as Route,
    inspectorOpen: true,
  };

  let pdf: PdfReader | null = null;
  let epub: EpubReader | null = null;

  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.setAttribute("aria-label", "Navigace");
  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-mark" aria-hidden="true"></div>
      <div class="brand-copy">
        <span class="brand-name">Marginália</span>
        <span class="brand-tag">Citace z knih</span>
      </div>
    </div>
    <div class="library-path" id="library-path" title="">Žádná knihovna</div>
    <div class="nav-list" role="navigation">
      <button type="button" class="nav-item" data-route="library"><span class="icon">${icons.library}</span><span>Knihovna</span></button>
      <button type="button" class="nav-item" data-route="quotes"><span class="icon">${icons.quotes}</span><span>Citace</span></button>
      <button type="button" class="nav-item" data-route="search"><span class="icon">${icons.search}</span><span>Hledat</span></button>
      <button type="button" class="nav-item" data-route="settings"><span class="icon">${icons.settings}</span><span>Nastavení</span></button>
    </div>
  `;

  const workspace = document.createElement("div");
  workspace.className = "workspace";

  const toolbar = document.createElement("header");
  toolbar.className = "toolbar";
  toolbar.innerHTML = `
    <div class="toolbar-left">
      <h1 class="context-title" id="context-title">Knihovna</h1>
    </div>
    <div class="toolbar-right">
      <button type="button" class="chip-btn" id="btn-highlight" data-active="true" title="Režim zvýrazňování">Zvýrazňovat</button>
      <button type="button" class="chip-btn" id="btn-backlinks" data-active="true" title="Panel citací (Esc skryje)">Citace</button>
    </div>
  `;

  const stage = document.createElement("div");
  stage.className = "stage";

  const stageMain = document.createElement("section");
  stageMain.className = "stage-main";
  stageMain.id = "stage-main";

  const inspector = document.createElement("aside");
  inspector.className = "backlinks-pane";
  inspector.id = "inspector";
  inspector.innerHTML = `
    <div class="backlinks-header">
      <h2>Citace knihy</h2>
      <button type="button" class="ghost-btn" id="btn-hide-inspector" title="Skrýt panel (Esc)">Skrýt</button>
    </div>
    <div class="backlinks-body" id="inspector-body"></div>
  `;

  stage.append(stageMain, inspector);
  workspace.append(toolbar, stage);
  root.append(sidebar, workspace);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".pdf,.epub";
  fileInput.id = "file-open";
  fileInput.className = "hidden-input";
  fileInput.setAttribute("data-testid", "file-open");
  root.appendChild(fileInput);

  const libraryPathEl = sidebar.querySelector("#library-path")!;
  const contextTitle = toolbar.querySelector("#context-title")!;
  const highlightBtn = toolbar.querySelector("#btn-highlight") as HTMLButtonElement;
  const backlinksBtn = toolbar.querySelector("#btn-backlinks") as HTMLButtonElement;
  const inspectorBody = inspector.querySelector("#inspector-body")!;

  const setLibraryPath = (text: string, title?: string) => {
    libraryPathEl.textContent = text;
    libraryPathEl.setAttribute("title", title ?? text);
  };

  const setContextTitle = (text: string) => {
    contextTitle.textContent = text;
  };

  const syncInspectorChrome = () => {
    root.classList.toggle("backlinks-hidden", !state.inspectorOpen);
    backlinksBtn.dataset.active = String(state.inspectorOpen);
  };

  const getRecentBooks = (): RecentBook[] => {
    try {
      return JSON.parse(localStorage.getItem("marginalia.recentBooks") ?? "[]") as RecentBook[];
    } catch {
      return [];
    }
  };

  const pushRecent = (book: RecentBook) => {
    const list = getRecentBooks().filter((b) => b.slug !== book.slug);
    list.unshift(book);
    localStorage.setItem("marginalia.recentBooks", JSON.stringify(list.slice(0, 24)));
  };

  const renderInspectorQuotes = (quotes: { quoteText: string; page: string }[]) => {
    if (!quotes.length) {
      inspectorBody.innerHTML = `<p class="muted">Zatím žádné citace. Zapněte zvýrazňování a označte text v knize.</p>`;
      return;
    }
    inspectorBody.innerHTML = `<ul class="quote-list">${quotes
      .map(
        (q) =>
          `<li class="quote-card"><div class="quote-card__page">${escapeHtml(q.page)}</div><div class="quote-card__text">${escapeHtml(q.quoteText)}</div></li>`,
      )
      .join("")}</ul>`;
  };

  const setRoute = (route: Route) => {
    state.route = route;
    sidebar.querySelectorAll(".nav-item").forEach((btn) => {
      btn.setAttribute(
        "aria-current",
        (btn as HTMLElement).dataset.route === route ? "page" : "false",
      );
    });
    if (route === "reader" && state.book) {
      setContextTitle(state.book.title);
      return;
    }
    const label = ROUTE_LABEL[route as Exclude<Route, "reader">];
    setContextTitle(label);
    if (route === "library") renderLibrary();
    if (route === "quotes") renderQuotesOverview();
    if (route === "search") renderSearch();
    if (route === "settings") renderSettings();
  };

  const renderLibrary = () => {
    const recent = getRecentBooks();
    stageMain.innerHTML = `
      <div class="page">
        <h1>Knihovna</h1>
        <p class="page-intro">Otevřete PDF nebo EPUB, nebo přetáhněte soubor do oblasti níže.</p>
        <div class="page-actions">
          <button type="button" class="primary-btn" id="btn-open-book">Otevřít knihu…</button>
          <button type="button" class="ghost-btn solid" id="btn-library-folder">Složka knihovny…</button>
        </div>
        <div class="drop-zone" id="drop-zone" tabindex="0" aria-label="Oblast pro přetažení knihy">
          Přetáhněte sem PDF nebo EPUB
        </div>
        ${
          recent.length
            ? `<div class="book-grid">${recent
                .map(
                  (b) => `
              <button type="button" class="book-card" data-slug="${escapeAttr(b.slug)}" data-kind="${b.kind}" title="${escapeAttr(b.title)}">
                <div class="book-card__cover">${escapeHtml(b.title.slice(0, 1).toUpperCase())}</div>
                <div class="book-card__title">${escapeHtml(b.title)}</div>
                <div class="book-card__meta">${b.kind.toUpperCase()}</div>
              </button>`,
                )
                .join("")}</div>`
            : `<p class="muted">Knihovna je prázdná — začněte otevřením knihy.</p>`
        }
      </div>
    `;

    stageMain.querySelector("#btn-open-book")?.addEventListener("click", () => fileInput.click());
    stageMain.querySelector("#btn-library-folder")?.addEventListener("click", () => void pickLibrary());
    const zone = stageMain.querySelector("#drop-zone")!;
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drop-zone--active");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drop-zone--active"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drop-zone--active");
      const file = (e as DragEvent).dataTransfer?.files?.[0];
      if (file) void openBookFile(file);
    });
    stageMain.querySelectorAll(".book-card").forEach((card) => {
      card.addEventListener("click", () => {
        toast("Znovu otevřete knihu přes Otevřít knihu… (prototype bez cache souboru).", "info");
      });
    });
  };

  const renderQuotesOverview = () => {
    stageMain.innerHTML = `
      <div class="page">
        <h1>Citace</h1>
        <p class="muted">Přehled všech citací přibude v další iteraci. Zatím uvidíte citace aktivní knihy v panelu vpravo.</p>
      </div>
    `;
  };

  const renderSearch = () => {
    stageMain.innerHTML = `
      <div class="page">
        <h1>Hledat citace</h1>
        <label class="field">
          <span>Dotaz</span>
          <input type="search" id="search-input" placeholder="Napište slovo nebo frázi…" autocomplete="off" />
        </label>
        <div id="search-results"></div>
      </div>
    `;
    const input = stageMain.querySelector<HTMLInputElement>("#search-input")!;
    input.focus();
    input.addEventListener("keydown", async (ev) => {
      if (ev.key !== "Enter") return;
      const q = input.value.trim();
      const box = stageMain.querySelector("#search-results")!;
      if (!q) {
        box.innerHTML = "";
        return;
      }
      if (!isTauri()) {
        box.innerHTML = `<p class="muted">Vyhledávání vyžaduje desktop aplikaci.</p>`;
        return;
      }
      await openLibraryIndex();
      const { invoke } = await import("@tauri-apps/api/core");
      const hits = (await invoke("index_search", { query: q, limit: 20 })) as { snippet: string }[];
      box.innerHTML = hits.length
        ? `<ul class="quote-list">${hits.map((h) => `<li class="quote-card">${escapeHtml(h.snippet)}</li>`).join("")}</ul>`
        : `<p class="muted">Nic nenalezeno.</p>`;
    });
  };

  const renderSettings = () => {
    stageMain.innerHTML = `
      <div class="page">
        <h1>Nastavení</h1>
        <p class="muted">Složka pro soubory knih a citací (může být v OneDrive / iCloud).</p>
        <div class="page-actions">
          <button type="button" class="primary-btn" id="btn-settings-library">Vybrat složku knihovny…</button>
        </div>
        <p class="muted"><strong>Aktuální cesta:</strong> ${escapeHtml(state.libraryRoot || "—")}</p>
      </div>
    `;
    stageMain.querySelector("#btn-settings-library")?.addEventListener("click", () => void pickLibrary());
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
        setLibraryPath(selected, selected);
        setStatus(`Knihovna: ${selected}`);
        toast("Složka knihovny nastavena", "success");
        if (state.route === "settings") renderSettings();
      }
    } else {
      state.libraryRoot = "/Marginalia";
      localStorage.setItem("marginalia.libraryRoot", state.libraryRoot);
      setLibraryPath("Web režim (localStorage)");
      toast("Web režim — localStorage", "info");
    }
  };

  const mountReaderChrome = (kind: "pdf" | "epub", title: string) => {
    stageMain.innerHTML = `
      <div class="reader-toolbar">
        <button type="button" class="ghost-btn" id="btn-back-library">← Knihovna</button>
        <span class="muted">${escapeHtml(title)} · ${kind.toUpperCase()}</span>
      </div>
      <div class="reader-surface"><div id="${kind === "pdf" ? "pdf-root" : "epub-root"}" class="${kind === "pdf" ? "pdf-root" : "epub-root"}"></div></div>
    `;
    stageMain.querySelector("#btn-back-library")?.addEventListener("click", () => {
      pdf?.destroy();
      epub?.destroy();
      pdf = null;
      epub = null;
      state.book = null;
      setRoute("library");
    });
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
        pushRecent({ ...state.book, slug: state.slug, kind: "pdf" });
        epub?.destroy();
        epub = null;
        mountReaderChrome("pdf", state.book.title);
        const pdfRoot = stageMain.querySelector("#pdf-root") as HTMLElement;
        pdf = new PdfReader({
          container: pdfRoot,
          getMode: () => state.mode,
          onHighlight: async ({ text, pageIndex, anchor }) => {
            await saveQuote(state.libraryRoot, state.book!, state.slug, text, String(pageIndex + 1), anchor);
            const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
            renderInspectorQuotes(docs.map((d) => ({ quoteText: d.quoteText, page: d.meta.page })));
            toast("Citace uložena", "success");
          },
        });
        await pdf.load(buffer);
        const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
        await pdf.restoreHighlights(docs.map((d) => ({ anchor: d.meta.anchor, text: d.quoteText })));
        renderInspectorQuotes(docs.map((d) => ({ quoteText: d.quoteText, page: d.meta.page })));
      } else if (file.name.toLowerCase().endsWith(".epub")) {
        pushRecent({ ...state.book, slug: state.slug, kind: "epub" });
        pdf?.destroy();
        pdf = null;
        mountReaderChrome("epub", state.book.title);
        const epubRoot = stageMain.querySelector("#epub-root") as HTMLElement;
        epub = new EpubReader({
          container: epubRoot,
          getMode: () => state.mode,
          onHighlight: async ({ text, cfi, anchor }) => {
            await saveQuote(state.libraryRoot, state.book!, state.slug, text, cfi, anchor);
            const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
            renderInspectorQuotes(docs.map((d) => ({ quoteText: d.quoteText, page: d.meta.page })));
            toast("Citace uložena", "success");
          },
        });
        await epub.load(new File([buffer], file.name, { type: "application/epub+zip" }));
        const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
        await epub.restoreHighlights(docs.map((d) => ({ anchor: d.meta.anchor })));
        renderInspectorQuotes(docs.map((d) => ({ quoteText: d.quoteText, page: d.meta.page })));
      } else {
        throw new Error("Nepodporovaný formát — použijte PDF nebo EPUB.");
      }

      state.route = "reader";
      setRoute("reader");
      state.inspectorOpen = true;
      syncInspectorChrome();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(msg);
      toast(msg, "error");
      console.error(err);
    }
  };

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void openBookFile(file);
    fileInput.value = "";
  });

  sidebar.querySelectorAll("[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const route = (btn as HTMLElement).dataset.route as Route;
      if (route !== "reader") {
        pdf?.destroy();
        epub?.destroy();
        pdf = null;
        epub = null;
      }
      setRoute(route);
    });
  });

  highlightBtn.addEventListener("click", () => {
    state.mode = state.mode === "highlight" ? "off" : "highlight";
    const on = state.mode === "highlight";
    highlightBtn.dataset.active = String(on);
    toast(on ? "Režim zvýrazňování zapnutý" : "Režim zvýrazňování vypnutý");
  });

  backlinksBtn.addEventListener("click", () => {
    state.inspectorOpen = !state.inspectorOpen;
    syncInspectorChrome();
  });

  inspector.querySelector("#btn-hide-inspector")?.addEventListener("click", () => {
    state.inspectorOpen = false;
    syncInspectorChrome();
  });

  window.addEventListener("keydown", (ev) => {
    if (ev.ctrlKey && ev.key.toLowerCase() === "o") {
      ev.preventDefault();
      fileInput.click();
    }
    if (ev.ctrlKey && ev.key.toLowerCase() === "f") {
      ev.preventDefault();
      setRoute("search");
    }
    if (ev.key === "Escape") {
      state.inspectorOpen = false;
      syncInspectorChrome();
    }
  });

  if (state.libraryRoot) {
    void openLibraryIndex();
    setLibraryPath(state.libraryRoot, state.libraryRoot);
  }

  syncInspectorChrome();
  setRoute("library");
  renderInspectorQuotes([]);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}