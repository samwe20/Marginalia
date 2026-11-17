/** Normalize selected text so quotes keep line breaks / spaces and land on word edges. */

export function selectionTextFromRange(range: Range, root?: HTMLElement): string {
  // Prefer Selection API string — it usually inserts newlines at block boundaries.
  let raw = range.toString();
  if (!raw.trim() && root) {
    raw = (root.ownerDocument?.defaultView?.getSelection()?.toString() ?? "") || raw;
  }
  // PDF.js text layers often omit spaces between span siblings in toString().
  if (root && looksGlued(raw)) {
    raw = reconstructWithGaps(range, root) || raw;
  }
  return normalizeQuoteText(raw);
}

function looksGlued(s: string): boolean {
  return /[a-zA-Zá-žÁ-Ž][A-ZÁ-Ž]/.test(s) || /[.?!,;:][A-Za-zá-žÁ-Ž]/.test(s);
}

function reconstructWithGaps(range: Range, root: HTMLElement): string {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let prevBottom: number | null = null;
  let started = false;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!nodeLengthInRange(range, node)) continue;
    const slice = textSliceInRange(range, node);
    if (!slice) continue;
    let rectBottom: number | null = null;
    try {
      const r = doc.createRange();
      r.selectNodeContents(node);
      const rects = r.getClientRects();
      if (rects.length) rectBottom = rects[rects.length - 1]!.bottom;
    } catch {
      /* */
    }
    if (started) {
      if (prevBottom != null && rectBottom != null && rectBottom - prevBottom > 4) parts.push("\n");
      else if (!/\s$/.test(parts[parts.length - 1] ?? "") && !/^\s/.test(slice)) parts.push(" ");
    }
    parts.push(slice);
    started = true;
    if (rectBottom != null) prevBottom = rectBottom;
  }
  return parts.join("");
}

function nodeLengthInRange(range: Range, node: Text): boolean {
  try {
    const r = node.ownerDocument!.createRange();
    r.selectNodeContents(node);
    return (
      range.compareBoundaryPoints(Range.END_TO_START, r) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, r) > 0
    );
  } catch {
    return false;
  }
}

function textSliceInRange(range: Range, node: Text): string {
  const full = node.data;
  let start = 0;
  let end = full.length;
  if (node === range.startContainer) start = range.startOffset;
  if (node === range.endContainer) end = range.endOffset;
  if (start >= end) {
    // Partial overlap via compare — take intersection when node is fully inside.
    try {
      if (
        range.comparePoint(node, 0) <= 0 &&
        range.comparePoint(node, full.length) >= 0
      ) {
        return full;
      }
    } catch {
      return "";
    }
    return "";
  }
  return full.slice(start, end);
}

export function normalizeQuoteText(raw: string): string {
  let s = raw.replace(/\r\n?/g, "\n");
  // Collapse runs of spaces/tabs but keep newlines.
  s = s
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trimEnd())
    .join("\n");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

/** Expand offsets in `full` so start/end sit on word boundaries when possible. */
export function snapOffsetsToWordBounds(
  full: string,
  start: number,
  end: number,
): { start: number; end: number } {
  let s = Math.max(0, Math.min(start, full.length));
  let e = Math.max(s, Math.min(end, full.length));
  const isWord = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);
  while (s > 0 && isWord(full[s]!) && isWord(full[s - 1]!)) s -= 1;
  while (e < full.length && isWord(full[e - 1]!) && isWord(full[e]!)) e += 1;
  return { start: s, end: e };
}
