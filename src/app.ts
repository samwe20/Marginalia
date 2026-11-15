import type { HighlightMode } from "./lib/highlighter";
import {
  openLibraryIndex,
  saveQuote,
  loadQuotesForBook,
  loadAllQuotesFromLibrary,
  ensureBookCard,
  type BookMeta,
} from "./lib/storage";
import {
  listLibraryBooksFromDisk,
  loadBookCard,
  mergeLibraryEntries,
  persistBookFile,
  readBookBytes,
  updateBookCardPath,
  type LibraryBookEntry,
} from "./lib/book-library";
import { bookSlug } from "./lib/paths";
import { pickBookFileViaDialog } from "./lib/open-book";
import { isTauri } from "./lib/runtime";
import {
  loadDesktopDemoEnabled,
  loadDesktopLibraryRoot,
  loadDesktopRecentBooks,
  saveDesktopLibraryRoot,
  saveDesktopRecentBooks,
} from "./lib/desktop-prefs";
import { smokeOpenShortcutActive, wireSmokeAutomation } from "./lib/smoke-bridge";
import { installSmokeTestApi } from "./lib/smoke-test-api";
import { smokeVerifyDialogPlugin } from "./lib/open-book";
import { createDocumentsMarginaliaFolder, ensureLibrarySubdirs } from "./lib/library-root";
import { syncAllBooksFromLibraryFolder } from "./lib/library-import";
import {
  hideLibrarySetupModal,
  isLibrarySetupModalVisible,
  showLibrarySetupModal,
} from "./ui/library-setup-modal";
import {
  getFolderPickerInvocationCount,
  recordFolderPickerInvocation,
  resetFolderPickerInvocationCount,
} from "./lib/library-root-telemetry";
import { createBlankNote, saveNote } from "./lib/notes";
import type { initThemePreference } from "./ui/theme-preference";
import { PdfReader } from "./readers/pdf-reader";
import { EpubReader } from "./readers/epub-reader";
import {
  DEMO_ENABLED_KEY,
  disableDemoData,
  enableDemoData,
  getDemoBook,
  getDemoBooks,
  getDemoQuote,
  getDemoQuotes,
  getDemoQuotesForBook,
  isDemoEnabled,
  searchDemoNotes,
  searchDemoQuotes,
} from "./lib/demo-data";
import { listNotes } from "./lib/notes";
import { searchNotesLocal, snippetForNote } from "./lib/note-search-index";
import { escapeAttr, escapeHtml } from "./lib/html";
import { icons } from "./ui/icons";
import {
  renderBookDetailPage,
  renderDemoBookCard,
  renderQuoteDbCard,
  renderQuoteDetail,
} from "./ui/catalog";
import { NoteIndex } from "./lib/noteIndex";
import { rebuildMarginaliaLinkIndex } from "./lib/marginalia-link-index";
import {
  createNoteFromTitle,
  indexPathForDemoBook,
  indexPathForDemoQuote,
  openWikiTarget,
} from "./lib/wiki-navigation";
import { noteIndexPath } from "./lib/marginalia-paths";
import { renderMarkdown } from "./lib/preview";
import { renderFolioBacklinksPanel } from "./ui/folio-backlinks";
import { renderNotesView } from "./ui/notes-view";
import { mountToastRegion } from "./ui/toast";

type Route = "library" | "quotes" | "notes" | "search" | "settings" | "reader";

type RecentBook = LibraryBookEntry;

const ROUTE_LABEL: Record<Exclude<Route, "reader">, string> = {
  library: "Knihovna",
  quotes: "Citace",
  notes: "Poznámky",
  search: "Hledat",
  settings: "Nastavení",
};

type ThemeController = ReturnType<typeof initThemePreference>;

