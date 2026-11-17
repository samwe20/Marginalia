type FoliateLike = HTMLElement & {
  renderer?: { getContents?: () => { index: number; doc: Document }[] };
};

/** Foliate chapter documents (renderer API + iframe / shadow DOM). */
export function collectFoliateContentDocuments(
  view: FoliateLike | null,
  container: HTMLElement,
): Document[] {
  const seen = new Set<Document>();
  const docs: Document[] = [];
  const add = (doc: Document | null | undefined) => {
    if (doc && !seen.has(doc)) {
      seen.add(doc);
      docs.push(doc);
    }
  };
  for (const { doc } of view?.renderer?.getContents?.() ?? []) {
    add(doc);
  }
  const stack: (Node | null | undefined)[] = [view, container];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node instanceof HTMLIFrameElement) {
      add(node.contentDocument);
    }
    if (node instanceof ShadowRoot) {
      for (const child of node.childNodes) stack.push(child);
      continue;
    }
    if (node instanceof HTMLElement) {
      if (node.shadowRoot) stack.push(node.shadowRoot);
      for (const iframe of node.querySelectorAll("iframe")) stack.push(iframe);
      for (const child of node.children) stack.push(child);
    }
    if (node instanceof Document) {
      add(node);
      add(node.defaultView?.document);
    }
  }
  return docs;
}

/** Length of visible text inside foliate iframes only (not plain-text fallback). */
export function iframeVisibleTextLength(docs: Document[]): number {
  let best = 0;
  for (const doc of docs) {
    const len = doc.body?.textContent?.trim().length ?? 0;
    if (len > best) best = len;
  }
  return best;
}

export function rectInTopViewport(doc: Document, local: DOMRect): DOMRect {
  let left = local.left;
  let top = local.top;
  let current: Document | null = doc;
  while (current?.defaultView?.frameElement instanceof HTMLIFrameElement) {
    const frame = current.defaultView.frameElement as HTMLIFrameElement;
    const fr = frame.getBoundingClientRect();
    left += fr.left;
    top += fr.top;
    current = frame.ownerDocument;
  }
  return new DOMRect(left, top, local.width, local.height);
}

export function findFallbackPointerRect(
  container: HTMLElement,
): { x: number; y: number; x2: number; y2: number } | null {
  const el = container.querySelector(".epub-fallback-text");
  if (!(el instanceof HTMLElement)) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 4) return null;
  return {
    x: Math.floor(r.left + 6),
    y: Math.floor(r.top + r.height / 2),
    x2: Math.floor(r.right - 6),
    y2: Math.floor(r.top + r.height / 2),
  };
}

export function findIframePointerRect(
  docs: Document[],
  pickText?: (plain: string) => boolean,
): { x: number; y: number; x2: number; y2: number } | null {
  const accept = pickText ?? ((plain: string) => plain.replace(/\s+/g, " ").trim().length >= 8);
  for (const doc of docs) {
    const body = doc.body;
    if (!body) continue;
    const hit = findFirstTextNode(body);
    if (!hit) continue;
    const plain = (hit.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!accept(plain)) continue;
    const range = doc.createRange();
    range.selectNodeContents(hit);
    const local =
      range.getClientRects()[0] ??
      hit.parentElement?.getBoundingClientRect() ??
      new DOMRect(0, 0, 0, 0);
    if (local.width < 4 || local.height < 4) continue;
    const viewport = rectInTopViewport(doc, local);
    if (viewport.width < 4 || viewport.height < 4) continue;
    return {
      x: Math.floor(viewport.left + 6),
      y: Math.floor(viewport.top + viewport.height / 2),
      x2: Math.floor(viewport.right - 6),
      y2: Math.floor(viewport.top + viewport.height / 2),
    };
  }
  return null;
}

// nodeType checks, not instanceof: iframe documents belong to another JS realm.
function parentAcrossBoundaries(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && "host" in root) return (root as ShadowRoot).host;
  if (root.nodeType === Node.DOCUMENT_NODE) return (root as Document).defaultView?.frameElement ?? null;
  return null;
}

