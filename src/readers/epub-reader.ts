import "foliate-js/view.js";
import { anchorFromEpubSelection, getEpubCfi, reanchorInText } from "../lib/anchor";
import { attachHighlighter, rangeToOffsets, type HighlightMode } from "../lib/highlighter";

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
  goTo: (target: string) => Promise<void>;
  getCFI: (range: Range) => string;
  renderer?: { root?: HTMLElement };
};

/** Thin wrapper around foliate-js `foliate-view` custom element. */
export class EpubReader {
  private view: FoliateView | null = null;
  private contentRoot: HTMLElement | null = null;
  private detach: (() => void) | null = null;
  private readyTimer: number | null = null;
  private docText = "";

  constructor(private opts: EpubReaderOptions) {}

  async load(file: Blob | File): Promise<void> {
    this.destroy();
    const { container } = this.opts;
    container.innerHTML = "";

    const { makeBook } = await import("foliate-js/view.js");
    const book = await makeBook(file);
    const view = document.createElement("foliate-view") as FoliateView;
    view.style.display = "block";
    view.style.height = "100%";
    container.className = "epub-root";
    container.appendChild(view);
    this.view = view;

    await view.open(book);
    await this.waitForReadableContent();
    const highlightRoot = this.contentRoot ?? view;

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
        this.contentRoot = this.resolveContentRoot();
        this.refreshDocText();
        if (this.contentRoot && this.docText.trim().length > 3) {
          this.syncTextReadyFlag();
          resolve();
          return;
        }
        tries += 1;
        if (tries >= 180) {
          this.syncTextReadyFlag();
          resolve();
          return;
        }
        this.readyTimer = window.setTimeout(tick, 400);
      };
      tick();
    });
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
    container.dataset.epubTextReady = this.firstSelectableText() ? "1" : "0";
  }

  private refreshDocText(): void {
    const root = this.contentRoot ?? this.view;
    this.docText = root?.textContent ?? "";
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
    if (root instanceof HTMLElement) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        if (node.textContent?.trim()) return { node, root };
        node = walker.nextNode() as Text | null;
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