import "foliate-js/view.js";
import { anchorFromEpubSelection, getEpubCfi, reanchorInText } from "../lib/anchor";
import {
  collectFoliateContentDocuments,
  findFallbackPointerRect,
  findIframePointerRect,
  iframeVisibleTextLength,
  viewportVisibleTextLength,
  visibleTextLengthIn,
} from "../lib/epub-iframe-geometry";
import {
  attachHighlighter,
  caretRangeFromViewportPoint,
  rangeToOffsets,
  type HighlightHandle,
  type HighlightMode,
} from "../lib/highlighter";
import { isTauri } from "../lib/runtime";
import { FOLIATE_FLOW, type FoliateFlow } from "../lib/reader-flow";

export interface EpubReaderOptions {
  container: HTMLElement;
  getMode: () => HighlightMode;
  onHighlight: (quote: {
    text: string;
    cfi: string;
    anchor: ReturnType<typeof anchorFromEpubSelection>;
  }) => void;
  onSelectionPending?: () => void;
  /** Called when user presses H inside foliate iframe (focus there). */
  onHighlightSaveKey?: () => void;
  /** Last reading position (EPUB CFI) to restore; otherwise the book opens at its start. */
  initialCfi?: string | null;
  onRelocate?: (cfi: string) => void;
  flow?: FoliateFlow;
}

type FoliateView = HTMLElement & {
  open: (book: unknown) => Promise<void>;
  init?: (opts: { showTextStart?: boolean }) => Promise<void>;
  goToTextStart?: () => Promise<void>;
  goTo: (target: string | number) => Promise<unknown>;
  getCFI: (range: Range) => string;
  next?: () => Promise<void>;
  prev?: () => Promise<void>;
  book?: { sections?: unknown[] };
  renderer?: HTMLElement & {
    root?: HTMLElement;
    getContents?: () => { index: number; doc: Document }[];
    next?: () => Promise<void>;
    prev?: () => Promise<void>;
  };
};

/** Thin wrapper around foliate-js `foliate-view` custom element. */
export class EpubReader {
  private view: FoliateView | null = null;
  private contentRoot: HTMLElement | null = null;
  private highlights: HighlightHandle[] = [];
  private readyTimer: number | null = null;
  private docText = "";
  private fixturePlainText: string | null = null;
  private keyHandlers: { doc: Document; fn: (ev: KeyboardEvent) => void }[] = [];

  constructor(private opts: EpubReaderOptions) {}

  hasPendingHighlight(): boolean {
    return this.highlights.some((h) => h.hasPending());
  }

  commitPendingHighlight(): boolean {
    for (const handle of this.highlights) {
      if (handle.commitPending()) return true;
    }
    const live = this.findLiveSelectionRange();
    if (live && this.applyHighlightRange(live)) return true;
    return false;
  }

  private findLiveSelectionRange(): Range | null {
    for (const doc of this.contentDocuments()) {
      const r = doc.getSelection()?.rangeCount ? doc.getSelection()!.getRangeAt(0) : null;
      if (r && !r.collapsed && r.toString().trim()) return r.cloneRange();
    }
    const r = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null;
    if (!r || r.collapsed || !r.toString().trim()) return null;
    const node = r.commonAncestorContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    if (el && this.opts.container.contains(el)) return r.cloneRange();
    return null;
  }

  private applyHighlightRange(range: Range): boolean {
    const view = this.view;
    if (!view || this.opts.getMode() !== "highlight") return false;
    const root = this.offsetRootForRange(range);
    if (!root) return false;
    const { start, end, text } = rangeToOffsets(root, range);
    if (!text.trim()) return false;
    const cfi = view.getCFI?.(range) ?? `/0/0`;
    const anchor = anchorFromEpubSelection(this.docText, start, end, cfi);
    void this.opts.onHighlight({ text, cfi, anchor });
    this.paintHighlight(range);
    range.startContainer.ownerDocument?.getSelection()?.removeAllRanges();
    window.getSelection()?.removeAllRanges();
    return true;
  }