function intersect(a: DOMRect, b: DOMRect): DOMRect {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

/**
 * Area of the top-level viewport in which `el` can actually paint: every ancestor with
 * non-visible overflow clips it (including hosts inside closed shadow roots and frames).
 */
export function visibleClipRect(el: Element): DOMRect {
  const topWin = window.top ?? window;
  let clip = new DOMRect(0, 0, topWin.innerWidth, topWin.innerHeight);
  let node: Element | null = el;
  while (node) {
    const doc = node.ownerDocument;
    const style = doc.defaultView?.getComputedStyle(node);
    // Root/body overflow applies to the viewport (clipped by the frame element), not their own box:
    // paginated columns lie outside the <html> box.
    const propagatesToViewport = node === doc.documentElement || node === doc.body;
    if (style && !propagatesToViewport && (style.overflowX !== "visible" || style.overflowY !== "visible")) {
      clip = intersect(clip, rectInTopViewport(doc, node.getBoundingClientRect()));
    }
    if (style && (style.display === "none" || style.visibility === "hidden")) {
      return new DOMRect(0, 0, 0, 0);
    }
    node = parentAcrossBoundaries(node);
  }
  return clip;
}

/**
 * Characters of text under `root` whose rendered boxes intersect the visible viewport
 * (what the reader can see), not merely present in the DOM.
 */
export function visibleTextLengthIn(root: Element, cap = 4000): number {
  const doc = root.ownerDocument;
  const clip = visibleClipRect(root);
  if (clip.width < 2 || clip.height < 2) return 0;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let total = 0;
  let visited = 0;
  let node = walker.nextNode() as Text | null;
  while (node && visited < 20_000 && total < cap) {
    visited += 1;
    const len = node.textContent?.trim().length ?? 0;
    if (len > 0) {
      range.selectNodeContents(node);
      for (const local of range.getClientRects()) {
        const r = intersect(rectInTopViewport(doc, local), clip);
        if (r.width >= 2 && r.height >= 2) {
          total += len;
          break;
        }
      }
    }
    node = walker.nextNode() as Text | null;
  }
  return total;
}

/**
 * Fraction (0–1) of the visible reading area's width spanned by visible text. A low value means
 * an empty strip, e.g. a two-page spread with one page blank or a column narrower than the pane.
 */
export function visibleTextWidthRatio(docs: Document[]): number {
  let best = 0;
  for (const doc of docs) {
    if (!doc.body) continue;
    const clip = visibleClipRect(doc.body);
    if (clip.width < 2 || clip.height < 2) continue;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const range = doc.createRange();
    let left = Infinity;
    let right = -Infinity;
    let visited = 0;
    let node = walker.nextNode() as Text | null;
    while (node && visited < 20_000) {
      visited += 1;
      if ((node.textContent?.trim().length ?? 0) > 0) {
        range.selectNodeContents(node);
        for (const local of range.getClientRects()) {
          const r = intersect(rectInTopViewport(doc, local), clip);
          if (r.width >= 2 && r.height >= 2) {
            left = Math.min(left, r.left);
            right = Math.max(right, r.right);
          }
        }
      }
      node = walker.nextNode() as Text | null;
    }
    if (right > left) best = Math.max(best, (right - left) / clip.width);
  }
  return best;
}

export function viewportVisibleTextLength(docs: Document[]): number {
  let best = 0;
  for (const doc of docs) {
    if (!doc.body) continue;
    best = Math.max(best, visibleTextLengthIn(doc.body));
  }
  return best;
}

function findFirstTextNode(root: Node): Text | null {
  const walker = (root.ownerDocument ?? document).createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (node.textContent?.trim()) return node;
    node = walker.nextNode() as Text | null;
  }
  if (root instanceof HTMLElement) {
    for (const iframe of root.querySelectorAll("iframe")) {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          const nested = findFirstTextNode(doc.body);
          if (nested) return nested;
        }
      } catch {
        /* cross-origin */
      }
    }
  }
  return null;
}