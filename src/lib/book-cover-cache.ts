import {
  coverCachePath,
  coverCustomPath,
  coverMetaPath,
  coversDir,
} from "./book-cover-paths";
import type { BookFileKind } from "./book-formats";
import {
  extractCoverBlobViaFoliate,
  extractCoverBytesFromEpub,
  renderPdfFirstPagePng,
} from "./cover-extract";
import { readBookBytes } from "./book-library";
import { renderTypographicCoverPng } from "./typographic-cover";
import { isTauri } from "./runtime";

export type CoverMeta = {
  sourceSha256: string;
  kind: "extracted" | "pdf-render" | "typography" | "custom";
  updated: string;
};

async function ensureCoversDir(libraryRoot: string): Promise<void> {
  const dir = coversDir(libraryRoot);
  if (isTauri()) {
    const { mkdir, exists } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  }
}

async function readMeta(libraryRoot: string, slug: string): Promise<CoverMeta | null> {
  const path = coverMetaPath(libraryRoot, slug);
  try {
    if (isTauri()) {
      const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
      if (!(await exists(path))) return null;
      return JSON.parse(await readTextFile(path)) as CoverMeta;
    }
    const raw = localStorage.getItem(`marginalia:${path}`);
    return raw ? (JSON.parse(raw) as CoverMeta) : null;
  } catch {
    return null;
  }
}

async function writeMeta(libraryRoot: string, slug: string, meta: CoverMeta): Promise<void> {
  const path = coverMetaPath(libraryRoot, slug);
  const text = JSON.stringify(meta);
  if (isTauri()) {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, text);
    return;
  }
  localStorage.setItem(`marginalia:${path}`, text);
}

async function writePng(libraryRoot: string, slug: string, blob: Blob, custom = false): Promise<void> {
  await ensureCoversDir(libraryRoot);
  const path = custom ? coverCustomPath(libraryRoot, slug) : coverCachePath(libraryRoot, slug);
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (isTauri()) {
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    await writeFile(path, buf);
    return;
  }
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]!);
  localStorage.setItem(`marginalia:coverbin:${slug}${custom ? ":custom" : ""}`, btoa(binary));
  localStorage.setItem(`marginalia:coverpath:${slug}${custom ? ":custom" : ""}`, path);
}

export async function coverFileExists(libraryRoot: string, slug: string, custom = false): Promise<boolean> {
  const path = custom ? coverCustomPath(libraryRoot, slug) : coverCachePath(libraryRoot, slug);
  if (isTauri()) {
    const { exists } = await import("@tauri-apps/plugin-fs");
    return await exists(path);
  }
  return localStorage.getItem(`marginalia:coverbin:${slug}${custom ? ":custom" : ""}`) != null;
}

async function pngPathToDataUrl(path: string): Promise<string | null> {
  try {
    if (isTauri()) {
      const { readFile, exists } = await import("@tauri-apps/plugin-fs");
      if (!(await exists(path))) return null;
      const bytes = await readFile(path);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return `data:image/png;base64,${btoa(binary)}`;
    }
  } catch {
    return null;
  }
  return null;
}

export async function coverImageUrl(libraryRoot: string, slug: string): Promise<string | null> {
  // Prefer data: URLs so covers survive route changes (asset:// can break after reader open/close).
  if (await coverFileExists(libraryRoot, slug, true)) {
    const path = coverCustomPath(libraryRoot, slug);
    if (isTauri()) {
      const data = await pngPathToDataUrl(path);
      if (data) return data;
    }
    const b64 = localStorage.getItem(`marginalia:coverbin:${slug}:custom`);
    return b64 ? `data:image/png;base64,${b64}` : null;
  }
  const meta = await readMeta(libraryRoot, slug);
  if (!meta) return null;
  if (!(await coverFileExists(libraryRoot, slug, false))) return null;
  const path = coverCachePath(libraryRoot, slug);
  if (isTauri()) {
    const data = await pngPathToDataUrl(path);
    if (data) return data;
  }
  const b64 = localStorage.getItem(`marginalia:coverbin:${slug}`);
  return b64 ? `data:image/png;base64,${b64}` : null;
}

