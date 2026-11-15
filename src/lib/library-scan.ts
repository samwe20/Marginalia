import { isTauri } from "./runtime";

/** App metadata dirs — not scanned for source book files. */
const SKIP_DIR_NAMES = new Set(["citace", "poznamky"]);

function pathSep(root: string): string {
  return root.includes("\\") ? "\\" : "/";
}

function joinPath(dir: string, name: string): string {
  const sep = pathSep(dir);
  const base = dir.replace(/[/\\]+$/, "");
  return `${base}${sep}${name}`;
}

/** Recursively find PDF/EPUB under the library root (user book files). */
export async function findBookFilesOnDisk(libraryRoot: string): Promise<string[]> {
  if (!libraryRoot || !isTauri()) return [];
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const found: string[] = [];

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 10) return;
    const leaf = dir.replace(/[/\\]+$/, "").split(/[/\\]/).pop()?.toLowerCase() ?? "";
    if (depth > 0 && SKIP_DIR_NAMES.has(leaf)) return;
    let entries;
    try {
      entries = await readDir(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const name = e.name ?? "";
      if (!name) continue;
      const full = joinPath(dir, name);
      if (e.isDirectory) await walk(full, depth + 1);
      else if (e.isFile && /\.(pdf|epub)$/i.test(name)) found.push(full);
    }
  };

  await walk(libraryRoot.replace(/[/\\]+$/, ""), 0);
  found.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return found;
}

export function isPathInsideLibrary(libraryRoot: string, filePath: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
  const root = norm(libraryRoot);
  const file = norm(filePath);
  return file === root || file.startsWith(`${root}/`);
}