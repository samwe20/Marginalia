import type { LibraryBookEntry } from "./book-library";
import { isTauri } from "./runtime";

const STORE = "marginalia-prefs.json";
const KEY_LIBRARY = "libraryRoot";
const KEY_RECENT = "recentBooks";
const KEY_DEMO = "demoEnabled";
const KEY_READER_FLOW = "readerFlow";

let storePromise: ReturnType<typeof loadStore> | null = null;

async function loadStore() {
  const { load } = await import("@tauri-apps/plugin-store");
  return load(STORE, { autoSave: true, defaults: {} });
}

async function store() {
  storePromise ??= loadStore();
  return storePromise;
}

export async function loadDesktopLibraryRoot(): Promise<string> {
  if (!isTauri()) return "";
  try {
    const s = await store();
    const v = await s.get<string>(KEY_LIBRARY);
    return v ?? "";
  } catch {
    return "";
  }
}

export async function saveDesktopLibraryRoot(libraryRoot: string): Promise<void> {
  if (!isTauri() || !libraryRoot) return;
  const s = await store();
  await s.set(KEY_LIBRARY, libraryRoot);
  await s.save();
}

export async function loadDesktopRecentBooks(): Promise<LibraryBookEntry[]> {
  if (!isTauri()) return [];
  try {
    const s = await store();
    const v = await s.get<LibraryBookEntry[]>(KEY_RECENT);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function saveDesktopRecentBooks(books: LibraryBookEntry[]): Promise<void> {
  if (!isTauri()) return;
  const s = await store();
  await s.set(KEY_RECENT, books.slice(0, 24));
  await s.save();
}

export async function loadDesktopDemoEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const s = await store();
    return (await s.get<boolean>(KEY_DEMO)) === true;
  } catch {
    return false;
  }
}

export async function saveDesktopDemoEnabled(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  const s = await store();
  await s.set(KEY_DEMO, enabled);
  await s.save();
}

export async function loadDesktopReaderFlow(): Promise<"paginated" | "scrolled" | null> {
  if (!isTauri()) return null;
  try {
    const s = await store();
    const value = await s.get<string>(KEY_READER_FLOW);
    return value === "paginated" || value === "scrolled" ? value : null;
  } catch {
    return null;
  }
}

export async function saveDesktopReaderFlow(flow: "paginated" | "scrolled"): Promise<void> {
  if (!isTauri()) return;
  const s = await store();
  await s.set(KEY_READER_FLOW, flow);
  await s.save();
}