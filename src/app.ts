import type { HighlightMode } from "./lib/highlighter";
import {
  openLibraryIndex,
  saveQuote,
  updateQuoteComment,
  syncQuotesBookMeta,
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
  updateBookCardBibliography,
  updateBookCardPath,
  type LibraryBookEntry,
} from "./lib/book-library";
import { migrateBibliographyFromCard, type BookBibliography } from "./lib/book-bibliography";
import {
  extractBibliographyFromEpubBuffer,
  mapFoliateMetadata,
  mergeExtractedBibliography,
} from "./lib/file-metadata";
import { formatCitation, type CitationStyleId } from "./lib/citation-format";
import { readBibliographyFromForm, renderReaderBibliographyFields } from "./ui/reader-bibliography";
import { bindCoverImageFallbacks, upgradeBookCardCoversInPlace } from "./ui/book-cover";
import { renderTypographicCoverHtml } from "./lib/typographic-cover";
import { enqueueCoverGeneration, setCustomBookCover, coverImageUrl } from "./lib/book-cover-cache";
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
import { type BookFileKind, detectBookFileKind, mimeForBookFileName } from "./lib/book-formats";
import { createDocumentsMarginaliaFolder, ensureLibrarySubdirs } from "./lib/library-root";
import { syncAllBooksFromLibraryFolder } from "./lib/library-import";
import { parseFilenameMeta, looksLikeTechnicalSlug } from "./lib/filename-meta";
import { formatReadableLocus } from "./lib/quote-locus";
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
import { createNote } from "./lib/notes";
import { renderUserQuoteCardHtml } from "./ui/user-quote-card";
import type { initThemePreference } from "./ui/theme-preference";
import { PdfReader, attachPdfPageCounter } from "./readers/pdf-reader";
import { EpubReader } from "./readers/epub-reader";
import { loadReaderPosition, saveReaderPosition } from "./lib/reader-position";
import {
  foliateNavLabels,
  hydrateReaderFlow,
  loadReaderFlow,
  saveReaderFlow,
  type FoliateFlow,
} from "./lib/reader-flow";
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
  searchDemoQuotes,
} from "./lib/demo-data";
import { escapeAttr, escapeHtml } from "./lib/html";
import type { QuoteDocument } from "./lib/quote-markdown";
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

type Route = "library" | "quotes" | "notes" | "settings" | "reader";

type RecentBook = LibraryBookEntry;

