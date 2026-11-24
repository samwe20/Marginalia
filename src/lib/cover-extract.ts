import JSZip from "jszip";

export async function extractCoverBytesFromEpub(buffer: ArrayBuffer): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const zip = await JSZip.loadAsync(buffer);
  const container = await zip.file("META-INF/container.xml")?.async("string");
  if (!container) return null;
  const opfPath = container.match(/full-path\s*=\s*"([^"]+)"/i)?.[1];
  if (!opfPath) return null;
  const opf = await zip.file(opfPath)?.async("string");
  if (!opf) return null;
  const manifestItems = [...opf.matchAll(/<item\s+([^>]+)\/?>/gi)].map((m) => m[1]!);
  const hrefById = new Map<string, { href: string; mime: string }>();
  for (const attrs of manifestItems) {
    const id = attrs.match(/\bid\s*=\s*"([^"]+)"/i)?.[1];
    const href = attrs.match(/\bhref\s*=\s*"([^"]+)"/i)?.[1];
    const mime = attrs.match(/media-type\s*=\s*"([^"]+)"/i)?.[1] ?? "image/jpeg";
    if (id && href) hrefById.set(id, { href, mime });
  }
  const opfDir = opfPath.includes("/") ? opfPath.replace(/\/[^/]+$/, "/") : "";
  const resolveHref = (href: string) => {
    const parts = (opfDir + href).split("/");
    const stack: string[] = [];
    for (const p of parts) {
      if (p === "..") stack.pop();
      else if (p && p !== ".") stack.push(p);
    }
    return stack.join("/");
  };
  let coverHref: string | undefined;
  const coverMeta = opf.match(/<meta\s+[^>]*name\s*=\s*"cover"[^>]*content\s*=\s*"([^"]+)"/i);
  if (coverMeta?.[1] && hrefById.has(coverMeta[1])) coverHref = hrefById.get(coverMeta[1])!.href;
  if (!coverHref) {
    const props = opf.match(/<item\s+[^>]*properties\s*=\s*"[^"]*cover-image[^"]*"[^>]*href\s*=\s*"([^"]+)"/i);
    if (props?.[1]) coverHref = props[1];
  }
  if (!coverHref) {
    const guess = [...hrefById.values()].find((v) => /cover|titlepage/i.test(v.href));
    coverHref = guess?.href;
  }
  if (!coverHref) return null;
  const path = resolveHref(coverHref);
  const file = zip.file(path) ?? zip.file(coverHref);
  if (!file) return null;
  const bytes = await file.async("uint8array");
  const mime = hrefById.get(coverMeta?.[1] ?? "")?.mime ?? "image/jpeg";
  return { bytes, mime };
}

export async function extractCoverBlobViaFoliate(file: Blob): Promise<Blob | null> {
  try {
    const { makeBook } = await import("foliate-js/view.js");
    const book = await makeBook(file);
    const epic = book as { getCover?: () => Promise<Blob | null>; destroy?: () => void };
    if (typeof epic.getCover !== "function") return null;
    const blob = await epic.getCover();
    epic.destroy?.();
    return blob;
  } catch {
    return null;
  }
}

export async function renderPdfFirstPagePng(data: ArrayBuffer, scale = 0.35): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  const pdfWorker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
  const task = pdfjs.getDocument({ data: data.slice(0), useSystemFonts: true });
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  await page.render({ canvasContext: ctx, viewport }).promise;
  await pdf.destroy();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}