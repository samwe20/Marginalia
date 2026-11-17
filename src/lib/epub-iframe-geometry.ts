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