const ROUTE_LABEL: Record<Exclude<Route, "reader">, string> = {
  library: "Knihovna",
  quotes: "Citace",
  notes: "Poznámky",
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
    bibliography: null as BookBibliography | null,
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
  let pdfPageCounterDetach: (() => void) | null = null;
  let epub: EpubReader | null = null;
  let readerBibMountedSlug = "";
  let libraryRenderNonce = 0;
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
      <div class="brand-mark" aria-hidden="true"><img src="/marginalia-icon.png" alt="" width="34" height="34" /></div>
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
      <button type="button" class="nav-item" data-route="settings"><span class="icon">${icons.settings}</span><span>Nastavení</span></button>
    </div>
  `;

  const workspace = document.createElement("div");
  workspace.className = "workspace";

  const toolbar = document.createElement("header");
  toolbar.className = "toolbar";
  toolbar.innerHTML = `
    <div class="toolbar-left toolbar-left--context">
      <h1 class="context-title" id="context-title">Knihovna</h1>
      <details class="reader-bib" id="reader-bib" hidden>
        <summary class="reader-bib-summary">Bibliografie</summary>
        <div class="reader-bib-panel" id="reader-bib-panel"></div>
      </details>
    </div>
    <div class="toolbar-right">
      <button type="button" class="chip-btn" id="btn-highlight" data-active="true" title="Označte text, pak uložte klávesou H">Zvýrazňovat</button>
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
  fileInput.accept = ".pdf,.epub,.mobi,.azw,.azw3";
  fileInput.id = "file-open";
  fileInput.className = "hidden-input";
  fileInput.setAttribute("data-testid", "file-open");
  root.appendChild(fileInput);

  const libraryPathEl = sidebar.querySelector("#library-path")!;
  const contextTitle = toolbar.querySelector("#context-title")!;
  const readerBib = toolbar.querySelector("#reader-bib") as HTMLDetailsElement;
  const readerBibPanel = toolbar.querySelector("#reader-bib-panel") as HTMLElement;
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

  const mountReaderBibliographyIfNeeded = () => {
    if (!state.bibliography || !state.slug) return;
    if (readerBibMountedSlug === state.slug && readerBibPanel.querySelector("[data-bib-field]")) return;
    readerBibPanel.innerHTML = renderReaderBibliographyFields(state.bibliography);
    readerBibMountedSlug = state.slug;
    bindBibliographyForm();
  };

  const syncReadingChrome = () => {
    const inReader = state.route === "reader";
    root.classList.toggle("reading-mode", inReader);
    highlightBtn.hidden = !inReader;
    backlinksBtn.hidden = !inReader;
    readerBib.hidden = !inReader || !state.book;
    if (inReader && state.bibliography) {
      mountReaderBibliographyIfNeeded();
    } else if (!inReader) {
      readerBibMountedSlug = "";
    }
    if (!inReader) {
      root.classList.add("backlinks-hidden");
      return;
    }
    root.classList.toggle("backlinks-hidden", !state.inspectorOpen);
    backlinksBtn.dataset.active = String(state.inspectorOpen);
  };

  const persistBibliography = async () => {
    if (!state.book || !state.slug || !state.libraryRoot || !state.bibliography) return;
    const bibliography = readBibliographyFromForm(readerBibPanel);
    state.bibliography = bibliography;
    const author =
      bibliography.authors.map((a) => `${a.given} ${a.family}`.trim()).filter(Boolean).join(", ") ||
      state.book.author;
    const title = bibliography.title.trim() || state.book.title;
    state.book.author = author;
    state.book.title = title;
    await updateBookCardBibliography(state.libraryRoot, state.slug, bibliography, {
      userEdited: true,
      title,
    });
    await syncQuotesBookMeta(state.libraryRoot, state.slug, { title, author });
    const kind = detectBookFileKind(state.book.filePath) ?? "pdf";
    pushRecent({
      slug: state.slug,
      kind,
      title,
      author,
      sha256: state.book.sha256,
      filePath: state.book.filePath,
    });
    setContextTitle(title);
    if (state.route === "reader") await refreshInspectorAfterQuoteSave(state.slug);
    if (state.route === "quotes") await renderQuotesOverview();
  };

  const bindBibliographyForm = () => {
    readerBibPanel.querySelectorAll("input").forEach((el) => {
      el.addEventListener("change", () => void persistBibliography());
      el.addEventListener("blur", () => void persistBibliography());
    });
    readerBibPanel.querySelector("#reader-bib-cover-file")?.addEventListener("change", () => {
      const input = readerBibPanel.querySelector("#reader-bib-cover-file") as HTMLInputElement;
      const file = input.files?.[0];
      if (!file || !state.slug || !state.libraryRoot || !state.book) return;
      void setCustomBookCover(state.libraryRoot, state.slug, state.book.sha256, file)
        .then(() => toast("Vlastní obálka uložena", "success"))
        .catch(() => toast("Obálku se nepodařilo uložit", "error"));
      input.value = "";
    });
    readerBibPanel.querySelector("#reader-bib-add-author")?.addEventListener("click", () => {
      if (!state.bibliography) return;
      state.bibliography = {
        ...state.bibliography,
        authors: [...state.bibliography.authors, { given: "", family: "" }],
      };
      readerBibPanel.innerHTML = renderReaderBibliographyFields(state.bibliography);
      readerBibMountedSlug = state.slug;
      bindBibliographyForm();
    });
  };

  const bindQuoteCommentEditors = (root: ParentNode) => {
    const paintCommentPreview = (el: HTMLTextAreaElement) => {
      const id = el.dataset.quoteComment!;
      let preview = el.parentElement?.querySelector<HTMLElement>(
        `[data-quote-comment-preview="${CSS.escape(id)}"]`,
      );
      if (!preview) {
        preview = document.createElement("div");
        preview.className = "quote-card__comment-preview md-body";
        preview.dataset.quoteCommentPreview = id;
        el.insertAdjacentElement("afterend", preview);
      }
      const text = el.value;
      if (!text.includes("[[")) {
        preview.hidden = true;
        preview.innerHTML = "";
        return;
      }
      preview.hidden = false;
      preview.innerHTML = renderMarkdown(text, linkIndex, { allowRemoteImages: false });
      preview.querySelectorAll("a[data-wiki-title]").forEach((a) => {
        a.addEventListener("click", (ev) => {
          ev.preventDefault();
          openWiki((a as HTMLElement).dataset.wikiTitle!, true);
        });
      });
    };

    root.querySelectorAll<HTMLTextAreaElement>("[data-quote-comment]").forEach((el) => {
      paintCommentPreview(el);
      if (el.dataset.bound === "1") return;
      el.dataset.bound = "1";
      el.addEventListener("input", () => paintCommentPreview(el));
      el.addEventListener("blur", () => {
        if (!state.libraryRoot) return;
        const quoteId = el.dataset.quoteComment!;
        const card = el.closest(".quote-card") as HTMLElement | null;
        const slug = state.slug || card?.dataset.bookSlug || "";
        if (!slug) return;
        void updateQuoteComment(state.libraryRoot, slug, quoteId, el.value)
          .then(async () => {
            toast("Poznámka uložena", "success");
            await reindexLinks();
            paintCommentPreview(el);
          })
          .catch(() => toast("Poznámku se nepodařilo uložit", "error"));
      });
    });
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

  const quotesForBook = (docs: QuoteDocument[], slug: string) =>
    docs.filter((d) => !slug || d.meta.book_slug === slug);

  const refreshInspectorAfterQuoteSave = async (slug: string) => {
    const docs = quotesForBook(await loadQuotesForBook(state.libraryRoot, slug), slug);
    renderInspectorQuotes(docs);
    state.inspectorOpen = true;
    syncReadingChrome();
  };

  const renderInspectorQuotes = (docs: QuoteDocument[]) => {
    if (!docs.length) {
      inspectorBody.innerHTML = `<p class="muted">Zatím žádné citace. Zapněte zvýrazňování a označte text v knize.</p>`;
      return;
    }
    const bookAuthor = state.book?.author ?? "";
    const bookTitle = state.book?.title ?? "";
    inspectorBody.innerHTML = `<ul class="quote-list inspector-quote-list">${docs
      .map((d) =>
        renderUserQuoteCardHtml(d, {
          showCommentEditor: true,
          bookAuthorFallback: bookAuthor,
          bookTitleFallback: bookTitle,
          bibliography: state.bibliography,
          listAttrs: { "data-book-slug": d.meta.book_slug },
        }),
      )
      .join("")}</ul>`;
    bindQuoteCommentEditors(inspectorBody);
    bindQuoteCitationCopy(inspectorBody);
  };

  const bindQuoteCitationCopy = (root: ParentNode) => {
    root.querySelectorAll<HTMLButtonElement>("[data-copy-citation]").forEach((btn) => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        if (!state.bibliography) return;
        const card = btn.closest(".quote-card");
        const quoteText = card?.querySelector(".quote-card__text")?.textContent?.trim() ?? "";
        const pageLabel = card?.querySelector(".quote-card__page")?.textContent?.trim() ?? "";
        const style = btn.dataset.copyCitation as CitationStyleId;
        void formatCitation(style, { quoteText, pageLabel, bibliography: state.bibliography })
          .then((text) => {
            (window as unknown as { __MARGINALIA_LAST_CITATION__?: string }).__MARGINALIA_LAST_CITATION__ = text;
            return navigator.clipboard.writeText(text);
          })
          .then(() => toast("Citace zkopírována", "success"))
          .catch(() => toast("Citaci se nepodařilo zkopírovat", "error"));
      });
    });
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
    if (route === "quotes") {
      stageMain.innerHTML = `<div class="page" data-quotes-loading="1"><p class="muted">Načítám citace…</p></div>`;
      void renderQuotesOverview();
    }
    if (route === "notes") {
      // Search lives on Notes/Library/Quotes pages (sidebar Hledat removed).
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
    const renderNonce = ++libraryRenderNonce;
    const recent = await listBooksForLibrary();
    if (renderNonce !== libraryRenderNonce) return;
    const demoBooks = isDemoEnabled() ? getDemoBooks() : [];
    // Paint immediately with typographic covers so cards stay clickable; upgrade images in place.
    const userCards = recent
      .map((b) => {
        const cover = renderTypographicCoverHtml({
          slug: b.slug,
          title: b.title,
          author: b.author,
        });
        return `
              <button type="button" class="book-card" data-slug="${escapeAttr(b.slug)}" data-kind="${b.kind}"
                data-file-path="${escapeAttr(b.filePath)}" data-sha256="${escapeAttr(b.sha256)}"
                data-title="${escapeAttr(b.title)}" data-author="${escapeAttr(b.author)}"
                title="${escapeAttr(b.title)}">
                ${cover}
                <div class="book-card__title">${escapeHtml(b.title)}</div>
                <div class="book-card__meta">${escapeHtml(b.author || "—")} · ${b.kind.toUpperCase()}</div>
              </button>`;
      })
      .join("");
    if (renderNonce !== libraryRenderNonce) return;
    stageMain.innerHTML = `
      <div class="page" data-library-ready="1">
        <h1>Knihovna</h1>
        <p class="page-intro">PDF, EPUB a MOBI/AZW ve složce knihovny se načítají automaticky. Citace a poznámky se ukládají do stejné knihovny.</p>
        <label class="field field--inline page-search">
          <span class="sr-only">Hledat v knihovně</span>
          <input type="search" id="library-filter" placeholder="Hledat knihy…" autocomplete="off" />
        </label>
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
            <div class="book-grid">${userCards}</div></section>`
            : demoBooks.length
              ? ""
              : `<p class="muted">Ve složce knihovny zatím nejsou podporované knihy — přidejte PDF, EPUB nebo MOBI a zvolte Obnovit knihy.</p>`
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
          kind: el.dataset.kind as BookFileKind,
          title: el.dataset.title ?? "",
          author: el.dataset.author ?? "",
          sha256: el.dataset.sha256 ?? "",
          filePath: el.dataset.filePath ?? "",
        });
      });
    });
    bindDemoNavigation();
    bindCoverImageFallbacks(stageMain);
    const libFilter = stageMain.querySelector<HTMLInputElement>("#library-filter");
    libFilter?.addEventListener("input", () => {
      const q = libFilter.value.trim().toLowerCase();
      stageMain.querySelectorAll<HTMLElement>(".book-card").forEach((card) => {
        const hay = `${card.dataset.title || card.querySelector(".book-card__title")?.textContent || ""} ${
          card.dataset.author || card.querySelector(".book-card__meta")?.textContent || ""
        }`.toLowerCase();
        card.hidden = Boolean(q && !hay.includes(q));
      });
    });
    if (state.libraryRoot && recent.length) {
      const root = state.libraryRoot;
      void upgradeBookCardCoversInPlace(stageMain, root);
      void enqueueCoverGeneration(
        root,
        recent.map((b) => ({
          slug: b.slug,
          kind: b.kind,
          sha256: b.sha256,
          title: b.title,
          author: b.author,
          filePath: b.filePath,
        })),
        () => {
          if (state.route === "library" && state.libraryRoot === root) {
            void upgradeBookCardCoversInPlace(stageMain, root);
          }
        },
      );
    }
  };

  const renderQuotesOverview = async () => {
    const userQuotes = state.libraryRoot ? await loadAllQuotesFromLibrary(state.libraryRoot) : [];
    const libraryBooks = state.libraryRoot ? await listLibraryBooksFromDisk(state.libraryRoot) : [];
    const authorBySlug = new Map(libraryBooks.map((b) => [b.slug, b.author]));
    const titleBySlug = new Map(libraryBooks.map((b) => [b.slug, b.title]));
    if (userQuotes.length) {
      const paintUserQuotes = (filter: string) => {
        const q = filter.trim().toLowerCase();
        const filtered = q
          ? userQuotes.filter(
              (d) =>
                d.quoteText.toLowerCase().includes(q) ||
                d.comment.toLowerCase().includes(q) ||
                d.meta.author.toLowerCase().includes(q) ||
                d.meta.book_title.toLowerCase().includes(q),
            )
          : userQuotes;
        const list = stageMain.querySelector(".user-quote-list");
        const countEl = stageMain.querySelector(".results-count");
        if (!list || !countEl) return;
        countEl.textContent = q
          ? `${filtered.length} / ${userQuotes.length} citací (filtr „${filter}“)`
          : `${userQuotes.length} citací z knihovny`;
        list.innerHTML = filtered.length
          ? filtered
              .map((d) =>
                renderUserQuoteCardHtml(d, {
                  showCommentEditor: true,
                  listAttrs: { "data-user-quote": d.meta.id, "data-book-slug": d.meta.book_slug },
                  bookAuthorFallback: authorBySlug.get(d.meta.book_slug),
                  bookTitleFallback: titleBySlug.get(d.meta.book_slug),
                }),
              )
              .join("")
          : `<li class="muted">Nic neodpovídá filtru.</li>`;
        bindQuoteCommentEditors(list);
      };
      stageMain.innerHTML = `
        <div class="page page--wide" data-quotes-ready="1">
          <h1>Databáze citací</h1>
          <p class="muted page-intro">Hledejte přímo zde — text citace, poznámky, autor nebo kniha.</p>
          <label class="field field--inline quotes-filter page-search">
            <span class="sr-only">Hledat v citacích</span>
            <input type="search" id="quotes-filter" placeholder="Hledat v citacích…" autocomplete="off" />
          </label>
          <p class="muted results-count">${userQuotes.length} citací z knihovny</p>
          <ul class="quote-list user-quote-list">${userQuotes
            .map((d) =>
              renderUserQuoteCardHtml(d, {
                showCommentEditor: true,
                listAttrs: { "data-user-quote": d.meta.id, "data-book-slug": d.meta.book_slug },
                bookAuthorFallback: authorBySlug.get(d.meta.book_slug),
                bookTitleFallback: titleBySlug.get(d.meta.book_slug),
              }),
            )
            .join("")}</ul>
        </div>`;
      bindQuoteCommentEditors(stageMain);
      const filterInput = stageMain.querySelector<HTMLInputElement>("#quotes-filter")!;
      filterInput.addEventListener("input", () => paintUserQuotes(filterInput.value));
      return;
    }
    if (!isDemoEnabled()) {
      stageMain.innerHTML = `
        <div class="page" data-quotes-ready="1">
          <h1>Databáze citací</h1>
          <p class="muted">Zatím nemáte načtená ukázková data. V Nastavení zvolte <strong>Načíst ukázková data</strong>, nebo vytvářejte citace při čtení vlastních knih.</p>
        </div>`;
      return;
    }
    const books = getDemoBooks();
    const allTags = [...new Set(getDemoQuotes().flatMap((q) => q.tags))].sort();
    const bookMap = new Map(books.map((b) => [b.slug, b]));
    const paintDemoQuotes = () => {
      let quotes = getDemoQuotes();
      if (state.quotesFilterBook) quotes = quotes.filter((q) => q.bookSlug === state.quotesFilterBook);
      if (state.quotesFilterTag) quotes = quotes.filter((q) => q.tags.includes(state.quotesFilterTag));
      if (state.quotesFilterText.trim()) {
        const ids = new Set(searchDemoQuotes(state.quotesFilterText).map((q) => q.id));
        quotes = quotes.filter((q) => ids.has(q.id));
      }
      const grid = stageMain.querySelector(".quote-db-grid");
      const countEl = stageMain.querySelector(".results-count");
      if (countEl) countEl.textContent = `${quotes.length} citací`;
      if (grid) {
        grid.innerHTML = quotes.map((q) => renderQuoteDbCard(q, bookMap.get(q.bookSlug))).join("");
        bindDemoNavigation();
      }
      stageMain.querySelectorAll(".tag-chip--btn").forEach((btn) => {
        const tag = (btn as HTMLElement).dataset.tag ?? "";
        btn.classList.toggle("tag-chip--on", tag === state.quotesFilterTag);
      });
    };
    stageMain.innerHTML = `
      <div class="page page--wide" data-quotes-ready="1">
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
          <label class="field field--inline quotes-filter page-search">
            <span class="sr-only">Hledat v citacích</span>
            <input type="search" id="quotes-filter" value="${escapeAttr(state.quotesFilterText)}" placeholder="Hledat v citacích…" autocomplete="off" />
          </label>
        </div>
        <div class="tag-row tag-row--filter" role="group" aria-label="Filtr štítků">
          <button type="button" class="tag-chip tag-chip--btn ${state.quotesFilterTag === "" ? "tag-chip--on" : ""}" data-tag="">Vše</button>
          ${allTags.map((t) => `<button type="button" class="tag-chip tag-chip--btn ${state.quotesFilterTag === t ? "tag-chip--on" : ""}" data-tag="${escapeAttr(t)}">${escapeHtml(t)}</button>`).join("")}
        </div>
        <p class="muted results-count"></p>
        <div class="quote-db-grid"></div>
      </div>`;
    stageMain.querySelector<HTMLSelectElement>("#filter-book")?.addEventListener("change", (ev) => {
      state.quotesFilterBook = (ev.target as HTMLSelectElement).value;
      paintDemoQuotes();
    });
    const filterInput = stageMain.querySelector<HTMLInputElement>("#quotes-filter");
    filterInput?.addEventListener("input", () => {
      state.quotesFilterText = filterInput.value;
      paintDemoQuotes();
    });
    stageMain.querySelectorAll(".tag-chip--btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.quotesFilterTag = (btn as HTMLElement).dataset.tag ?? "";
        paintDemoQuotes();
      });
    });
    paintDemoQuotes();
  };

  const renderSettings = () => {
    const demoOn = isDemoEnabled();
    const themePref = themeCtrl.getPreference();
    const readerFlow = loadReaderFlow();
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
        <h2 class="section-title">Čtení EPUB/MOBI</h2>
        <p class="muted">Posouvání: plynulý scroll celé knihy (kapitoly na sebe navazují); šipky skáčou na kapitolu. Stránkování: jeden sloupec na stránku, tlačítka listují.</p>
        <div class="theme-picker" role="radiogroup" aria-label="Režim čtení">
          ${(
            [
              ["scrolled", "Posouvání"],
              ["paginated", "Stránkování"],
            ] as Array<[FoliateFlow, string]>
          )
            .map(
              ([flow, label]) =>
                `<button type="button" role="radio" aria-checked="${readerFlow === flow}" class="chip-btn theme-picker__btn${readerFlow === flow ? " theme-picker__btn--on" : ""}" data-reader-flow="${flow}">${label}</button>`,
            )
            .join("")}
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
        epub?.refreshTheme?.();
        toast(
          pref === "system" ? "Motiv: podle systému" : pref === "light" ? "Motiv: světlý" : "Motiv: tmavý",
          "success",
        );
        renderSettings();
      });
    });
    stageMain.querySelectorAll<HTMLElement>("[data-reader-flow]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const flow = btn.dataset.readerFlow as FoliateFlow;
        await saveReaderFlow(flow);
        toast(flow === "scrolled" ? "Čtení: posouvání" : "Čtení: stránkování", "success");
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
    toast(n ? `Načteno knih: ${n}` : "Ve složce nejsou nové knihy (PDF/EPUB/MOBI)", n ? "success" : "info");
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

  const enterReaderMode = () => {
    state.route = "reader";
    setRoute("reader");
    state.inspectorOpen = true;
    syncReadingChrome();
  };

  const mountReaderChrome = (kind: BookFileKind, title: string) => {
    const foliate = kind !== "pdf";
    const navLabels = foliateNavLabels(loadReaderFlow());
    stageMain.innerHTML = `
      <div class="reader-layout">
        <div class="reader-toolbar">
          <button type="button" class="ghost-btn" id="btn-back-library">← Knihovna</button>
          <span class="muted">${escapeHtml(title)} · ${kind.toUpperCase()}</span>
          ${
            foliate
              ? `<span class="reader-section-nav">
            <button type="button" class="ghost-btn" id="btn-reader-prev" title="${navLabels.prevTitle}" aria-label="${navLabels.prevTitle}">${navLabels.prev}</button>
            <button type="button" class="ghost-btn" id="btn-reader-next" title="${navLabels.nextTitle}" aria-label="${navLabels.nextTitle}">${navLabels.next}</button>
          </span>`
              : ""
          }
        </div>
        <div class="reader-surface${foliate ? " reader-surface--foliate" : ""}">
          <div id="${foliate ? "epub-root" : "pdf-root"}" class="${foliate ? "epub-root" : "pdf-root"}"></div>
        </div>
        <div class="reader-page-counter" id="reader-page-counter" ${foliate ? "hidden" : ""} aria-live="polite">—</div>
      </div>
    `;
    stageMain.querySelector("#btn-back-library")?.addEventListener("click", () => {
      pdfPageCounterDetach?.();
      pdfPageCounterDetach = null;
      pdf?.destroy();
      epub?.destroy();
      pdf = null;
      epub = null;
      state.book = null;
      setRoute("library");
    });
    stageMain.querySelector("#btn-reader-prev")?.addEventListener("click", () => void epub?.navigatePrev());
    stageMain.querySelector("#btn-reader-next")?.addEventListener("click", () => void epub?.navigateNext());
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
    const fileKind = detectBookFileKind(fileName);
    try {
    pdf?.destroy();
    epub?.destroy();
    pdf = null;
    epub = null;
    inspectorBody.innerHTML = `<p class="muted">Načítám citace knihy…</p>`;

    const fromName = parseFilenameMeta(fileName);
    state.book = {
      title: fromName.title,
      author: fromName.author,
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
    const existingCard = await loadBookCard(state.libraryRoot, slug);
    if (existingCard) {
      const cardTitle = existingCard.title.trim();
      if (cardTitle && !looksLikeTechnicalSlug(cardTitle)) state.book.title = cardTitle;
      else if (fromName.title) state.book.title = fromName.title;
      const cardAuthor = existingCard.author?.trim() ?? "";
      state.book.author = cardAuthor || fromName.author;
      state.bibliography = { ...existingCard.bibliography, authors: [...existingCard.bibliography.authors] };
    } else {
      state.bibliography = migrateBibliographyFromCard(state.book.title, state.book.author, null);
    }
    await ensureBookCard(state.libraryRoot, state.book);
    await refreshInspectorAfterQuoteSave(state.slug);
    const now = new Date().toISOString();

    if (fileKind === "pdf") {
      pushRecent({ ...state.book, slug: state.slug, kind: "pdf", updated: now });
      mountReaderChrome("pdf", state.book.title);
      enterReaderMode();
      const pdfRoot = stageMain.querySelector("#pdf-root") as HTMLElement;
      pdf = new PdfReader({
        container: pdfRoot,
        getMode: () => state.mode,
        onHighlight: async ({ text, pageIndex, anchor }) => {
          await saveQuote(state.libraryRoot, state.book!, state.slug, text, String(pageIndex + 1), anchor);
          await refreshInspectorAfterQuoteSave(state.slug);
          toast("Citace uložena", "success");
        },
      });
      await pdf.load(buffer);
      readerBibPanel.innerHTML = "";
      const surface = stageMain.querySelector(".reader-surface") as HTMLElement;
      const counter = stageMain.querySelector("#reader-page-counter") as HTMLElement;
      pdfPageCounterDetach?.();
      pdfPageCounterDetach = attachPdfPageCounter(surface, pdfRoot, counter, pdf.getPageCount());
      const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
      await pdf.restoreHighlights(docs.map((d) => ({ anchor: d.meta.anchor, text: d.quoteText })));
      await refreshInspectorAfterQuoteSave(state.slug);
    } else if (fileKind === "epub" || fileKind === "mobi") {
      pushRecent({ ...state.book, slug: state.slug, kind: fileKind, updated: now });
      mountReaderChrome(fileKind, state.book.title);
      enterReaderMode();
      const epubRoot = stageMain.querySelector("#epub-root") as HTMLElement;
      const positionSlug = state.slug;
      epub = new EpubReader({
        container: epubRoot,
        flow: loadReaderFlow(),
        initialCfi: loadReaderPosition(positionSlug),
        onRelocate: (cfi) => saveReaderPosition(positionSlug, cfi),
        getMode: () => state.mode,
        onHighlightSaveKey: () => {
          if (state.route !== "reader" || state.mode !== "highlight") return;
          const saved = epub?.commitPendingHighlight();
          if (!saved) toast("Nejdřív označte text v knize", "info");
        },
        onHighlight: async ({ text, cfi, anchor }) => {
          const progress = epub?.sectionProgress?.() ?? { index: null, count: 0, percent: null };
          const locus = formatReadableLocus({
            pageOrCfi: cfi,
            chapterTitle: epub?.chapterTitleForCurrentSection?.() ?? null,
            sectionIndex: progress.index,
            sectionCount: progress.count,
            percent: progress.percent,
          });
          await saveQuote(state.libraryRoot, state.book!, state.slug, text, locus, {
            ...anchor,
            selectors: [
              ...anchor.selectors,
              // Keep CFI internally even when page label is human-readable.
              ...(cfi && !anchor.selectors.some((s) => "value" in s && (s as { value?: string }).value === cfi)
                ? [{ type: "FragmentSelector" as const, conformsTo: "http://idpf.org/epub/fragment" as const, value: cfi }]
                : []),
            ],
          });
          await refreshInspectorAfterQuoteSave(state.slug);
          toast("Citace uložena", "success");
        },
      });
      await epub.load(new File([buffer], fileName, { type: mimeForBookFileName(fileName) }));
      if (!existingCard?.bibliographyUserEdited && state.bibliography) {
        const fromFoliate = mapFoliateMetadata(epub.getPackageMetadata());
        const fromOpf = await extractBibliographyFromEpubBuffer(buffer);
        const merged = mergeExtractedBibliography(
          state.bibliography,
          { ...fromOpf, ...fromFoliate, authors: fromFoliate.authors?.length ? fromFoliate.authors : fromOpf.authors },
        );
        state.bibliography = merged;
        if (merged.title.trim()) state.book.title = merged.title.trim();
        state.book.author =
          merged.authors.map((a) => `${a.given} ${a.family}`.trim()).filter(Boolean).join(", ") || state.book.author;
        await updateBookCardBibliography(state.libraryRoot, state.slug, merged, {
          userEdited: false,
          title: state.book.title,
        });
      }
      readerBibPanel.innerHTML = "";
      const docs = await loadQuotesForBook(state.libraryRoot, state.slug);
      await epub.restoreHighlights(docs.map((d) => ({ anchor: d.meta.anchor })));
      await refreshInspectorAfterQuoteSave(state.slug);
    } else {
      throw new Error("Nepodporovaný formát — použijte PDF, EPUB nebo MOBI/AZW.");
    }

    enterReaderMode();
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
    const fileName =
      storedPath.replace(/^.*[/\\]/, "") ||
      `${entry.slug}.${entry.kind === "pdf" ? "pdf" : entry.kind === "mobi" ? "mobi" : "epub"}`;
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

  window.addEventListener("keydown", (ev) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== "f") return;
    const el =
      document.querySelector<HTMLInputElement>("#library-filter, #quotes-filter, #notes-filter, #search-input");
    if (!el) return;
    ev.preventDefault();
    el.focus();
    el.select();
  });


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
      await refreshInspectorAfterQuoteSave(state.slug);
      return { quoteId: saved.doc.meta.id, text: draft.text.trim(), slug: state.slug };
    },
    readerHighlightPaintCount: () =>
      pdf?.highlightPaintCount() ?? epub?.highlightPaintCount() ?? 0,
    epubReaderReady: () => (epub?.visibleDomTextLength() ?? 0) > 3,
    epubVisibleTextLength: () => epub?.visibleDomTextLength() ?? 0,
    epubViewportVisibleTextLength: () => epub?.viewportVisibleTextLength() ?? 0,
    epubCurrentSectionIndex: () => epub?.currentSectionIndex() ?? null,
    epubNextSection: async () => {
      if (!epub) throw new Error("EPUB reader not active");
      await epub.nextSection();
      await new Promise((r) => window.setTimeout(r, 600));
      return epub.currentSectionIndex();
    },
    ensureEpubReaderReady: async () => {
      if (!epub) throw new Error("EPUB reader not active");
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        if (epub.foliateIframeVisibleTextLength() > 3) {
          return epub.visibleDomTextLength();
        }
        await new Promise((r) => window.setTimeout(r, 350));
      }
      await epub.ensureReadableFallback();
      return epub.visibleDomTextLength();
    },
    epubReaderRenderInfo: () => {
      if (!epub) {
        return {
          mode: "empty" as const,
          iframeTextLength: 0,
          fallbackTextLength: 0,
          visibleTextLength: 0,
          viewportVisibleTextLength: 0,
          sectionIndex: null,
          flow: loadReaderFlow(),
          textWidthRatio: 0,
          iframeElementInLightDom: false,
        };
      }
      return epub.readerRenderInfo();
    },
    epubPointerSelectionRect: () => epub?.readerPointerSelectionRect() ?? null,
    prepareEpubTextSelection: () => epub?.prepareSmokeTextSelection() ?? false,
    epubSelectionDiagnostics: () => {
      const lastH = (window as unknown as { __MARGINALIA_LAST_HIGHLIGHT_H__?: number })
        .__MARGINALIA_LAST_HIGHLIGHT_H__;
      return {
        renderInfo: epub?.readerRenderInfo() ?? null,
        mode: state.mode,
        route: state.route,
        selection: epub?.selectionDiagnostics() ?? {
          selections: [],
          mainSelectionLength: 0,
          mainSelectionPreview: "",
        },
        lastHighlightKeyAt: lastH ?? null,
        highlighterPending: epub?.hasPendingHighlight() ?? false,
      };
    },
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
      const root = libraryRoot || state.libraryRoot;
      if (!root) {
        throw new Error("open blocked before library setup");
      }
      await openBookFromAbsolutePath(libraryRoot, filePath);
      if (state.route !== "reader" || !state.book) {
        throw new Error(`openBookAtPath failed for ${filePath}`);
      }
    },
    finishLibrarySetup: async (libraryRoot: string) => {
      await finishLibrarySetup(libraryRoot);
      return (await listBooksForLibrary()).length;
    },
    rescanBooksFromFolder: async () => {
      if (!(await requireLibraryConfigured())) throw new Error("No library root");
      const imported = await syncAllBooksFromLibraryFolder(state.libraryRoot, pushRecentFromImport);
      if (state.route === "library") await renderLibrary();
      return { imported, total: (await listBooksForLibrary()).length };
    },
    countScannedBookCards: async () => (await listBooksForLibrary()).length,
    ensureInspectorOpen: () => {
      if (state.route !== "reader") throw new Error("ensureInspectorOpen requires reader route");
      state.inspectorOpen = true;
      syncReadingChrome();
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
      await refreshInspectorAfterQuoteSave(state.slug);
      return { quoteId: saved.doc.meta.id, text: draft.text.trim(), slug: state.slug };
    },
    verifyDialogPlugin: smokeVerifyDialogPlugin,
    seedWikilinkBacklink: async () => {
      if (!(await requireLibraryConfigured())) throw new Error("No library root");
      const target = await createNote(state.libraryRoot, "Smoke cíl");
      const targetTitle = target.title;
      await createNote(state.libraryRoot, "Smoke zdroj", `Odkaz na [[${targetTitle}]].\n`);
      await reindexLinks();
      const backlinks = linkIndex.getBacklinks(noteIndexPath(target.filename));
      return { targetTitle, backlinkCount: backlinks.length };
    },
    currentBookSlug: () => state.slug,
    openBibliographyPanel: () => {
      readerBib.open = true;
      readerBib.hidden = false;
      mountReaderBibliographyIfNeeded();
    },
    setBibliographyField: (field: string, value: string) => {
      readerBib.open = true;
      readerBib.hidden = false;
      mountReaderBibliographyIfNeeded();
      const el = readerBibPanel.querySelector(`[data-bib-field="${field}"]`) as HTMLInputElement | null;
      if (!el) throw new Error(`Missing bibliography field: ${field}`);
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    getBibliographyField: (field: string) => {
      const el = readerBibPanel.querySelector(`[data-bib-field="${field}"]`) as HTMLInputElement | null;
      return el?.value ?? "";
    },
    getLastCitationCopy: () =>
      (window as unknown as { __MARGINALIA_LAST_CITATION__?: string }).__MARGINALIA_LAST_CITATION__ ?? "",
    libraryCoverDiagnostics: async () => {
      const books = await listBooksForLibrary();
      const out: { slug: string; kind: string; hasCachedImage: boolean; hasTypographicOnly: boolean }[] = [];
      for (const b of books) {
        const src = state.libraryRoot ? await coverImageUrl(state.libraryRoot, b.slug) : null;
        const hasImg = Boolean(src);
        out.push({
          slug: b.slug,
          kind: b.kind,
          hasCachedImage: hasImg,
          hasTypographicOnly: !hasImg,
        });
      }
      return out;
    },
    brokenCoverImageCount: () =>
      document.querySelectorAll(".book-card__cover-image").length === 0
        ? 0
        : Array.from(document.querySelectorAll<HTMLImageElement>(".book-card__cover-image")).filter(
            (img) => !img.complete || img.naturalWidth === 0,
          ).length,
    readerContentColors: () => {
      const probe = epub?.contentThemeProbe?.() ?? { color: "", background: "" };
      return {
        ...probe,
        theme: document.querySelector("#app")?.getAttribute("data-theme") ?? "",
      };
    },
    setAppTheme: (pref: "light" | "dark" | "system") => {
      themeCtrl.setPreference(pref);
      epub?.refreshTheme?.();
    },
    triggerCopyCitation: async (style: CitationStyleId) => {
      const btn = inspectorBody.querySelector(`[data-copy-citation="${style}"]`) as HTMLButtonElement | null;
      if (!btn) throw new Error(`No citation button for ${style}`);
      btn.click();
      await new Promise((r) => window.setTimeout(r, 400));
      return (window as unknown as { __MARGINALIA_LAST_CITATION__?: string }).__MARGINALIA_LAST_CITATION__ ?? "";
    },
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
    toast(
      on
        ? "Zvýrazňování: označte text, uložte klávesou H"
        : "Režim zvýrazňování vypnutý",
    );
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
    // Ctrl+F focuses the in-page filter (library/quotes/notes) — see handler above.
    // Do not route to a removed Search tab or force Citace.
    if (ev.key === "Escape" && state.route === "reader") {
      state.inspectorOpen = false;
      syncReadingChrome();
    }
    if (
      state.route === "reader" &&
      state.mode === "highlight" &&
      ev.key.length === 1 &&
      ev.key.toLowerCase() === "h" &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey
    ) {
      const t = ev.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true']")) return;
      ev.preventDefault();
      (window as unknown as { __MARGINALIA_LAST_HIGHLIGHT_H__?: number }).__MARGINALIA_LAST_HIGHLIGHT_H__ =
        Date.now();
      const saved = pdf?.commitPendingHighlight() || epub?.commitPendingHighlight();
      if (!saved) toast("Nejdřív označte text v knize", "info");
    }
  });

  await Promise.all([hydrateRecents(), hydrateReaderFlow()]);
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