import { bookCardPath, bookSlug } from "./paths";
import type { BookMeta } from "./storage";
import { isTauri } from "./runtime";

export interface ParsedBookCard {
  title: string;
  author: string;
  sha256: string;
  path: string;
  updated: string;
}

function bookExt(name: string): string {
  const m = name.toLowerCase().match(/\.(pdf|epub)$/);
  return m ? `.${m[1]}` : ".pdf";
}

function binaryStorageKey(slug: string, ext: string): string {
  return `marginalia:bookbin:${slug}${ext}`;
}

export function parseBookCardYaml(content: string): ParsedBookCard | null {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const pick = (key: string) => {
    const line = m[1].split("\n").find((l) => l.startsWith(`${key}:`));
    if (!line) return "";
    const raw = line.slice(key.length + 1).trim();
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw.replace(/^"|"$/g, "");
    }
  };
  return {
    title: pick("title"),
    author: pick("author"),
    sha256: pick("sha256"),
    path: pick("path"),
    updated: pick("updated"),
  };
}

export async function loadBookCard(libraryRoot: string, slug: string): Promise<ParsedBookCard | null> {
  const path = bookCardPath(libraryRoot, slug);
  if (isTauri()) {
    const { readTextFile, exists } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(path))) return null;
    return parseBookCardYaml(await readTextFile(path));
  }
  const text = localStorage.getItem(`marginalia:${path}`);
  return text ? parseBookCardYaml(text) : null;
}

export async function updateBookCardPath(libraryRoot: string, slug: string, newPath: string): Promise<void> {
  const card = await loadBookCard(libraryRoot, slug);
  if (!card) return;
  const now = new Date().toISOString();
  const body = `---\n\ntitle: ${JSON.stringify(card.title)}\nauthor: ${JSON.stringify(card.author)}\nsha256: ${card.sha256}\npath: ${JSON.stringify(newPath)}\nupdated: ${now}\n\n`;
  const path = bookCardPath(libraryRoot, slug);
  if (isTauri()) {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, body);
    return;
  }
  localStorage.setItem(`marginalia:${path}`, body);
}

/** Copy book bytes into knihovna/knihy/ and return stored path (absolute on desktop). */
export async function persistBookFile(
  libraryRoot: string,
  book: Pick<BookMeta, "title" | "sha256">,
  data: ArrayBuffer,
  originalName: string,
): Promise<{ slug: string; storedPath: string }> {
  const slug = bookSlug(book.title, book.sha256);
  const ext = bookExt(originalName);
  const fileName = `${slug}${ext}`;
  const storedPath = `${libraryRoot}/knihy/${fileName}`;

  if (isTauri()) {
    const { mkdir, writeFile } = await import("@tauri-apps/plugin-fs");
    await mkdir(`${libraryRoot}/knihy`, { recursive: true });
    await writeFile(storedPath, new Uint8Array(data));
    return { slug, storedPath };
  }

  const bytes = new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  localStorage.setItem(binaryStorageKey(slug, ext), btoa(binary));
  localStorage.setItem(`marginalia:bookpath:${slug}`, storedPath);
  return { slug, storedPath };
}

export async function readBookBytes(
  _libraryRoot: string,
  slug: string,
  storedPath: string,
): Promise<ArrayBuffer | null> {
  if (isTauri()) {
    const { exists, readFile } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(storedPath))) return null;
    const bytes = await readFile(storedPath);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  const ext = storedPath.match(/\.(pdf|epub)$/i)?.[0]?.toLowerCase() ?? ".pdf";
  const b64 = localStorage.getItem(binaryStorageKey(slug, ext));
  if (!b64) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}