  private wireHighlighter(): void {
    const view = this.view;
    if (!view) return;
    this.highlights.forEach((h) => h.detach());
    this.highlights = [];
    const roots = this.collectPointerRoots();
    const onComplete = (range: Range) => {
      this.applyHighlightRange(range);
    };
    for (const root of roots) {
      this.highlights.push(
        attachHighlighter(
          root,
          caretRangeFromViewportPoint,
          onComplete,
          this.opts.getMode,
          () => this.opts.onSelectionPending?.(),
        ),
      );
    }
    this.wireHighlightKeyHandlers();
  }

  private wireHighlightKeyHandlers(): void {
    this.unwireHighlightKeyHandlers();
    const onHighlightSaveKey = this.opts.onHighlightSaveKey;
    if (!onHighlightSaveKey) return;
    const onKey = (ev: KeyboardEvent) => {
      if (this.opts.getMode() !== "highlight") return;
      if (ev.key.length !== 1 || ev.key.toLowerCase() !== "h") return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true']")) return;
      ev.preventDefault();
      (window as unknown as { __MARGINALIA_LAST_HIGHLIGHT_H__?: number }).__MARGINALIA_LAST_HIGHLIGHT_H__ =
        Date.now();
      onHighlightSaveKey();
    };
    for (const doc of this.contentDocuments()) {
      doc.addEventListener("keydown", onKey);
      this.keyHandlers.push({ doc, fn: onKey });
    }
  }

  private unwireHighlightKeyHandlers(): void {
    for (const { doc, fn } of this.keyHandlers) doc.removeEventListener("keydown", fn);
    this.keyHandlers = [];
  }

  selectionDiagnostics(): {
    selections: { source: string; length: number; preview: string }[];
    mainSelectionLength: number;
    mainSelectionPreview: string;
  } {
    const selections: { source: string; length: number; preview: string }[] = [];
    for (const doc of this.contentDocuments()) {
      const text = doc.getSelection()?.toString().trim() ?? "";
      if (text) {
        selections.push({
          source: doc.title || "foliate-iframe",
          length: text.length,
          preview: text.slice(0, 160),
        });
      }
    }
    const main = window.getSelection()?.toString().trim() ?? "";
    return {
      selections,
      mainSelectionLength: main.length,
      mainSelectionPreview: main.slice(0, 160),
    };
  }

  private collectPointerRoots(): HTMLElement[] {
    const roots: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();
    const add = (el: HTMLElement | null | undefined) => {
      if (el && !seen.has(el)) {
        seen.add(el);
        roots.push(el);
      }
    };
    for (const doc of this.contentDocuments()) {
      add(doc.body ?? null);
    }
    const highlightRoot = this.contentRoot ?? this.resolveContentRoot() ?? this.view;
    if (highlightRoot instanceof HTMLElement) add(highlightRoot);
    return roots;
  }

  private offsetRootForRange(range: Range): HTMLElement | null {
    let node: Node | null = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (node instanceof HTMLElement) {
      const body = node.ownerDocument?.body;
      if (body?.contains(node)) return body;
    }
    return this.contentRoot ?? this.resolveContentRoot();
  }

  contentDocuments(): Document[] {
    return collectFoliateContentDocuments(this.view, this.opts.container);
  }

  foliateIframeVisibleTextLength(): number {
    return iframeVisibleTextLength(this.contentDocuments());
  }

  /** Viewport drag endpoints for text inside foliate EPUB iframes only. */
  foliateIframePointerRect(): { x: number; y: number; x2: number; y2: number } | null {
    return findIframePointerRect(this.contentDocuments());
  }

  /** Pointer drag endpoints for the surface the user actually reads (iframe, else plain fallback). */
  readerPointerSelectionRect(): { x: number; y: number; x2: number; y2: number } | null {
    return (
      this.foliateIframePointerRect() ?? findFallbackPointerRect(this.opts.container)
    );
  }

  /** Text the reader can actually see in the window (foliate iframe or plain-text fallback). */
  viewportVisibleTextLength(): number {
    const fallback = this.opts.container.querySelector(".epub-fallback-text");
    const fallbackLen = fallback ? visibleTextLengthIn(fallback) : 0;
    return Math.max(fallbackLen, this.iframeViewportVisibleTextLength());
  }

