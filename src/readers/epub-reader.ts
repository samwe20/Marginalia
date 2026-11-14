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
    this.contentRoot = view.renderer?.root ?? view;
    this.refreshDocText();

    this.detach = attachHighlighter(
      this.contentRoot,
      (x, y) => document.caretRangeFromPoint?.(x, y) ?? null,
      (range) => {
        if (!this.contentRoot) return;
        const { start, end, text } = rangeToOffsets(this.contentRoot, range);
        const cfi = view.getCFI?.(range) ?? `/0/0`;
        const anchor = anchorFromEpubSelection(this.docText, start, end, cfi);
        this.opts.onHighlight({ text, cfi, anchor });
        this.paint(range);
      },
      this.opts.getMode,
    );

    view.addEventListener("relayout", () => this.refreshDocText());
  }

  private refreshDocText(): void {
    this.docText = this.contentRoot?.textContent ?? "";
  }

  private paint(range: Range): void {
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
      if (range) this.paint(range);
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
    this.detach?.();
    this.detach = null;
    this.view?.remove();
    this.view = null;
    this.contentRoot = null;
  }
}