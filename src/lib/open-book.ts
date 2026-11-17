import { DIALOG_BOOK_EXTENSIONS, mimeForBookFileName } from "./book-formats";
import { isTauri } from "./runtime";

let dialogOpenReachable = false;

/** Set when smoke/code path reaches `dialog.open` import (native picker not shown). */
export function markDialogOpenReachable(): void {
  dialogOpenReachable = true;
}

export function wasDialogOpenReachable(): boolean {
  return dialogOpenReachable;
}

export async function smokeVerifyDialogPlugin(): Promise<{ ok: boolean; detail: string }> {
  if (!isTauri()) return { ok: false, detail: "not tauri" };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const smokeOn = (await invoke("smoke_is_enabled")) as boolean;
    if (!smokeOn) return { ok: false, detail: "smoke disabled" };
    const capable = (await invoke("smoke_dialog_capable")) as boolean;
    const { open } = await import("@tauri-apps/plugin-dialog");
    if (typeof open !== "function") return { ok: false, detail: "dialog.open missing" };
    markDialogOpenReachable();
    return {
      ok: capable,
      detail: capable ? "dialog:allow-open + plugin load OK" : "capability missing",
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

const BOOK_FILTERS = [
  { name: "Knihy", extensions: [...DIALOG_BOOK_EXTENSIONS] as string[] },
];

/** Desktop: native file picker; web: returns null (use hidden `<input type="file">`). */
export async function pickBookFileViaDialog(): Promise<File | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  markDialogOpenReachable();
  const selected = await open({
    multiple: false,
    directory: false,
    filters: BOOK_FILTERS,
    title: "Otevřít knihu",
  });
  if (selected == null) return null;
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return null;
  const name = path.replace(/^.*[/\\]/, "");
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const bytes = await readFile(path);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new File([buffer], name, { type: mimeForBookFileName(name) });
}

export function triggerWebFilePicker(input: HTMLInputElement): void {
  input.click();
}