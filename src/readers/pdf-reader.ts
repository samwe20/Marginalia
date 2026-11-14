import * as pdfjs from "pdfjs-dist";
import { TextLayer } from "pdfjs-dist/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { anchorFromPdfSelection, getPdfPosition, getTextQuote, reanchorInText } from "../lib/anchor";
import { attachHighlighter, rangeToOffsets, type HighlightMode } from "../lib/highlighter";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PdfReaderOptions {
  container: HTMLElement;
  getMode: () => HighlightMode;
  onHighlight: (quote: { text: string; pageIndex: number; anchor: ReturnType<typeof anchorFromPdfSelection> }) => void;
  onPageLabel?: (pageIndex: number) => string;
}

export class PdfReader {
  private pdf: pdfjs.PDFDocumentProxy | null = null;
  private pageRoots = new Map<number, HTMLElement>();
  private detach: (() => void) | null = null;

  constructor(private opts: PdfReaderOptions) {}

  async load(data: ArrayBuffer): Promise<void> {
    this.destroy();
    const task = pdfjs.getDocument({ data: data.slice(0) });
    this.pdf = await task.promise;
    await this.renderAll();
    this.wireHighlighter();
  }

  private async renderAll(): Promise<void> {
    const { container } = this.opts;
    container.innerHTML = "";
    if (!this.pdf) return;
    for (let pageNum = 1; pageNum <= this.pdf.numPages; pageNum++) {
      const page = await this.pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.2 });
      const wrap = document.createElement("div");
      wrap.className = "pdf-page";
      wrap.dataset.pageIndex = String(pageNum - 1);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;

      const textLayer = document.createElement("div");
      textLayer.className = "textLayer";
      textLayer.style.setProperty("--scale-factor", String(viewport.scale));

      const text = await page.getTextContent();
      const layer = new TextLayer({
        textContentSource: text,
        container: textLayer,
        viewport,
      });
      await layer.render();

      wrap.append(canvas, textLayer);
      container.appendChild(wrap);
      this.pageRoots.set(pageNum - 1, textLayer);
    }
  }

  private wireHighlighter(): void {
    this.detach?.();
    this.detach = attachHighlighter(
      this.opts.container,
      (x, y) => {
        const el = document.elementFromPoint(x, y);
        if (el) {
          for (const layer of this.pageRoots.values()) {
            if (layer.contains(el) && document.caretRangeFromPoint) {
              return document.caretRangeFromPoint(x, y);
            }
          }
        }
        return null;
      },
      (range, _stroke) => {
        const pageLayer = this.findPageLayer(range);
        if (!pageLayer) return;
        const pageIndex = Number(pageLayer.dataset.pageIndex ?? "0");
        const { start, end, text } = rangeToOffsets(pageLayer, range);
        const anchor = anchorFromPdfSelection(pageLayer.textContent ?? "", pageIndex, start, end, []);
        this.opts.onHighlight({ text, pageIndex, anchor });
        this.paintHighlight(pageLayer, range);
      },
      this.opts.getMode,
    );
  }

  private findPageLayer(range: Range): HTMLElement | null {
    for (const layer of this.pageRoots.values()) {
      if (layer.contains(range.commonAncestorContainer)) return layer;
    }
    return null;
  }

  paintHighlight(_layer: HTMLElement, range: Range): void {
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

  async restoreHighlights(
    quotes: { anchor: ReturnType<typeof anchorFromPdfSelection>; text: string }[],
  ): Promise<void> {
    for (const q of quotes) {
      const pos = getPdfPosition(q.anchor);
      const pageIndex = pos?.pageIndex ?? 0;
      const layer = this.pageRoots.get(pageIndex);
      if (!layer) continue;
      const located = reanchorInText(layer.textContent ?? "", q.anchor);
      if (!located) continue;
      const range = this.offsetsToRange(layer, located.start, located.end);
      if (range) this.paintHighlight(layer, range);
    }
  }

  private offsetsToRange(root: HTMLElement, start: number, end: number): Range | null {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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
    this.pageRoots.clear();
    this.pdf?.destroy();
    this.pdf = null;
  }

  getPageLabel(pageIndex: number): string {
    return this.opts.onPageLabel?.(pageIndex) ?? String(pageIndex + 1);
  }

  static extractQuoteText(anchor: ReturnType<typeof anchorFromPdfSelection>): string {
    return getTextQuote(anchor)?.exact ?? "";
  }
}