export async function isCoverCacheValid(
  libraryRoot: string,
  slug: string,
  sourceSha256: string,
  preferCustom?: boolean,
): Promise<boolean> {
  if (preferCustom && (await coverFileExists(libraryRoot, slug, true))) return true;
  const meta = await readMeta(libraryRoot, slug);
  if (!meta || meta.sourceSha256 !== sourceSha256) return false;
  return coverFileExists(libraryRoot, slug, false);
}

async function blobToPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const img = document.createElement("img");
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("cover image load"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    const maxW = 320;
    const scale = Math.min(1, maxW / img.naturalWidth);
    canvas.width = Math.max(1, Math.floor(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.floor(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function ensureBookCoverCached(opts: {
  libraryRoot: string;
  slug: string;
  kind: BookFileKind;
  sha256: string;
  title: string;
  author: string;
  filePath: string;
  skipIfCustom?: boolean;
}): Promise<CoverMeta["kind"]> {
  if (opts.skipIfCustom && (await coverFileExists(opts.libraryRoot, opts.slug, true))) {
    await writeMeta(opts.libraryRoot, opts.slug, {
      sourceSha256: opts.sha256,
      kind: "custom",
      updated: new Date().toISOString(),
    });
    return "custom";
  }
  if (await isCoverCacheValid(opts.libraryRoot, opts.slug, opts.sha256)) {
    return (await readMeta(opts.libraryRoot, opts.slug))!.kind;
  }
  if (opts.kind === "pdf" && !isTauri()) {
    const png = await renderTypographicCoverPng({
      slug: opts.slug,
      title: opts.title,
      author: opts.author,
    });
    await writePng(opts.libraryRoot, opts.slug, png);
    await writeMeta(opts.libraryRoot, opts.slug, {
      sourceSha256: opts.sha256,
      kind: "typography",
      updated: new Date().toISOString(),
    });
    return "typography";
  }
  const bytes = await readBookBytes(opts.libraryRoot, opts.slug, opts.filePath);
  if (!bytes) {
    const png = await renderTypographicCoverPng({
      slug: opts.slug,
      title: opts.title,
      author: opts.author,
    });
    await writePng(opts.libraryRoot, opts.slug, png);
    await writeMeta(opts.libraryRoot, opts.slug, {
      sourceSha256: opts.sha256,
      kind: "typography",
      updated: new Date().toISOString(),
    });
    return "typography";
  }
  let png: Blob | null = null;
  let kind: CoverMeta["kind"] = "extracted";
  try {
    if (opts.kind === "pdf") {
      png = await renderPdfFirstPagePng(bytes);
      kind = "pdf-render";
    } else if (opts.kind === "epub") {
      const cov = await extractCoverBytesFromEpub(bytes);
      if (cov) png = await blobToPngBlob(new Blob([cov.bytes], { type: cov.mime }));
      else png = await extractCoverBlobViaFoliate(new Blob([bytes], { type: "application/epub+zip" }));
    } else {
      png = await extractCoverBlobViaFoliate(new Blob([bytes], { type: "application/x-mobipocket-ebook" }));
    }
  } catch {
    png = null;
  }
  if (!png) {
    png = await renderTypographicCoverPng({
      slug: opts.slug,
      title: opts.title,
      author: opts.author,
    });
    kind = "typography";
  } else {
    png = await blobToPngBlob(png);
  }
  await writePng(opts.libraryRoot, opts.slug, png);
  await writeMeta(opts.libraryRoot, opts.slug, {
    sourceSha256: opts.sha256,
    kind,
    updated: new Date().toISOString(),
  });
  return kind;
}

export async function setCustomBookCover(
  libraryRoot: string,
  slug: string,
  sha256: string,
  file: File,
): Promise<void> {
  let png = await blobToPngBlob(file);
  await writePng(libraryRoot, slug, png, true);
  await writeMeta(libraryRoot, slug, {
    sourceSha256: sha256,
    kind: "custom",
    updated: new Date().toISOString(),
  });
}

export async function enqueueCoverGeneration(
  libraryRoot: string,
  books: {
    slug: string;
    kind: BookFileKind;
    sha256: string;
    title: string;
    author: string;
    filePath: string;
  }[],
  onDone?: () => void,
): Promise<void> {
  for (const b of books) {
    const valid = await isCoverCacheValid(libraryRoot, b.slug, b.sha256);
    if (valid) continue;
    try {
      await ensureBookCoverCached({ libraryRoot, ...b });
    } catch (e) {
      console.warn("cover cache", b.slug, e);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
  onDone?.();
}