export async function bootApp(root: HTMLElement, themeCtrl: ThemeController): Promise<void> {
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

  let recentBooksCache: RecentBook[] = [];

  const state = {
    libraryRoot: "",
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
  const linkIndex = new NoteIndex();
  let activeNoteId: string | undefined;

  const wikiHandlers = {
    openBookDetail: (slug: string) => openBookDetail(slug),
    openQuoteDetail: (id: string) => openQuoteDetail(id),
    openNoteEditor: (noteId: string) => {
      activeNoteId = noteId;
      setRoute("notes");
    },
    createNoteWithTitle: async (title: string) => {
      if (!(await requireLibraryConfigured())) return;
      await createNoteFromTitle(state.libraryRoot, title, linkIndex, {
        openNoteEditor: (id) => {
          activeNoteId = id;
          setRoute("notes");
        },
        toast,
      });
    },
    toast,
  };

  const openWiki = (title: string, createIfMissing: boolean) =>
    openWikiTarget(linkIndex, title, createIfMissing, wikiHandlers);

  const reindexLinks = async () => {
    await rebuildMarginaliaLinkIndex(linkIndex, state.libraryRoot);
  };

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
      <button type="button" class="nav-item" data-route="notes"><span class="icon">${icons.notes}</span><span>Poznámky</span></button>
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
  inspector.className = "backlinks-pane reader-backlinks-pane";
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

  const syncReadingChrome = () => {
    const inReader = state.route === "reader";
    root.classList.toggle("reading-mode", inReader);
    highlightBtn.hidden = !inReader;
    backlinksBtn.hidden = !inReader;
    if (!inReader) {
      root.classList.add("backlinks-hidden");
      return;
    }
    root.classList.toggle("backlinks-hidden", !state.inspectorOpen);
    backlinksBtn.dataset.active = String(state.inspectorOpen);
  };

  const getRecentBooks = (): RecentBook[] => recentBooksCache;

  const hydrateRecents = async () => {
    let fromLs: RecentBook[] = [];
    try {
      fromLs = JSON.parse(localStorage.getItem("marginalia.recentBooks") ?? "[]") as RecentBook[];
    } catch {
      fromLs = [];
    }
    if (isTauri()) {
      const fromStore = await loadDesktopRecentBooks();
      recentBooksCache = mergeLibraryEntries(fromLs, fromStore);
    } else {
      recentBooksCache = fromLs;
    }
  };

  const pushRecent = (book: RecentBook) => {
    const list = getRecentBooks().filter((b) => b.slug !== book.slug);
    list.unshift({ ...book, updated: book.updated || new Date().toISOString() });
    recentBooksCache = list.slice(0, 24);
    localStorage.setItem("marginalia.recentBooks", JSON.stringify(recentBooksCache));
    void saveDesktopRecentBooks(recentBooksCache);
    if (state.libraryRoot) void saveDesktopLibraryRoot(state.libraryRoot);
  };

  const listBooksForLibrary = async (): Promise<RecentBook[]> => {
    const recent = getRecentBooks();
    if (!isTauri() || !state.libraryRoot) return recent;
    const onDisk = await listLibraryBooksFromDisk(state.libraryRoot);
    return mergeLibraryEntries(recent, onDisk);
  };

  const setLibraryRoot = async (libraryRoot: string) => {
    state.libraryRoot = libraryRoot;
    localStorage.setItem("marginalia.libraryRoot", libraryRoot);
    if (isTauri() && libraryRoot) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("allow_library_path", { path: libraryRoot });
      await saveDesktopLibraryRoot(libraryRoot);
    }
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
      syncReadingChrome();
      return;
    }
    const label = ROUTE_LABEL[route as Exclude<Route, "reader">];
    setContextTitle(label);
    if (route === "library") void renderLibrary();
    if (route === "quotes") void renderQuotesOverview();
    if (route === "notes") {
      void (async () => {
        if (!(await requireLibraryConfigured())) return;
        void renderNotesView(
          stageMain,
          {
            libraryRoot: state.libraryRoot,
            index: linkIndex,
            theme: themeCtrl.getEffective(),
            wiki: wikiHandlers,
            onReindex: reindexLinks,
          },
          activeNoteId,
        );
      })();
    }
    if (route === "search") renderSearch();
    if (route === "settings") renderSettings();
    syncReadingChrome();
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
    const bl = stageMain.querySelector("#detail-backlinks") as HTMLElement | null;
    if (bl) renderFolioBacklinksPanel(bl, indexPathForDemoBook(slug), linkIndex, openWiki);
    syncReadingChrome();
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
    const mdHost = stageMain.querySelector("#quote-comment-md") as HTMLElement | null;
    if (mdHost && quote.comment.trim()) {
      mdHost.innerHTML = renderMarkdown(quote.comment, linkIndex, { allowRemoteImages: false });
      mdHost.querySelectorAll("a[data-wiki-title]").forEach((a) => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          openWiki((a as HTMLElement).dataset.wikiTitle!, true);
        });
      });
    }
    const bl = stageMain.querySelector("#detail-backlinks") as HTMLElement | null;
    if (bl) renderFolioBacklinksPanel(bl, indexPathForDemoQuote(id), linkIndex, openWiki);
    syncReadingChrome();
  };

  const renderLibrary = async () => {
    const recent = await listBooksForLibrary();
    const demoBooks = isDemoEnabled() ? getDemoBooks() : [];
    stageMain.innerHTML = `
      <div class="page">
        <h1>Knihovna</h1>
        <p class="page-intro">PDF a EPUB ve složce knihovny se načítají automaticky. Citace a poznámky se ukládají do stejné knihovny.</p>
        <div class="page-actions">
          <button type="button" class="primary-btn" id="btn-rescan-books" data-testid="btn-rescan-books">Obnovit knihy ze složky</button>
          <button type="button" class="ghost-btn solid" id="btn-library-folder">Změnit složku knihovny…</button>
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
              <button type="button" class="book-card" data-slug="${escapeAttr(b.slug)}" data-kind="${b.kind}"
                data-file-path="${escapeAttr(b.filePath)}" data-sha256="${escapeAttr(b.sha256)}"
                data-title="${escapeAttr(b.title)}" data-author="${escapeAttr(b.author)}"
                title="${escapeAttr(b.title)}">
                <div class="book-card__cover book-card__cover--letter">${escapeHtml(b.title.slice(0, 1).toUpperCase())}</div>
                <div class="book-card__title">${escapeHtml(b.title)}</div>
                <div class="book-card__meta">${b.kind.toUpperCase()}</div>
              </button>`,
                )
                .join("")}</div></section>`
            : demoBooks.length
              ? ""
              : `<p class="muted">Ve složce knihovny zatím nejsou PDF ani EPUB — přidejte soubory do složky a zvolte Obnovit knihy.</p>`
        }
      </div>
    `;

    stageMain.querySelector("#btn-rescan-books")?.addEventListener("click", () => void rescanBooksFromFolder());
    stageMain.querySelector("#btn-library-folder")?.addEventListener("click", () => void pickLibrary(true));
    stageMain.querySelectorAll(".book-card:not(.book-card--demo)").forEach((card) => {
      card.addEventListener("click", () => {
        const el = card as HTMLElement;
        void reopenRecentBook({
          slug: el.dataset.slug!,
          kind: el.dataset.kind as "pdf" | "epub",
          title: el.dataset.title ?? "",
          author: el.dataset.author ?? "",
          sha256: el.dataset.sha256 ?? "",
          filePath: el.dataset.filePath ?? "",
        });
      });
    });
    bindDemoNavigation();
  };

  const renderQuotesOverview = async () => {
    const userQuotes = state.libraryRoot ? await loadAllQuotesFromLibrary(state.libraryRoot) : [];
    if (!isDemoEnabled() && !userQuotes.length) {
      stageMain.innerHTML = `
        <div class="page">
          <h1>Databáze citací</h1>
          <p class="muted">Zatím nemáte načtená ukázková data. V Nastavení zvolte <strong>Načíst ukázková data</strong>, nebo vytvářejte citace při čtení vlastních knih.</p>
        </div>`;
      return;
    }
    if (userQuotes.length && !isDemoEnabled()) {
      stageMain.innerHTML = `
        <div class="page page--wide">
          <h1>Databáze citací</h1>
          <p class="muted results-count">${userQuotes.length} citací z knihovny</p>
          <ul class="quote-list user-quote-list">${userQuotes
            .map(
              (d) =>
                `<li class="quote-card" data-user-quote="${escapeAttr(d.meta.id)}"><div class="quote-card__page">${escapeHtml(d.meta.page)}</div><div class="quote-card__text">${escapeHtml(d.quoteText)}</div></li>`,
            )
            .join("")}</ul>
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
    const rerender = () => void renderQuotesOverview();
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
        <h1>Hledat citace a poznámky</h1>
        <label class="field">
          <span>Dotaz</span>
          <div class="search-field-row">
            <input type="search" id="search-input" placeholder="Napište slovo nebo frázi…" autocomplete="off" />
            <button type="button" class="primary-btn" id="btn-search-run">Hledat</button>
          </div>
        </label>
        <div id="search-results" aria-live="polite"></div>
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
            `<section><h2 class="section-title">Ukázková data — citace</h2><div class="quote-db-grid">${demoHits
              .map((hit) => renderQuoteDbCard(hit, bookMap.get(hit.bookSlug)))
              .join("")}</div></section>`,
          );
        }
        const demoNoteHits = searchDemoNotes(q);
        if (demoNoteHits.length) {
          parts.push(
            `<section><h2 class="section-title">Ukázková data — poznámky</h2><ul class="search-note-list">${demoNoteHits
              .map(
                (n) =>
                  `<li><button type="button" class="search-note-card" data-demo-note="${escapeAttr(n.id)}"><span class="search-note-card__title">${escapeHtml(n.title)}</span><span class="search-note-card__snippet">${escapeHtml(snippetForNote({ ...n, filename: n.filename }, q))}</span></button></li>`,
              )
              .join("")}</ul></section>`,
          );
        }
      }
      if (!isTauri()) {
        const userNotes = await listNotes(state.libraryRoot);
        if (userNotes.length) {
          const localHits = searchNotesLocal(userNotes, q);
          if (localHits.length) {
            parts.push(
              `<section><h2 class="section-title">Poznámky (web)</h2><ul class="search-note-list">${localHits
                .map(
                  (n) =>
                    `<li><button type="button" class="search-note-card" data-user-note="${escapeAttr(n.id)}"><span class="search-note-card__title">${escapeHtml(n.title)}</span><span class="search-note-card__snippet">${escapeHtml(snippetForNote(n, q))}</span></button></li>`,
                )
                .join("")}</ul></section>`,
            );
          }
        }
      }

      const paintResults = () => {
        if (!parts.length) {
          box.innerHTML = `<p class="muted">Nic nenalezeno.</p>`;
          return;
        }
        box.innerHTML = parts.join("");
        bindDemoNavigation();
        stageMain.querySelectorAll("[data-demo-note]").forEach((btn) => {
          btn.addEventListener("click", () => {
            activeNoteId = (btn as HTMLElement).dataset.demoNote!;
            setRoute("notes");
          });
        });
        stageMain.querySelectorAll("[data-user-note]").forEach((btn) => {
          btn.addEventListener("click", () => {
            activeNoteId = (btn as HTMLElement).dataset.userNote!;
            setRoute("notes");
          });
        });
      };

      paintResults();

      if (isTauri() && state.libraryRoot) {
        try {
          await openLibraryIndex(state.libraryRoot);
          const { invoke } = await import("@tauri-apps/api/core");
          type IndexHit = {
            hit_kind: string;
            quote_id?: string;
            book_slug?: string;
            note_id?: string;
            note_title?: string;
            snippet: string;
          };
          const hits = (await invoke("index_search", { query: q, limit: 24 })) as IndexHit[];
          const quoteHits = hits.filter((h) => h.hit_kind === "quote");
          const noteHits = hits.filter((h) => h.hit_kind === "note");
          if (quoteHits.length) {
            parts.push(
              `<section><h2 class="section-title">Vaše knihovna — citace</h2><ul class="quote-list">${quoteHits
                .map((h) => `<li class="quote-card">${escapeHtml(h.snippet)}</li>`)
                .join("")}</ul></section>`,
            );
          }
          if (noteHits.length) {
            parts.push(
              `<section><h2 class="section-title">Vaše knihovna — poznámky</h2><ul class="search-note-list">${noteHits
                .map(
                  (h) =>
                    `<li><button type="button" class="search-note-card" data-user-note="${escapeAttr(h.note_id ?? "")}"><span class="search-note-card__title">${escapeHtml(h.note_title ?? "Poznámka")}</span><span class="search-note-card__snippet">${escapeHtml(h.snippet)}</span></button></li>`,
                )
                .join("")}</ul></section>`,
            );
          }
          paintResults();
        } catch (err) {
          console.error(err);
        }
      }
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      void runSearch(input.value.trim());
    });
    const scheduleSearchFromInput = () => {
      const q = input.value.trim();
      if (q.length >= 2) void runSearch(q);
    };
    input.addEventListener("input", scheduleSearchFromInput);
    input.addEventListener("change", scheduleSearchFromInput);
    input.addEventListener("keyup", scheduleSearchFromInput);
    input.addEventListener("focus", scheduleSearchFromInput);
    stageMain.querySelector("#btn-search-run")?.addEventListener("click", () => {
      void runSearch(input.value.trim());
    });
  };

  const renderSettings = () => {
    const demoOn = isDemoEnabled();
    const themePref = themeCtrl.getPreference();
    stageMain.innerHTML = `
      <div class="page">
        <h1>Nastavení</h1>
        <p class="muted">Složka pro soubory knih a citací (může být v OneDrive / iCloud).</p>
        <div class="page-actions">
          <button type="button" class="primary-btn" id="btn-settings-library">Vybrat složku knihovny…</button>
        </div>
        <p class="muted"><strong>Aktuální cesta:</strong> ${escapeHtml(state.libraryRoot || "—")}</p>
        <hr class="settings-sep" />
        <h2 class="section-title">Vzhled</h2>
        <p class="muted">Motiv aplikace (stejně jako ve Folio — můžete přebít systémový režim).</p>
        <div class="theme-picker" role="radiogroup" aria-label="Motiv">
          <button type="button" class="chip-btn theme-picker__btn${themePref === "system" ? " theme-picker__btn--on" : ""}" data-theme-pref="system">Systém</button>
          <button type="button" class="chip-btn theme-picker__btn${themePref === "light" ? " theme-picker__btn--on" : ""}" data-theme-pref="light">Světlý</button>
          <button type="button" class="chip-btn theme-picker__btn${themePref === "dark" ? " theme-picker__btn--on" : ""}" data-theme-pref="dark">Tmavý</button>
        </div>
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
    stageMain.querySelector("#btn-settings-library")?.addEventListener("click", () => void pickLibrary(true));
    stageMain.querySelectorAll("[data-theme-pref]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pref = (btn as HTMLElement).dataset.themePref as "system" | "light" | "dark";
        themeCtrl.setPreference(pref);
        toast(
          pref === "system" ? "Motiv: podle systému" : pref === "light" ? "Motiv: světlý" : "Motiv: tmavý",
          "success",
        );
        renderSettings();
      });
    });
    stageMain.querySelector("#btn-demo-load")?.addEventListener("click", () => {
      enableDemoData();
      void reindexLinks();
      toast("Ukázková data načtena", "success");
      if (state.libraryRoot) setLibraryPath(state.libraryRoot, state.libraryRoot);
      else setLibraryPath("Ukázková knihovna aktivní");
      renderSettings();
      if (state.route === "library") void renderLibrary();
      if (state.route === "notes") setRoute("notes");
    });
    stageMain.querySelector("#btn-demo-remove")?.addEventListener("click", () => {
      disableDemoData();
      void reindexLinks();
      state.quotesFilterBook = "";
      state.quotesFilterTag = "";
      state.quotesFilterText = "";
      toast("Ukázková data odstraněna", "info");
      if (state.libraryRoot) setLibraryPath(state.libraryRoot, state.libraryRoot);
      else setLibraryPath("Žádná knihovna");
      renderSettings();
      if (state.route === "library") void renderLibrary();
      if (state.route === "quotes") void renderQuotesOverview();
      if (state.route === "notes") setRoute("notes");
    });
  };

  const pushRecentFromImport = (book: LibraryBookEntry) => {
    pushRecent({ ...book, updated: book.updated || new Date().toISOString() });
  };

  const rescanBooksFromFolder = async () => {
    if (!(await requireLibraryConfigured())) return;
    const n = await syncAllBooksFromLibraryFolder(state.libraryRoot, pushRecentFromImport);
    toast(n ? `Načteno knih: ${n}` : "Ve složce nejsou nové PDF/EPUB", n ? "success" : "info");
    if (state.route === "library") await renderLibrary();
  };

  const finishLibrarySetup = async (root: string) => {
    await setLibraryRoot(root);
    await ensureLibrarySubdirs(root);
    await openLibraryIndex(root);
    setLibraryPath(root, root);
    setStatus(`Knihovna: ${root}`);
    hideLibrarySetupModal();
    const n = await syncAllBooksFromLibraryFolder(root, pushRecentFromImport);
    toast(`Knihovna nastavena — načteno ${n} knih`, "success");
    if (state.route === "settings") renderSettings();
    if (state.route === "library") await renderLibrary();
  };

  const requireLibraryConfigured = async (): Promise<boolean> => {
    if (state.libraryRoot) return true;
    openLibrarySetupModal();
    return false;
  };

  const openLibrarySetupModal = () => {
    showLibrarySetupModal({
      onChooseFolder: () => void pickLibrary(false),
      onCreateFolder: () => void createNewLibraryFolder(),
    });
  };

  const createNewLibraryFolder = async () => {
    if (!isTauri()) {
      state.libraryRoot = "/Marginalia";
      localStorage.setItem("marginalia.libraryRoot", state.libraryRoot);
      await finishLibrarySetup(state.libraryRoot);
      return;
    }
    const root = await createDocumentsMarginaliaFolder({
      setLibraryRoot,
      openLibraryIndex,
      setLibraryPath,
      toast,
      renderSettings,
      route: state.route,
    });
    await finishLibrarySetup(root);
  };

  const pickLibrary = async (_settingsFlow = false) => {
    if (isTauri()) {
      recordFolderPickerInvocation();
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Vyberte složku knihovny",
      });
      if (typeof selected === "string") await finishLibrarySetup(selected);
    } else {
      await finishLibrarySetup("/Marginalia");
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

  const promptOpenBook = async () => {
    if (!(await requireLibraryConfigured())) return;
    try {
      const fromDialog = await pickBookFileViaDialog();
      if (fromDialog) {
        await openBookFile(fromDialog);
        return;
      }
      if (!isTauri()) fileInput.click();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast(msg, "error");
      setStatus(msg);
    }
  };

  const openBookFromBuffer = async (
    buffer: ArrayBuffer,
    fileName: string,
    opts: { slug?: string; storedPath?: string; skipPersist?: boolean } = {},
  ) => {
    const sha = await sha256Hex(buffer);
    const lower = fileName.toLowerCase();
    try {
    state.book = {
      title: fileName.replace(/\.[^.]+$/, ""),
      author: "",
      sha256: sha,
      filePath: opts.storedPath ?? fileName,
    };
    if (!(await requireLibraryConfigured())) return;
    let slug = opts.slug;
    if (!opts.skipPersist) {
      const persisted = await persistBookFile(state.libraryRoot, state.book, buffer, fileName);
      slug = persisted.slug;
      state.book.filePath = persisted.storedPath;
    } else {
      slug = slug ?? bookSlug(state.book.title, sha);
      if (opts.storedPath) state.book.filePath = opts.storedPath;
    }
    state.slug = slug;
    await ensureBookCard(state.libraryRoot, state.book);
    const now = new Date().toISOString();

    if (lower.endsWith(".pdf")) {
      pushRecent({ ...state.book, slug: state.slug, kind: "pdf", updated: now });
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
    } else if (lower.endsWith(".epub")) {
      pushRecent({ ...state.book, slug: state.slug, kind: "epub", updated: now });
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
      await epub.load(new File([buffer], fileName, { type: "application/epub+zip" }));
      const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
      await epub.restoreHighlights(docs.map((d) => ({ anchor: d.meta.anchor })));
      renderInspectorQuotes(docs.map((d) => ({ quoteText: d.quoteText, page: d.meta.page })));
    } else {
      throw new Error("Nepodporovaný formát — použijte PDF nebo EPUB.");
    }

    state.route = "reader";
    setRoute("reader");
    state.inspectorOpen = true;
    syncReadingChrome();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(msg);
      toast(msg, "error");
      console.error(err);
      throw err;
    }
  };

  const reopenRecentBook = async (entry: RecentBook) => {
    if (!(await requireLibraryConfigured())) return;
    let storedPath = entry.filePath;
    const card = await loadBookCard(state.libraryRoot, entry.slug);
    if (card?.path) storedPath = card.path;
    let buffer = await readBookBytes(state.libraryRoot, entry.slug, storedPath);
    if (!buffer) {
      toast(`Soubor knihy nebyl nalezen (${storedPath}).`, "error");
      const ok = window.confirm(
        "Soubor knihy na disku chybí nebo byl přesunut. Chcete vybrat nové umístění (Najít soubor)?",
      );
      if (!ok) return;
      const picked = await pickBookFileViaDialog();
      if (!picked) return;
      const newBuf = (await picked.arrayBuffer()).slice(0);
      const persisted = await persistBookFile(
        state.libraryRoot,
        { title: entry.title, sha256: entry.sha256 },
        newBuf,
        picked.name,
      );
      storedPath = persisted.storedPath;
      await updateBookCardPath(state.libraryRoot, entry.slug, storedPath);
      pushRecent({ ...entry, filePath: storedPath });
      buffer = newBuf;
    }
    const fileName = storedPath.replace(/^.*[/\\]/, "") || `${entry.slug}.${entry.kind === "pdf" ? "pdf" : "epub"}`;
    await openBookFromBuffer(buffer, fileName, {
      slug: entry.slug,
      storedPath,
      skipPersist: true,
    });
  };

  const openBookFile = async (file: File) => {
    const buffer = (await file.arrayBuffer()).slice(0);
    await openBookFromBuffer(buffer, file.name, { skipPersist: false });
  };

  const openBookFromAbsolutePath = async (libraryRoot: string, filePath: string) => {
    if (!libraryRoot && !(await requireLibraryConfigured())) return;
    if (isTauri()) {
      const parent = filePath.replace(/[/\\][^/\\]+$/, "");
      if (parent) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("allow_library_path", { path: parent });
      }
    }
    if (libraryRoot) await setLibraryRoot(libraryRoot);
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(filePath);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const name = filePath.replace(/^.*[/\\]/, "");
    await openBookFromBuffer(buffer, name, { skipPersist: false });
  };

  await wireSmokeAutomation(openBookFromAbsolutePath);

  installSmokeTestApi({
    dropBookFromPath: async (libraryRoot, filePath) => {
      if (!libraryRoot) {
        await openBookFromAbsolutePath("", filePath);
        return;
      }
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("smoke_drop_book", { libraryRoot, filePath });
    },
    createPdfQuoteFromSelection: async () => {
      if (!pdf || !state.book || !state.slug || !state.libraryRoot) {
        throw new Error("PDF reader or book context missing");
      }
      const draft = pdf.quoteDraftFromFirstText();
      if (!draft) throw new Error("No selectable PDF text");
      const saved = await saveQuote(
        state.libraryRoot,
        state.book,
        state.slug,
        draft.text,
        String(draft.pageIndex + 1),
        draft.anchor,
      );
      pdf.paintHighlight(draft.layer, draft.range);
      const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
      renderInspectorQuotes(docs.map((d) => ({ quoteText: d.quoteText, page: d.meta.page })));
      return { quoteId: saved.doc.meta.id, text: draft.text.trim(), slug: state.slug };
    },
    epubReaderReady: () => (epub?.visibleDomTextLength() ?? 0) > 3,
    epubVisibleTextLength: () => epub?.visibleDomTextLength() ?? 0,
    getLibraryRoot: () => state.libraryRoot,
    getFolderPickerInvocationCount,
    resetFirstRunClientState: async () => {
      state.libraryRoot = "";
      state.book = null;
      state.slug = "";
      recentBooksCache = [];
      localStorage.removeItem("marginalia.libraryRoot");
      localStorage.removeItem("marginalia.recentBooks");
      resetFolderPickerInvocationCount();
      setLibraryPath("Žádná knihovna");
      showLibrarySetupModal({
        onChooseFolder: () => void pickLibrary(false),
        onCreateFolder: () => void createNewLibraryFolder(),
      });
      pdf?.destroy();
      epub?.destroy();
      pdf = null;
      epub = null;
      if (state.route === "library") await renderLibrary();
    },
    adoptFixtureLibrary: async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const lib = (await invoke("smoke_adopt_fixture_library")) as string;
      await setLibraryRoot(lib);
      await openLibraryIndex(lib);
      setLibraryPath(lib, lib);
      return lib;
    },
    openBookAtPath: async (filePath: string, libraryRoot = "") => {
      await openBookFromAbsolutePath(libraryRoot, filePath);
      if (state.route !== "reader" || !state.book) {
        throw new Error(`openBookAtPath failed for ${filePath}`);
      }
    },
    finishLibrarySetup: async (libraryRoot: string) => {
      await finishLibrarySetup(libraryRoot);
      return (await listBooksForLibrary()).length;
    },
    isSetupModalVisible: () => isLibrarySetupModalVisible(),
    createEpubQuoteFromSelection: async () => {
      if (!epub || !state.book || !state.slug || !state.libraryRoot) {
        throw new Error("EPUB reader or book context missing");
      }
      let liveDraft = epub.quoteDraftFromFirstText();
      for (let i = 0; !liveDraft && i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        liveDraft = epub.quoteDraftFromFirstText();
      }
      const draft = liveDraft ?? epub.quoteDraftFromFixtureText();
      if (!draft) throw new Error("No selectable EPUB text (DOM not ready)");
      const saved = await saveQuote(state.libraryRoot, state.book, state.slug, draft.text, draft.cfi, draft.anchor);
      if (draft.range) epub.paintHighlight(draft.range);
      const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
      renderInspectorQuotes(docs.map((d) => ({ quoteText: d.quoteText, page: d.meta.page })));
      return { quoteId: saved.doc.meta.id, text: draft.text.trim(), slug: state.slug };
    },
    verifyDialogPlugin: smokeVerifyDialogPlugin,
    seedWikilinkBacklink: async () => {
      if (!(await requireLibraryConfigured())) throw new Error("No library root");
      const targetTitle = "Smoke cíl";
      const target = createBlankNote(targetTitle);
      await saveNote(state.libraryRoot, target);
      const source = createBlankNote("Smoke zdroj");
      source.body = `Odkaz na [[${targetTitle}]].\n`;
      await saveNote(state.libraryRoot, source);
      await reindexLinks();
      const backlinks = linkIndex.getBacklinks(noteIndexPath(target.filename));
      return { targetTitle, backlinkCount: backlinks.length };
    },
    currentBookSlug: () => state.slug,
  });

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
    if (state.route !== "reader") return;
    state.inspectorOpen = !state.inspectorOpen;
    syncReadingChrome();
  });

  inspector.querySelector("#btn-hide-inspector")?.addEventListener("click", () => {
    state.inspectorOpen = false;
    syncReadingChrome();
  });

  window.addEventListener("keydown", (ev) => {
    if (ev.ctrlKey && ev.key.toLowerCase() === "o") {
      if (smokeOpenShortcutActive()) return;
      ev.preventDefault();
      void promptOpenBook();
    }
    if (ev.ctrlKey && ev.key.toLowerCase() === "f") {
      ev.preventDefault();
      setRoute("search");
    }
    if (ev.key === "Escape" && state.route === "reader") {
      state.inspectorOpen = false;
      syncReadingChrome();
    }
  });

  await hydrateRecents();
  if (isTauri() && (await loadDesktopDemoEnabled())) {
    localStorage.setItem(DEMO_ENABLED_KEY, "1");
  }
  let libraryRoot = localStorage.getItem("marginalia.libraryRoot") ?? "";
  if (isTauri()) {
    libraryRoot = (await loadDesktopLibraryRoot()) || libraryRoot;
    const { invoke } = await import("@tauri-apps/api/core");
    const smokeOn = (await invoke("smoke_is_enabled")) as boolean;
    const deferFixture = smokeOn && (await invoke("smoke_defer_fixture_library")) === true;
    if (!libraryRoot && smokeOn && !deferFixture) {
      const fixtures = (await invoke("smoke_fixture_paths")) as { library_root: string | null };
      if (fixtures.library_root) libraryRoot = fixtures.library_root;
    }
  }
  if (libraryRoot) {
    await setLibraryRoot(libraryRoot);
    await ensureLibrarySubdirs(libraryRoot);
    void openLibraryIndex(state.libraryRoot);
    setLibraryPath(state.libraryRoot, state.libraryRoot);
    void syncAllBooksFromLibraryFolder(libraryRoot, pushRecentFromImport).then(() => {
      if (state.route === "library") void renderLibrary();
    });
  } else {
    openLibrarySetupModal();
  }

  void reindexLinks().then(() => setRoute("library"));
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}