  private iframeViewportVisibleTextLength(): number {
    if (!this.view || this.view.style.display === "none") return 0;
    return viewportVisibleTextLength(this.contentDocuments());
  }

  currentSectionIndex(): number | null {
    return this.view?.renderer?.getContents?.()?.[0]?.index ?? null;
  }

  private get flow(): FoliateFlow {
    return this.opts.flow ?? FOLIATE_FLOW;
  }

  /** Reader toolbar buttons: turn the page when paginated, jump a chapter when scrolled. */
  async navigateNext(): Promise<void> {
    if (this.flow === "scrolled") await this.goToSectionOffset(1);
    else await this.view?.next?.();
  }

  async navigatePrev(): Promise<void> {
    if (this.flow === "scrolled") await this.goToSectionOffset(-1);
    else await this.view?.prev?.();
  }

  async nextSection(): Promise<void> {
    await this.goToSectionOffset(1);
  }

  private async goToSectionOffset(delta: number): Promise<void> {
    const view = this.view;
    const index = this.currentSectionIndex();
    const count = view?.book?.sections?.length ?? 0;
    if (!view || index == null) return;
    const target = index + delta;
    if (target < 0 || target >= count) return;
    await view.goTo(target);
  }

  readerRenderMode(): "iframe" | "fallback" | "empty" {
    if (this.iframeViewportVisibleTextLength() > 3) return "iframe";
    const fallback = this.opts.container.querySelector(".epub-fallback-text");
    if (fallback && visibleTextLengthIn(fallback) > 3) return "fallback";
    return "empty";
  }

  readerRenderInfo(): {
    mode: "iframe" | "fallback" | "empty";
    iframeTextLength: number;
    fallbackTextLength: number;
    visibleTextLength: number;
    viewportVisibleTextLength: number;
    sectionIndex: number | null;
    iframeElementInLightDom: boolean;
  } {
    const fallback = this.opts.container.querySelector(".epub-fallback-text");
    return {
      mode: this.readerRenderMode(),
      iframeTextLength: this.foliateIframeVisibleTextLength(),
      fallbackTextLength: fallback?.textContent?.trim().length ?? 0,
      visibleTextLength: this.visibleDomTextLength(),
      viewportVisibleTextLength: this.viewportVisibleTextLength(),
      sectionIndex: this.currentSectionIndex(),
      iframeElementInLightDom: Boolean(this.opts.container.querySelector("iframe")),
    };
  }

  async load(file: Blob | File): Promise<void> {
    this.destroy();
    const { container } = this.opts;
    container.innerHTML = "";
    const isMobi =
      (file instanceof File && /\.(mobi|azw3?)$/i.test(file.name)) ||
      (typeof file.type === "string" && /mobi|amazon/i.test(file.type));

    const { makeBook } = await import("foliate-js/view.js");
    const book = await makeBook(file);
    await this.captureFixturePlainText(
      book as { sections?: { linear?: string; createDocument?: () => Promise<Document> }[] },
    );
    if (!this.fixturePlainText && isTauri()) {
      const { invoke } = await import("@tauri-apps/api/core");
      const smokeOn = (await invoke("smoke_is_enabled")) as boolean;
      if (smokeOn) {
        try {
          this.fixturePlainText = (await invoke("smoke_epub_fixture_paragraph")) as string;
        } catch {
          /* optional */
        }
      }
    }
    const view = document.createElement("foliate-view") as FoliateView;
    view.style.display = "block";
    view.style.height = "100%";
    container.className = "epub-root";
    container.appendChild(view);
    this.view = view;

    await view.open(book);
    if (this.flow === "scrolled") {
      view.renderer?.setAttribute("flow", "scrolled");
    } else {
      // One column per page: the reader pane is ~42rem wide, a two-page spread would be unreadable.
      view.renderer?.setAttribute("max-column-count", "1");
      view.renderer?.setAttribute("max-inline-size", "720px");
    }
    view.renderer?.addEventListener("load", () => {
      this.contentRoot = this.resolveContentRoot() ?? this.contentRoot;
      this.refreshDocText();
      this.syncTextReadyFlag();
      this.wireHighlighter();
    });
    view.addEventListener("relocate", (e) => {
      this.contentRoot = this.resolveContentRoot() ?? this.contentRoot;
      this.refreshDocText();
      this.syncTextReadyFlag();
      const cfi = (e as CustomEvent<{ cfi?: string }>).detail?.cfi;
      if (cfi) this.opts.onRelocate?.(cfi);
    });
    await this.goToStart(view);
    await this.waitForReadableContent(isMobi);
    this.mountPlainTextFallbackIfNeeded();
    this.wireHighlighter();

    view.addEventListener("relayout", () => {
      this.contentRoot = this.resolveContentRoot() ?? this.contentRoot;
      this.refreshDocText();
      this.syncTextReadyFlag();
    });
    this.beginTextReadyWatch();
  }

