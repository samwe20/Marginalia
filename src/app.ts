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
import {
  disableDemoData,
  enableDemoData,
  getDemoBook,
  getDemoBooks,
  getDemoQuote,
  getDemoQuotes,
  getDemoQuotesForBook,
  isDemoEnabled,
  searchDemoQuotes,
} from "./lib/demo-data";
import { escapeAttr, escapeHtml } from "./lib/html";
import { icons } from "./ui/icons";
import {
  renderBookDetailPage,
  renderDemoBookCard,
  renderQuoteDbCard,
  renderQuoteDetail,
} from "./ui/catalog";
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
    detailBookSlug: null as string | null,
    detailQuoteId: null as string | null,
    quotesFilterBook: "",
    quotesFilterTag: "",
    quotesFilterText: "",
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
    state.detailBookSlug = null;
    state.detailQuoteId = null;
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

  const bindDemoNavigation = () => {
    stageMain.querySelectorAll("[data-demo-book]").forEach((el) => {
      el.addEventListener("click", () => {
        const slug = (el as HTMLElement).dataset.demoBook!;
        openBookDetail(slug);
      });
    });
    stageMain.querySelectorAll("[data-demo-quote]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = (el as HTMLElement).dataset.demoQuote!;
        openQuoteDetail(id);
      });
    });
  };

  const openBookDetail = (slug: string) => {
    const book = getDemoBook(slug);
    if (!book) return;
    state.detailBookSlug = slug;
    state.route = "library";
    setContextTitle(book.title);
    const quotes = getDemoQuotesForBook(slug);
    stageMain.innerHTML = renderBookDetailPage(book, quotes);
    stageMain.querySelector("#btn-back-library-detail")?.addEventListener("click", () => setRoute("library"));
    bindDemoNavigation();
    state.inspectorOpen = true;
    syncInspectorChrome();
    renderInspectorQuotes(
      quotes.map((q) => ({ quoteText: q.quoteText, page: q.page })),
    );
  };

  const openQuoteDetail = (id: string) => {
    const quote = getDemoQuote(id);
    if (!quote) return;
    const book = getDemoBook(quote.bookSlug);
    state.detailQuoteId = id;
    state.route = "quotes";
    setContextTitle("Citace");
    stageMain.innerHTML = renderQuoteDetail(quote, book);
    stageMain.querySelector("#btn-back-quotes")?.addEventListener("click", () => setRoute("quotes"));
    state.inspectorOpen = true;
    syncInspectorChrome();
    renderInspectorQuotes([{ quoteText: quote.quoteText, page: quote.page }]);
  };

  const renderLibrary = () => {
    const recent = getRecentBooks();
    const demoBooks = isDemoEnabled() ? getDemoBooks() : [];
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
          demoBooks.length
            ? `<section class="library-section">
          <h2 class="section-title">Ukázková knihovna</h2>
          <p class="muted section-hint">Vizuální náhled — data jsou oddělená od vašich souborů.</p>
          <div class="book-grid book-grid--demo">${demoBooks.map((b) => renderDemoBookCard(b)).join("")}</div>
        </section>`
            : ""
        }
        ${
          recent.length
            ? `<section class="library-section">
            <h2 class="section-title">Nedávno otevřené</h2>
            <div class="book-grid">${recent
                .map(
                  (b) => `
              <button type="button" class="book-card" data-slug="${escapeAttr(b.slug)}" data-kind="${b.kind}" title="${escapeAttr(b.title)}">
                <div class="book-card__cover book-card__cover--letter">${escapeHtml(b.title.slice(0, 1).toUpperCase())}</div>
                <div class="book-card__title">${escapeHtml(b.title)}</div>
                <div class="book-card__meta">${b.kind.toUpperCase()}</div>
              </button>`,
                )
                .join("")}</div></section>`
            : demoBooks.length
              ? ""
              : `<p class="muted">Knihovna je prázdná — začněte otevřením knihy nebo načtěte ukázková data v Nastavení.</p>`
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
    stageMain.querySelectorAll(".book-card:not(.book-card--demo)").forEach((card) => {
      card.addEventListener("click", () => {
        toast("Znovu otevřete knihu přes Otevřít knihu… (prototype bez cache souboru).", "info");
      });
    });
    bindDemoNavigation();
  };

  const renderQuotesOverview = () => {
    if (!isDemoEnabled()) {
      stageMain.innerHTML = `
        <div class="page">
          <h1>Databáze citací</h1>
          <p class="muted">Zatím nemáte načtená ukázková data. V Nastavení zvolte <strong>Načíst ukázková data</strong>, nebo vytvářejte citace při čtení vlastních knih.</p>
        </div>`;
      return;
    }
    const books = getDemoBooks();
    const allTags = [...new Set(getDemoQuotes().flatMap((q) => q.tags))].sort();
    let quotes = getDemoQuotes();
    if (state.quotesFilterBook) quotes = quotes.filter((q) => q.bookSlug === state.quotesFilterBook);
    if (state.quotesFilterTag) quotes = quotes.filter((q) => q.tags.includes(state.quotesFilterTag));
    if (state.quotesFilterText.trim()) {
      const ids = new Set(searchDemoQuotes(state.quotesFilterText).map((q) => q.id));
      quotes = quotes.filter((q) => ids.has(q.id));
    }
    const bookMap = new Map(books.map((b) => [b.slug, b]));
    stageMain.innerHTML = `
      <div class="page page--wide">
        <h1>Databáze citací</h1>
        <p class="muted">Ukázkové citace a poznámky — filtrujte podle knihy, štítku nebo textu.</p>
        <div class="filters-bar">
          <label class="field field--inline">
            <span>Knihy</span>
            <select id="filter-book">
              <option value="">Všechny knihy</option>
              ${books.map((b) => `<option value="${escapeAttr(b.slug)}" ${state.quotesFilterBook === b.slug ? "selected" : ""}>${escapeHtml(b.title)}</option>`).join("")}
            </select>
          </label>
          <label class="field field--inline">
            <span>Hledat v citacích</span>
            <input type="search" id="filter-text" value="${escapeAttr(state.quotesFilterText)}" placeholder="Text citace nebo poznámky…" />
          </label>
        </div>
        <div class="tag-row tag-row--filter" role="group" aria-label="Filtr štítků">
          <button type="button" class="tag-chip tag-chip--btn ${state.quotesFilterTag === "" ? "tag-chip--on" : ""}" data-tag="">Vše</button>
          ${allTags.map((t) => `<button type="button" class="tag-chip tag-chip--btn ${state.quotesFilterTag === t ? "tag-chip--on" : ""}" data-tag="${escapeAttr(t)}">${escapeHtml(t)}</button>`).join("")}
        </div>
        <p class="muted results-count">${quotes.length} citací</p>
        <div class="quote-db-grid">
          ${quotes.map((q) => renderQuoteDbCard(q, bookMap.get(q.bookSlug))).join("")}
        </div>
      </div>`;
    const rerender = () => renderQuotesOverview();
    stageMain.querySelector<HTMLSelectElement>("#filter-book")?.addEventListener("change", (ev) => {
      state.quotesFilterBook = (ev.target as HTMLSelectElement).value;
      rerender();
    });
    stageMain.querySelector<HTMLInputElement>("#filter-text")?.addEventListener("input", (ev) => {
      state.quotesFilterText = (ev.target as HTMLInputElement).value;
      rerender();
    });
    stageMain.querySelectorAll(".tag-chip--btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.quotesFilterTag = (btn as HTMLElement).dataset.tag ?? "";
        rerender();
      });
    });
    bindDemoNavigation();
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
    const runSearch = async (q: string) => {
      const box = stageMain.querySelector("#search-results")!;
      if (!q) {
        box.innerHTML = "";
        return;
      }
      const parts: string[] = [];
      if (isDemoEnabled()) {
        const demoHits = searchDemoQuotes(q);
        if (demoHits.length) {
          const bookMap = new Map(getDemoBooks().map((b) => [b.slug, b]));
          parts.push(
            `<section><h2 class="section-title">Ukázková data</h2><div class="quote-db-grid">${demoHits
              .map((hit) => renderQuoteDbCard(hit, bookMap.get(hit.bookSlug)))
              .join("")}</div></section>`,
          );
        }
      }
      if (isTauri() && state.libraryRoot) {
        await openLibraryIndex();
        const { invoke } = await import("@tauri-apps/api/core");
        const hits = (await invoke("index_search", { query: q, limit: 20 })) as { snippet: string }[];
        if (hits.length) {
          parts.push(
            `<section><h2 class="section-title">Vaše knihovna</h2><ul class="quote-list">${hits
              .map((h) => `<li class="quote-card">${escapeHtml(h.snippet)}</li>`)
              .join("")}</ul></section>`,
          );
        }
      }
      if (!parts.length) {
        box.innerHTML = `<p class="muted">Nic nenalezeno.</p>`;
        return;
      }
      box.innerHTML = parts.join("");
      bindDemoNavigation();
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      void runSearch(input.value.trim());
    });
    input.addEventListener("input", () => {
      const q = input.value.trim();
      if (q.length >= 2 && isDemoEnabled()) void runSearch(q);
    });
  };

  const renderSettings = () => {
    const demoOn = isDemoEnabled();
    stageMain.innerHTML = `
      <div class="page">
        <h1>Nastavení</h1>
        <p class="muted">Složka pro soubory knih a citací (může být v OneDrive / iCloud).</p>
        <div class="page-actions">
          <button type="button" class="primary-btn" id="btn-settings-library">Vybrat složku knihovny…</button>
        </div>
        <p class="muted"><strong>Aktuální cesta:</strong> ${escapeHtml(state.libraryRoot || "—")}</p>
        <hr class="settings-sep" />
        <h2 class="section-title">Ukázková data</h2>
        <p class="muted">Ukázka knihovny, citací a poznámek pro náhled UI. Data zůstávají v aplikaci a <strong>nemíchejí se</strong> s vašimi soubory na disku.</p>
        <div class="page-actions">
          <button type="button" class="primary-btn" id="btn-demo-load" ${demoOn ? "disabled" : ""}>Načíst ukázková data</button>
          <button type="button" class="ghost-btn solid" id="btn-demo-remove" ${demoOn ? "" : "disabled"}>Odstranit ukázková data</button>
        </div>
        <p class="muted">Stav: ${demoOn ? "ukázková data jsou aktivní" : "vypnuto (výchozí)"}</p>
      </div>
    `;
    stageMain.querySelector("#btn-settings-library")?.addEventListener("click", () => void pickLibrary());
    stageMain.querySelector("#btn-demo-load")?.addEventListener("click", () => {
      enableDemoData();
      toast("Ukázková data načtena", "success");
      if (state.libraryRoot) setLibraryPath(state.libraryRoot, state.libraryRoot);
      else setLibraryPath("Ukázková knihovna aktivní");
      renderSettings();
      if (state.route === "library") renderLibrary();
    });
    stageMain.querySelector("#btn-demo-remove")?.addEventListener("click", () => {
      disableDemoData();
      state.quotesFilterBook = "";
      state.quotesFilterTag = "";
      state.quotesFilterText = "";
      toast("Ukázková data odstraněna", "info");
      if (state.libraryRoot) setLibraryPath(state.libraryRoot, state.libraryRoot);
      else setLibraryPath("Žádná knihovna");
      renderSettings();
      if (state.route === "library") renderLibrary();
      if (state.route === "quotes") renderQuotesOverview();
    });
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

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}