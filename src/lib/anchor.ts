/** W3C Web Annotation–style anchors for PDF and EPUB highlights. */

export type SelectorType =
  | "TextQuoteSelector"
  | "TextPositionSelector"
  | "FragmentSelector"
  | "PdfPositionSelector"
  | "PdfRectSelector";

export interface TextQuoteSelector {
  type: "TextQuoteSelector";
  exact: string;
  prefix?: string;
  suffix?: string;
}

export interface TextPositionSelector {
  type: "TextPositionSelector";
  start: number;
  end: number;
}

export interface FragmentSelector {
  type: "FragmentSelector";
  conformsTo: "http://idpf.org/epub/fragment";
  value: string;
}

export interface PdfPositionSelector {
  type: "PdfPositionSelector";
  pageIndex: number;
  startOffset: number;
  endOffset: number;
}

export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfRectSelector {
  type: "PdfRectSelector";
  pageIndex: number;
  rects: PdfRect[];
}

export type Selector =
  | TextQuoteSelector
  | TextPositionSelector
  | FragmentSelector
  | PdfPositionSelector
  | PdfRectSelector;

export interface Anchor {
  selectors: Selector[];
}

const PREFIX_LEN = 32;
const SUFFIX_LEN = 32;

export function buildTextQuote(
  documentText: string,
  start: number,
  end: number,
): TextQuoteSelector {
  const exact = documentText.slice(start, end);
  const prefix = documentText.slice(Math.max(0, start - PREFIX_LEN), start);
  const suffix = documentText.slice(end, Math.min(documentText.length, end + SUFFIX_LEN));
  return { type: "TextQuoteSelector", exact, prefix, suffix };
}

export function anchorFromPdfSelection(
  pageText: string,
  pageIndex: number,
  startOffset: number,
  endOffset: number,
  rects: PdfRect[],
): Anchor {
  const selectors: Selector[] = [
    buildTextQuote(pageText, startOffset, endOffset),
    { type: "PdfPositionSelector", pageIndex, startOffset, endOffset },
  ];
  if (rects.length > 0) {
    selectors.push({ type: "PdfRectSelector", pageIndex, rects });
  }
  return { selectors };
}

export function anchorFromEpubSelection(
  documentText: string,
  start: number,
  end: number,
  cfi: string,
): Anchor {
  return {
    selectors: [
      buildTextQuote(documentText, start, end),
      {
        type: "FragmentSelector",
        conformsTo: "http://idpf.org/epub/fragment",
        value: cfi,
      },
    ],
  };
}

export function serializeAnchor(anchor: Anchor): string {
  return JSON.stringify(anchor);
}

export function parseAnchor(raw: string): Anchor {
  const parsed = JSON.parse(raw) as Anchor;
  if (!parsed?.selectors || !Array.isArray(parsed.selectors)) {
    throw new Error("Invalid anchor");
  }
  return parsed;
}

export function getTextQuote(anchor: Anchor): TextQuoteSelector | undefined {
  return anchor.selectors.find((s): s is TextQuoteSelector => s.type === "TextQuoteSelector");
}

export function getPdfPosition(anchor: Anchor): PdfPositionSelector | undefined {
  return anchor.selectors.find((s): s is PdfPositionSelector => s.type === "PdfPositionSelector");
}

export function getEpubCfi(anchor: Anchor): string | undefined {
  const sel = anchor.selectors.find((s): s is FragmentSelector => s.type === "FragmentSelector");
  return sel?.value;
}

/** Score best fuzzy match of a text quote in `haystack` (Hypothesis-style). */
export function fuzzyLocateTextQuote(
  haystack: string,
  quote: TextQuoteSelector,
): { start: number; end: number; score: number } | null {
  const { exact, prefix = "", suffix = "" } = quote;
  if (!exact) return null;

  let best: { start: number; end: number; score: number } | null = null;
  let from = 0;
  while (from < haystack.length) {
    const at = haystack.indexOf(exact, from);
    if (at < 0) break;
    const end = at + exact.length;
    const gotPrefix = haystack.slice(Math.max(0, at - prefix.length), at);
    const gotSuffix = haystack.slice(end, end + suffix.length);
    let score = exact.length;
    if (prefix && gotPrefix.endsWith(prefix)) score += prefix.length * 2;
    if (suffix && gotSuffix.startsWith(suffix)) score += suffix.length * 2;
    if (!best || score > best.score) {
      best = { start: at, end, score };
    }
    from = at + 1;
  }

  if (best) return best;

  if (exact.length >= 24) {
    const needle = exact.slice(0, 12);
    const at = haystack.indexOf(needle);
    if (at >= 0) {
      return { start: at, end: Math.min(haystack.length, at + exact.length), score: 12 };
    }
  }
  return null;
}

export function reanchorInText(haystack: string, anchor: Anchor): { start: number; end: number } | null {
  const quote = getTextQuote(anchor);
  if (!quote) return null;
  const pos = getPdfPosition(anchor);
  if (pos && pos.endOffset <= haystack.length) {
    const slice = haystack.slice(pos.startOffset, pos.endOffset);
    if (slice === quote.exact) {
      return { start: pos.startOffset, end: pos.endOffset };
    }
  }
  const fuzzy = fuzzyLocateTextQuote(haystack, quote);
  return fuzzy ? { start: fuzzy.start, end: fuzzy.end } : null;
}