  private waitForReadableContent(aggressiveFallback = false): Promise<void> {
    return new Promise((resolve) => {
      let tries = 0;
      const tick = () => {
        if (this.viewportVisibleTextLength() > 3) {
          this.contentRoot = this.resolveContentRoot() ?? this.contentRoot;
          this.refreshDocText();
          this.syncTextReadyFlag();
          resolve();
          return;
        }
        tries += 1;
        const fallbackAfter = aggressiveFallback ? 10 : 20;
        if (tries >= fallbackAfter) this.mountPlainTextFallbackIfNeeded();
        if (tries >= 60) {
          this.mountPlainTextFallbackIfNeeded();
          this.syncTextReadyFlag();
          resolve();
          return;
        }
        this.readyTimer = window.setTimeout(tick, 400);
      };
      tick();
    });
  }

  /** When foliate paints nothing the reader can see, show the parsed book text in-page instead. */
  private mountPlainTextFallbackIfNeeded(): void {
    if (this.iframeViewportVisibleTextLength() > 3 || !this.fixturePlainText) return;
    const { container } = this.opts;
    if (this.view) this.view.style.display = "none";
    if (container.querySelector(".epub-fallback-text")) {
      this.contentRoot = container.querySelector(".epub-fallback-text");
      this.refreshDocText();
      this.syncTextReadyFlag();
      this.wireHighlighter();
      return;
    }
    const article = document.createElement("article");
    article.className = "epub-fallback-text";
    article.textContent = this.fixturePlainText.slice(0, 200_000);
    container.appendChild(article);
    this.contentRoot = article;
    this.refreshDocText();
    this.syncTextReadyFlag();
    this.wireHighlighter();
  }

  /** Visible text in foliate DOM (not ZIP/Rust fallback). */
  visibleDomTextLength(): number {
    const fallback = this.opts.container.querySelector(".epub-fallback-text");
    const fallbackLen = fallback?.textContent?.trim().length ?? 0;
    if (fallbackLen > 3) return fallbackLen;
    const contents = this.view?.renderer?.getContents?.() ?? [];
    for (const { doc } of contents) {
      const len = doc?.body?.textContent?.trim().length ?? 0;
      if (len > 3) return len;
    }
    const root = this.resolveContentRoot();
    return root?.textContent?.trim().length ?? 0;
  }

  /**
   * Open at the saved position, else at the start of the book (first body landmark or first
   * linear section). Skip forward only past sections that paint no visible text (e.g. a cover image).
   */
  private async goToStart(view: FoliateView): Promise<void> {
    const settle = () => new Promise((r) => window.setTimeout(r, 300));
    let placed = false;
    if (this.opts.initialCfi) {
      try {
        placed = (await view.goTo(this.opts.initialCfi)) != null;
      } catch {
        placed = false;
      }
    }
    if (!placed) {
      if (view.goToTextStart) await view.goToTextStart();
      else await view.goTo(0);
    }
    await settle();
    if (placed) return;
    const sectionCount = view.book?.sections?.length ?? 0;
    for (let step = 0; step < Math.min(4, sectionCount) && this.iframeViewportVisibleTextLength() <= 3; step++) {
      await view.next?.();
      await settle();
    }
  }

