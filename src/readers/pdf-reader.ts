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
  onSelectionPending?: () => void;
}

export class PdfReader {
  private pdf: pdfjs.PDFDocumentProxy | null = null;
  private pageRoots = new Map<number, HTMLElement>();
  private highlight: import("../lib/highlighter").HighlightHandle | null = null;

  constructor(private opts: PdfReaderOptions) {}

  async load(data: ArrayBuffer): Promise<void> {
    this.destroy();
    this.opts.container.dataset.pdfTextReady = "0";
    const task = pdfjs.getDocument({ data: data.slice(0), useSystemFonts: true });
    this.pdf = await task.promise;
    await this.renderAll();
    this.wireHighlighter();
    this.opts.container.dataset.pdfTextReady = this.hasSelectableText() ? "1" : "0";
  }

  private hasSelectableText(): boolean {
    for (const layer of this.pageRoots.values()) {
      for (const span of layer.querySelectorAll("span")) {
        if ((span.textContent ?? "").trim().length > 0) return true;
      }
    }
    return false;
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
      textLayer.dataset.pageIndex = String(pageNum - 1);
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

  commitPendingHighlight(): boolean {
    return this.highlight?.commitPending() ?? false;
  }

  private wireHighlighter(): void {
    this.highlight?.detach();
    this.highlight = attachHighlighter(
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
        const hit = this.findPageLayer(range);
        if (!hit) return;
        const { layer, pageIndex } = hit;
        const { start, end, text } = rangeToOffsets(layer, range);
        const anchor = anchorFromPdfSelection(layer.textContent ?? "", pageIndex, start, end, []);
        this.opts.onHighlight({ text, pageIndex, anchor });
        this.paintHighlight(layer, range);
      },
      this.opts.getMode,
      () => this.opts.onSelectionPending?.(),
    );
  }

  private findPageLayer(range: Range): { layer: HTMLElement; pageIndex: number } | null {
    for (const [pageIndex, layer] of this.pageRoots) {
      if (layer.contains(range.commonAncestorContainer)) return { layer, pageIndex };
    }
    return null;
  }

  getPageCount(): number {
    return this.pdf?.numPages ?? 0;
  }

  /** Smoke / recovery: first non-empty text span on any page. */
  quoteDraftFromFirstText(): {
    text: string;
    pageIndex: number;
    anchor: ReturnType<typeof anchorFromPdfSelection>;
    range: Range;
    layer: HTMLElement;
  } | null {
    for (const [pageIndex, layer] of this.pageRoots) {
      const span = layer.querySelector("span");
      if (!span?.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(span);
      const { start, end, text } = rangeToOffsets(layer, range);
      const anchor = anchorFromPdfSelection(layer.textContent ?? "", pageIndex, start, end, []);
      return { text, pageIndex, anchor, range, layer };
    }
    return null;
  }

  paintHighlight(layer: HTMLElement, range: Range): void {
    // Multi-span / multi-line PDF selections cannot use surroundContents safely.
    // Wrap each intersecting text node (or paint rect overlays as fallback).
    if (this.paintHighlightByTextNodes(range)) return;
    this.paintHighlightByClientRects(layer, range);
  }

  private paintHighlightByTextNodes(range: Range): boolean {
    const doc = range.startContainer.ownerDocument ?? document;
    const root = range.commonAncestorContainer;
    const walkerRoot =
      root.nodeType === Node.ELEMENT_NODE ? (root as HTMLElement) : root.parentElement;
    if (!walkerRoot) return false;
    const nodes: Text[] = [];
    const walker = doc.createTreeWalker(walkerRoot, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.data.trim()) continue;
      try {
        if (
          range.comparePoint(node, 0) <= 0 &&
          range.comparePoint(node, node.data.length) >= 0
        ) {
          nodes.push(node);
          continue;
        }
        // Partial overlap
        if (
          range.comparePoint(node, 0) === 1 &&
          range.comparePoint(node, node.data.length) === -1
        ) {
          continue;
        }
        const intersects =
          !(range.comparePoint(node, node.data.length) < 0 || range.comparePoint(node, 0) > 0);
        if (intersects) nodes.push(node);
      } catch {
        /* comparePoint can throw across documents */
      }
    }
    if (!nodes.length) return false;
    let painted = 0;
    for (const node of nodes) {
      let start = 0;
      let end = node.data.length;
      if (node === range.startContainer) start = range.startOffset;
      if (node === range.endContainer) end = range.endOffset;
      if (start >= end) {
        if (node !== range.startContainer && node !== range.endContainer) {
          start = 0;
          end = node.data.length;
        } else continue;
      }
      try {
        const piece = doc.createRange();
        piece.setStart(node, start);
        piece.setEnd(node, end);
        const mark = doc.createElement("mark");
        mark.className = "quote-highlight";
        mark.style.backgroundColor = "#f0c84b";
        mark.style.borderRadius = "3px";
        mark.style.color = "inherit";
        piece.surroundContents(mark);
        painted += 1;
      } catch {
        try {
          const piece = doc.createRange();
          piece.setStart(node, start);
          piece.setEnd(node, end);
          const mark = doc.createElement("mark");
          mark.className = "quote-highlight";
          mark.style.backgroundColor = "#f0c84b";
          mark.style.borderRadius = "3px";
          mark.style.color = "inherit";
          const frag = piece.extractContents();
          mark.appendChild(frag);
          piece.insertNode(mark);
          painted += 1;
        } catch {
          /* continue */
        }
      }
    }
    return painted > 0;
  }

