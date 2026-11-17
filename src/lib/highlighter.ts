/** Pointer-driven text highlighting (pen and mouse). */

export type HighlightMode = "off" | "highlight";

export interface PointerStroke {
  pointerType: string;
}

export type HighlightHandle = {
  detach: () => void;
  /** Uloží označený text (volat po klávese H). */
  commitPending: () => boolean;
  clearPending: () => void;
  hasPending: () => boolean;
};

/** Map viewport (top-level) coordinates to a caret range, including foliate iframe pages. */
export function caretRangeFromViewportPoint(x: number, y: number): Range | null {
  const direct = document.caretRangeFromPoint?.(x, y);
  if (direct) return direct;
  const el = document.elementFromPoint(x, y);
  if (!(el instanceof HTMLIFrameElement)) return null;
  const frame = el.getBoundingClientRect();
  const doc = el.contentDocument;
  if (!doc) return null;
  const innerX = x - frame.left - el.clientLeft;
  const innerY = y - frame.top - el.clientTop;
  return doc.caretRangeFromPoint?.(innerX, innerY) ?? null;
}

export function attachHighlighter(
  root: HTMLElement,
  getRangeFromPoint: (x: number, y: number) => Range | null,
  onComplete: (range: Range, stroke: PointerStroke) => void,
  mode: () => HighlightMode,
  onSelectionPending?: () => void,
): HighlightHandle {
  let anchorRange: Range | null = null;
  let activePointer: number | null = null;
  let pendingRange: Range | null = null;

  const clearPending = () => {
    pendingRange = null;
    const sel = window.getSelection();
    sel?.removeAllRanges();
  };

  const commitPending = (): boolean => {
    if (mode() !== "highlight") return false;
    const range = pendingRange;
    if (!range || range.collapsed) return false;
    onComplete(range, { pointerType: "keyboard" });
    pendingRange = null;
    window.getSelection()?.removeAllRanges();
    return true;
  };

  const onPointerDown = (ev: PointerEvent) => {
    if (mode() !== "highlight") return;
    if (ev.button !== 0) return;
    pendingRange = null;
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
    const range = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    if (range && !range.collapsed) {
      pendingRange = range;
      onSelectionPending?.();
    } else {
      clearPending();
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

  const detach = () => {
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerup", onPointerUp);
    root.removeEventListener("pointercancel", onPointerUp);
    clearPending();
  };

  return {
    detach,
    commitPending,
    clearPending,
    hasPending: () => Boolean(pendingRange && !pendingRange.collapsed),
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