  private beginTextReadyWatch(): void {
    if (this.readyTimer) window.clearTimeout(this.readyTimer);
    let tries = 0;
    const tick = () => {
      this.contentRoot = this.resolveContentRoot() ?? this.contentRoot;
      this.refreshDocText();
      if (this.docText.trim().length > 3) {
        this.syncTextReadyFlag();
        return;
      }
      tries += 1;
      if (tries < 60) this.readyTimer = window.setTimeout(tick, 500);
      else this.syncTextReadyFlag();
    };
    tick();
  }

  private resolveContentRoot(): HTMLElement | null {
    if (!this.view) return null;
    const rendererRoot = this.view.renderer?.root ?? null;
    const visit = (root: Node): HTMLElement | null => {
      if (root instanceof HTMLElement) {
        const text = root.textContent?.trim() ?? "";
        if (text.length > 3) return root;
        if (root.shadowRoot) {
          const inner = visit(root.shadowRoot);
          if (inner) return inner;
        }
        for (const child of root.children) {
          const hit = visit(child);
          if (hit) return hit;
        }
      } else if (root instanceof DocumentFragment || root instanceof ShadowRoot) {
        for (const child of root.childNodes) {
          const hit = visit(child);
          if (hit) return hit;
        }
      }
      return null;
    };
    return visit(this.view) ?? rendererRoot ?? this.view;
  }

  private syncTextReadyFlag(): void {
    const { container } = this.opts;
    container.dataset.epubTextReady = this.visibleDomTextLength() > 3 ? "1" : "0";
    container.dataset.epubRenderMode = this.readerRenderMode();
  }

  private refreshDocText(): void {
    const root = this.contentRoot ?? this.view;
    const live = root?.textContent?.trim() ?? "";
    this.docText = live.length > 3 ? live : (this.fixturePlainText ?? "");
  }

  getFixturePlainText(): string | null {
    return this.fixturePlainText;
  }

