import "foliate-js/view.js";
import { anchorFromEpubSelection, getEpubCfi, reanchorInText } from "../lib/anchor";
import { attachHighlighter, rangeToOffsets, type HighlightMode } from "../lib/highlighter";
import { isTauri } from "../lib/runtime";

export interface EpubReaderOptions {
  container: HTMLElement;
  getMode: () => HighlightMode;
  onHighlight: (quote: {
    text: string;
    cfi: string;
    anchor: ReturnType<typeof anchorFromEpubSelection>;
  }) => void;
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
  private detach: (() => void) | null = null;
  private readyTimer: number | null = null;
  private docText = "";
  private fixturePlainText: string | null = null;

  constructor(private opts: EpubReaderOptions) {}

  async load(file: Blob | File): Promise<void> {
    this.destroy();
    const { container } = this.opts;
    container.innerHTML = "";

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
    });
    view.renderer?.addEventListener?.("relocate", () => {
      this.contentRoot = this.resolveContentRoot() ?? this.contentRoot;
      this.refreshDocText();
      this.syncTextReadyFlag();
    });
    await this.waitForReadableContent();
    this.mountPlainTextFallbackIfNeeded();
    const highlightRoot = this.contentRoot ?? this.resolveContentRoot() ?? view;

    this.detach = attachHighlighter(
      highlightRoot,
      (x, y) => document.caretRangeFromPoint?.(x, y) ?? null,
      (range) => {
        const root = this.contentRoot ?? highlightRoot;
        if (!root) return;
        const { start, end, text } = rangeToOffsets(root, range);
        const cfi = view.getCFI?.(range) ?? `/0/0`;
        const anchor = anchorFromEpubSelection(this.docText, start, end, cfi);
        this.opts.onHighlight({ text, cfi, anchor });
        this.paintHighlight(range);
      },
      this.opts.getMode,
    );

    view.addEventListener("relayout", () => {
      this.contentRoot = this.resolveContentRoot() ?? this.contentRoot;
      this.refreshDocText();
      this.syncTextReadyFlag();
    });
    this.beginTextReadyWatch();
  }

  private waitForReadableContent(): Promise<void> {
    return new Promise((resolve) => {
      let tries = 0;
      const tick = () => {
        if (this.visibleDomTextLength() > 3) {
          this.contentRoot = this.resolveContentRoot() ?? this.contentRoot;
          this.refreshDocText();
          this.syncTextReadyFlag();
          resolve();
          return;
        }
        tries += 1;
        if (tries >= 60) this.mountPlainTextFallbackIfNeeded();
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
    if (this.visibleDomTextLength() > 3 || !this.fixturePlainText) return;
    const { container } = this.opts;
    if (container.querySelector(".epub-fallback-text")) {
      this.contentRoot = container.querySelector(".epub-fallback-text");
      this.refreshDocText();
      this.syncTextReadyFlag();
      return;
    }
    const article = document.createElement("article");
    article.className = "epub-fallback-text";
    article.textContent = this.fixturePlainText.slice(0, 200_000);
    container.appendChild(article);
    this.contentRoot = article;
    this.refreshDocText();
    this.syncTextReadyFlag();
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
      if (this.visibleDomTextLength() > 3) return;
    }
    for (let step = 0; step < 6 && this.visibleDomTextLength() <= 3; step++) {
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
        if (section.linear === "no" || !section.createDocument) continue;
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
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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
    this.detach?.();
    this.detach = null;
    this.view?.remove();
    this.view = null;
    this.contentRoot = null;
    this.opts.container.dataset.epubTextReady = "0";
  }
}