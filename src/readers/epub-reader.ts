import "foliate-js/view.js";
import { anchorFromEpubSelection, getEpubCfi, reanchorInText } from "../lib/anchor";
import {
  collectFoliateContentDocuments,
  findFallbackPointerRect,
  findIframePointerRect,
  iframeVisibleTextLength,
} from "../lib/epub-iframe-geometry";
import {
  attachHighlighter,
  caretRangeFromViewportPoint,
  rangeToOffsets,
  type HighlightHandle,
  type HighlightMode,
} from "../lib/highlighter";
import { isTauri } from "../lib/runtime";

export interface EpubReaderOptions {
  container: HTMLElement;
  getMode: () => HighlightMode;
  onHighlight: (quote: {
    text: string;
    cfi: string;
    anchor: ReturnType<typeof anchorFromEpubSelection>;
  }) => void;
  onSelectionPending?: () => void;
}

type FoliateView = HTMLElement & {
  open: (book: unknown) => Promise<void>;
  init?: (opts: { showTextStart?: boolean }) => Promise<void>;
  goToTextStart?: () => Promise<void>;
  goTo: (target: string | number) => Promise<void>;
  getCFI: (range: Range) => string;
  renderer?: {
    root?: HTMLElement;
    getContents?: () => { index: number; doc: Document }[];
    addEventListener?: (type: string, fn: (e: Event) => void) => void;
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

  constructor(private opts: EpubReaderOptions) {}

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

  readerRenderMode(): "iframe" | "fallback" | "empty" {
    if (this.foliateIframeVisibleTextLength() > 3) return "iframe";
    const fallback = this.opts.container.querySelector(".epub-fallback-text");
    if ((fallback?.textContent?.trim().length ?? 0) > 3) return "fallback";
    return "empty";
  }

  readerRenderInfo(): {
    mode: "iframe" | "fallback" | "empty";
    iframeTextLength: number;
    fallbackTextLength: number;
    visibleTextLength: number;
  } {
    const fallback = this.opts.container.querySelector(".epub-fallback-text");
    return {
      mode: this.readerRenderMode(),
      iframeTextLength: this.foliateIframeVisibleTextLength(),
      fallbackTextLength: fallback?.textContent?.trim().length ?? 0,
      visibleTextLength: this.visibleDomTextLength(),
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
    const sectionBook = book as { sections?: { linear?: string; createDocument?: () => Promise<Document> }[] };
    const startIndex = await this.findBestReadableSectionIndex(sectionBook);
    const paginator = view.renderer as {
      firstSection?: () => Promise<void>;
      goTo?: (target: { index: number }) => Promise<void>;
      next?: () => Promise<void>;
    };
    if (paginator?.goTo) await paginator.goTo({ index: startIndex });
    else await view.goTo(startIndex);
    await this.ensureVisibleSection(paginator, view, sectionBook, startIndex);
    view.renderer?.addEventListener?.("load", () => {
      this.contentRoot = this.resolveContentRoot() ?? this.contentRoot;
      this.refreshDocText();
      this.syncTextReadyFlag();
      this.wireHighlighter();
    });
    view.renderer?.addEventListener?.("relocate", () => {
      this.contentRoot = this.resolveContentRoot() ?? this.contentRoot;
      this.refreshDocText();
      this.syncTextReadyFlag();
    });
    await this.waitForReadableContent(isMobi);
    if (isMobi && this.visibleDomTextLength() <= 3) {
      await this.captureFixturePlainText(
        book as { sections?: { linear?: string; createDocument?: () => Promise<Document> }[] },
      );
      this.mountPlainTextFallbackIfNeeded();
    }
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
        if (this.foliateIframeVisibleTextLength() > 3 || this.visibleDomTextLength() > 3) {
          this.contentRoot = this.resolveContentRoot() ?? this.contentRoot;
          this.refreshDocText();
          this.syncTextReadyFlag();
          resolve();
          return;
        }
        tries += 1;
        const fallbackAfter = aggressiveFallback ? 15 : 60;
        if (tries >= fallbackAfter) this.mountPlainTextFallbackIfNeeded();
        if (tries >= 180) {
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

  /** When foliate leaves the paginator empty (large EPUB / WebView2), show parsed spine text in-page. */
  private mountPlainTextFallbackIfNeeded(): void {
    if (this.foliateIframeVisibleTextLength() > 3) return;
    if (this.visibleDomTextLength() > 3 || !this.fixturePlainText) return;
    const { container } = this.opts;
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

  private async ensureVisibleSection(
    paginator: { goTo?: (target: { index: number }) => Promise<void>; next?: () => Promise<void> } | undefined,
    view: FoliateView,
    book: { sections?: { linear?: string; createDocument?: () => Promise<Document> }[] },
    startIndex: number,
  ): Promise<void> {
    const tryIndex = async (index: number) => {
      if (paginator?.goTo) await paginator.goTo({ index });
      else await view.goTo(index);
      await new Promise((r) => window.setTimeout(r, 350));
    };
    const sections = book.sections ?? [];
    const linearIndices = sections
      .map((s, i) => (s?.linear !== "no" ? i : -1))
      .filter((i) => i >= 0);
    const candidates = [startIndex, ...linearIndices.filter((i) => i !== startIndex)].slice(0, 14);
    for (const index of candidates) {
      await tryIndex(index);
      if (this.foliateIframeVisibleTextLength() > 3 || this.visibleDomTextLength() > 3) return;
    }
    for (
      let step = 0;
      step < 6 && this.foliateIframeVisibleTextLength() <= 3 && this.visibleDomTextLength() <= 3;
      step++
    ) {
      await paginator?.next?.();
      await new Promise((r) => window.setTimeout(r, 350));
    }
  }

  private async findBestReadableSectionIndex(book: {
    sections?: { linear?: string; createDocument?: () => Promise<Document> }[];
  }): Promise<number> {
    const sections = book.sections ?? [];
    let bestIdx = sections.findIndex((s) => s.linear !== "no");
    if (bestIdx < 0) bestIdx = 0;
    let bestLen = 0;
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (section?.linear === "no") continue;
      try {
        if (!section?.createDocument) continue;
        const doc = await section.createDocument();
        const len = doc.body?.textContent?.replace(/\s+/g, " ").trim().length ?? 0;
        if (len > bestLen) {
          bestLen = len;
          bestIdx = i;
        }
      } catch {
        /* skip broken section */
      }
    }
    return bestIdx;
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
      let best = "";
      for (const section of sections) {
        if (section.linear === "no" || !section?.createDocument) continue;
        try {
          const doc = await section.createDocument();
          const plain = doc.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
          if (plain.length > best.length) best = plain;
        } catch {
          /* try next */
        }
      }
      if (best.length > 3) this.fixturePlainText = best;
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
    this.highlights.forEach((h) => h.detach());
    this.highlights = [];
    this.view?.remove();
    this.view = null;
    this.contentRoot = null;
    this.opts.container.dataset.epubTextReady = "0";
  }
}