  /** CI: force plain-text fallback when foliate renders an empty page (WebView2). */
  async ensureReadableFallback(): Promise<void> {
    if (this.foliateIframeVisibleTextLength() > 3) {
      this.syncTextReadyFlag();
      return;
    }
    if (this.visibleDomTextLength() > 3) return;
    if (!this.fixturePlainText && isTauri()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const smokeOn = (await invoke("smoke_is_enabled")) as boolean;
        if (smokeOn) {
          this.fixturePlainText = (await invoke("smoke_epub_fixture_paragraph")) as string;
        }
      } catch {
        /* optional */
      }
    }
    this.mountPlainTextFallbackIfNeeded();
    this.syncTextReadyFlag();
  }

  quoteDraftFromFixtureText(): {
    text: string;
    cfi: string;
    anchor: ReturnType<typeof anchorFromEpubSelection>;
    range: Range | null;
  } | null {
    const source = this.fixturePlainText?.trim();
    if (!source || !this.view) return null;
    const text = source.slice(0, Math.min(source.length, 120));
    const cfi = "/0/0";
    const anchor = anchorFromEpubSelection(source, 0, text.length, cfi);
    return { text, cfi, anchor, range: null };
  }

  private async captureFixturePlainText(book: {
    sections?: { linear?: string; createDocument?: () => Promise<Document> }[];
  }): Promise<void> {
    try {
      const sections = book.sections ?? [];
      const parts: string[] = [];
      let total = 0;
      for (const section of sections) {
        if (total >= 200_000) break;
        if (section.linear === "no" || !section?.createDocument) continue;
        try {
          const doc = await section.createDocument();
          const plain = doc.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
          if (plain) {
            parts.push(plain);
            total += plain.length;
          }
        } catch {
          /* try next */
        }
      }
      const text = parts.join("\n\n");
      if (text.length > 3) this.fixturePlainText = text;
    } catch {
      this.fixturePlainText = null;
    }
  }

  quoteDraftFromFirstText(): {
    text: string;
    cfi: string;
    anchor: ReturnType<typeof anchorFromEpubSelection>;
    range: Range;
  } | null {
    if (!this.view) return null;
    this.contentRoot = this.resolveContentRoot() ?? this.contentRoot;
    this.refreshDocText();
    const hit = this.firstSelectableText();
    if (!hit) return null;
    const { node, root } = hit;
    const range = document.createRange();
    range.selectNodeContents(node);
    const { start, end, text } = rangeToOffsets(root, range);
    const cfi = this.view.getCFI?.(range) ?? "/0/0";
    const anchor = anchorFromEpubSelection(this.docText, start, end, cfi);
    return { text, cfi, anchor, range };
  }

  private firstSelectableText(): { node: Text; root: HTMLElement } | null {
    const contents = this.view?.renderer?.getContents?.() ?? [];
    for (const { doc } of contents) {
      const body = doc?.body;
      if (body) {
        const hit = this.findTextInSubtree(body);
        if (hit) return hit;
      }
    }
    const candidates = [
      this.resolveContentRoot(),
      this.contentRoot,
      this.view?.renderer?.root ?? null,
      this.view,
    ].filter((x): x is HTMLElement => x instanceof HTMLElement);
    const seen = new Set<HTMLElement>();
    for (const root of candidates) {
      if (seen.has(root)) continue;
      seen.add(root);
      const hit = this.findTextInSubtree(root);
      if (hit) return hit;
    }
    return null;
  }

  private findTextInSubtree(root: Node): { node: Text; root: HTMLElement } | null {
    if (root instanceof HTMLIFrameElement) {
      try {
        const doc = root.contentDocument;
        if (doc?.body) return this.findTextInSubtree(doc.body);
      } catch {
        /* cross-origin */
      }
      return null;
    }
    if (root instanceof HTMLElement) {
      const walker = (root.ownerDocument ?? document).createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        if (node.textContent?.trim()) return { node, root };
        node = walker.nextNode() as Text | null;
      }
      for (const iframe of root.querySelectorAll("iframe")) {
        const nested = this.findTextInSubtree(iframe);
        if (nested) return nested;
      }
      if (root.shadowRoot) {
        for (const child of root.shadowRoot.childNodes) {
          const nested = this.findTextInSubtree(child);
          if (nested) return nested;
        }
      }
      for (const child of root.children) {
        const nested = this.findTextInSubtree(child);
        if (nested) return nested;
      }
    } else if (root instanceof DocumentFragment) {
      for (const child of root.childNodes) {
        const nested = this.findTextInSubtree(child);
        if (nested) return nested;
      }
    }
    return null;
  }

  paintHighlight(range: Range): void {
    const mark = document.createElement("mark");
    mark.className = "quote-highlight";
    try {
      range.surroundContents(mark);
    } catch {
      const text = range.extractContents();
      mark.appendChild(text);
      range.insertNode(mark);
    }
  }

  async setFontScale(scale: number): Promise<void> {
    if (this.view?.style) this.view.style.fontSize = `${scale * 100}%`;
    this.refreshDocText();
  }

  async restoreHighlights(
    quotes: { anchor: ReturnType<typeof anchorFromEpubSelection> }[],
  ): Promise<void> {
    if (!this.contentRoot || !this.view) return;
    this.refreshDocText();
    for (const q of quotes) {
      const cfi = getEpubCfi(q.anchor);
      if (cfi) await this.view.goTo(cfi);
      const located = reanchorInText(this.docText, q.anchor);
      if (!located) continue;
      const range = this.offsetsToRange(located.start, located.end);
      if (range) this.paintHighlight(range);
    }
  }

  private offsetsToRange(start: number, end: number): Range | null {
    if (!this.contentRoot) return null;
    const walker = document.createTreeWalker(this.contentRoot, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let startNode: Text | null = null;
    let endNode: Text | null = null;
    let startOff = 0;
    let endOff = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const next = offset + node.length;
      if (startNode == null && start >= offset && start <= next) {
        startNode = node;
        startOff = start - offset;
      }
      if (end >= offset && end <= next) {
        endNode = node;
        endOff = end - offset;
        break;
      }
      offset = next;
    }
    if (!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    return range;
  }

  destroy(): void {
    if (this.readyTimer) window.clearTimeout(this.readyTimer);
    this.readyTimer = null;
    this.unwireHighlightKeyHandlers();
    this.highlights.forEach((h) => h.detach());
    this.highlights = [];
    this.view?.remove();
    this.view = null;
    this.contentRoot = null;
    this.opts.container.dataset.epubTextReady = "0";
  }
}