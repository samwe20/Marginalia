/** Pointer-driven text highlighting (pen and mouse). */

export type HighlightMode = "off" | "highlight";

export interface PointerStroke {
  pointerType: string;
}

export function attachHighlighter(
  root: HTMLElement,
  getRangeFromPoint: (x: number, y: number) => Range | null,
  onComplete: (range: Range, stroke: PointerStroke) => void,
  mode: () => HighlightMode,
): () => void {
  let anchorRange: Range | null = null;
  let activePointer: number | null = null;

  const onPointerDown = (ev: PointerEvent) => {
    if (mode() !== "highlight") return;
    if (ev.button !== 0) return;
    const range = getRangeFromPoint(ev.clientX, ev.clientY);
    if (!range) return;
    activePointer = ev.pointerId;
    anchorRange = range.cloneRange();
    root.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (activePointer !== ev.pointerId || !anchorRange) return;
    const head = getRangeFromPoint(ev.clientX, ev.clientY);
    if (!head) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    const forward =
      anchorRange.compareBoundaryPoints(Range.START_TO_START, head) <= 0;
    if (forward) {
      range.setStart(anchorRange.startContainer, anchorRange.startOffset);
      range.setEnd(head.endContainer, head.endOffset);
    } else {
      range.setStart(head.startContainer, head.startOffset);
      range.setEnd(anchorRange.endContainer, anchorRange.endOffset);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const onPointerUp = (ev: PointerEvent) => {
    if (activePointer !== ev.pointerId) return;
    const sel = window.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    if (range && !range.collapsed) {
      onComplete(range, { pointerType: ev.pointerType });
    }
    activePointer = null;
    anchorRange = null;
    try {
      root.releasePointerCapture(ev.pointerId);
    } catch {
      /* released */
    }
  };

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerUp);

  return () => {
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerup", onPointerUp);
    root.removeEventListener("pointercancel", onPointerUp);
  };
}

export function rangeToOffsets(
  root: HTMLElement,
  range: Range,
): { start: number; end: number; text: string } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let start = -1;
  let end = -1;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.length;
    if (node === range.startContainer) start = offset + range.startOffset;
    if (node === range.endContainer) end = offset + range.endOffset;
    offset += len;
  }
  if (start < 0 || end < 0) {
    const text = range.toString();
    const full = root.textContent ?? "";
    const at = full.indexOf(text);
    start = at;
    end = at + text.length;
  }
  const text = (root.textContent ?? "").slice(start, end);
  return { start, end, text };
}