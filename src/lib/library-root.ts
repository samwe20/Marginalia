import { isTauri } from "./runtime";

export type LibraryRootUiDeps = {
  setLibraryRoot: (path: string) => Promise<void>;
  openLibraryIndex: (path: string) => Promise<void>;
  setLibraryPath: (text: string, title?: string) => void;
  toast: (message: string, kind: "success" | "error" | "info") => void;
  renderSettings?: () => void;
  route?: string;
};

/** First-run default: Documents/Marginalia (no interrupting folder dialog). */
export async function ensureDefaultLibraryRoot(deps: LibraryRootUiDeps): Promise<string> {
  if (isTauri()) {
    const { join, documentDir } = await import("@tauri-apps/api/path");
    const { exists, mkdir } = await import("@tauri-apps/plugin-fs");
    const root = await join(await documentDir(), "Marginalia");
    if (!(await exists(root))) await mkdir(root, { recursive: true });
    await deps.setLibraryRoot(root);
    await deps.openLibraryIndex(root);
    deps.setLibraryPath(root, root);
    deps.toast("Výchozí knihovna v Dokumentech (změníte v Nastavení)", "info");
    if (deps.route === "settings" && deps.renderSettings) deps.renderSettings();
    return root;
  }
  const webRoot = "/Marginalia";
  localStorage.setItem("marginalia.libraryRoot", webRoot);
  deps.setLibraryPath("Web režim (localStorage)");
  return webRoot;
}

export async function resolveDefaultLibraryRootPath(): Promise<string> {
  if (!isTauri()) return "/Marginalia";
  const { join, documentDir } = await import("@tauri-apps/api/path");
  return join(await documentDir(), "Marginalia");
}