  private paintHighlightByClientRects(layer: HTMLElement, range: Range): void {
    const doc = layer.ownerDocument ?? document;
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return;
    const layerRect = layer.getBoundingClientRect();
    let overlay = layer.querySelector<HTMLElement>(":scope > .quote-highlight-overlay-root");
    if (!overlay) {
      overlay = doc.createElement("div");
      overlay.className = "quote-highlight-overlay-root";
      overlay.style.position = "absolute";
      overlay.style.inset = "0";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "2";
      if (getComputedStyle(layer).position === "static") layer.style.position = "relative";
      layer.appendChild(overlay);
    }
    for (const r of rects) {
      const box = doc.createElement("div");
      box.className = "quote-highlight quote-highlight--rect";
      box.style.position = "absolute";
      box.style.left = `${r.left - layerRect.left + layer.scrollLeft}px`;
      box.style.top = `${r.top - layerRect.top + layer.scrollTop}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
      box.style.backgroundColor = "rgba(240, 200, 75, 0.45)";
      box.style.borderRadius = "2px";
      overlay.appendChild(box);
    }
  }

  highlightPaintCount(): number {
    return this.opts.container.querySelectorAll("mark.quote-highlight, .quote-highlight--rect").length;
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
    this.highlight?.detach();
    this.highlight = null;
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

/** Updates footer as `current/total` while scrolling the PDF surface. */
export function attachPdfPageCounter(
  scrollRoot: HTMLElement,
  pdfRoot: HTMLElement,
  counterEl: HTMLElement,
  numPages: number,
): () => void {
  const format = (oneBased: number) => `${oneBased}/${numPages}`;
  const update = () => {
    const pages = pdfRoot.querySelectorAll<HTMLElement>(".pdf-page");
    if (!pages.length || numPages < 1) {
      counterEl.textContent = format(1);
      return;
    }
    const mid = scrollRoot.getBoundingClientRect().top + scrollRoot.clientHeight / 2;
    let best = 0;
    let bestDist = Infinity;
    pages.forEach((page, i) => {
      const r = page.getBoundingClientRect();
      const center = (r.top + r.bottom) / 2;
      const d = Math.abs(center - mid);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    counterEl.textContent = format(best + 1);
  };
  scrollRoot.addEventListener("scroll", update, { passive: true });
  update();
  return () => scrollRoot.removeEventListener("scroll", update);
}