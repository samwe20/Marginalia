import { isTauri } from "./runtime";

export type LibraryRootUiDeps = {
  setLibraryRoot: (path: string) => Promise<void>;
  openLibraryIndex: (path: string) => Promise<void>;
  setLibraryPath: (text: string, title?: string) => void;
  toast: (message: string, kind: "success" | "error" | "info") => void;
  renderSettings?: () => void;
  route?: string;
};

/** Create ~/Documents/Marginalia after user chooses „Vytvořit novou složku“ in setup modal. */
export async function createDocumentsMarginaliaFolder(deps: LibraryRootUiDeps): Promise<string> {
  if (!isTauri()) {
    const webRoot = "/Marginalia";
    localStorage.setItem("marginalia.libraryRoot", webRoot);
    deps.setLibraryPath("Web režim (localStorage)");
    return webRoot;
  }
  const { join, documentDir } = await import("@tauri-apps/api/path");
  const { exists, mkdir } = await import("@tauri-apps/plugin-fs");
  const root = await join(await documentDir(), "Marginalia");
  await deps.setLibraryRoot(root);
  if (!(await exists(root))) await mkdir(root, { recursive: true });
  return root;
}

export async function ensureLibrarySubdirs(libraryRoot: string): Promise<void> {
  if (!isTauri() || !libraryRoot) return;
  const { mkdir, exists } = await import("@tauri-apps/plugin-fs");
  for (const sub of ["knihy", "citace", "poznamky", "knihy/_covers"] as const) {
    const p = `${libraryRoot.replace(/[/\\]+$/, "")}/${sub}`;
    if (!(await exists(p))) await mkdir(p, { recursive: true });
  }
}

export async function resolveDefaultLibraryRootPath(): Promise<string> {
  if (!isTauri()) return "/Marginalia";
  const { join, documentDir } = await import("@tauri-apps/api/path");
  return join(await documentDir(), "Marginalia");
}