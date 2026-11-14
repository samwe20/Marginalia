import { isTauri } from "./runtime";

const BOOK_FILTERS = [{ name: "Knihy", extensions: ["pdf", "epub"] as string[] }];

function mimeForName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".epub")) return "application/epub+zip";
  return "application/octet-stream";
}

/** Desktop: native file picker; web: returns null (use hidden `<input type="file">`). */
export async function pickBookFileViaDialog(): Promise<File | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
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
  return new File([buffer], name, { type: mimeForName(name) });
}

export function triggerWebFilePicker(input: HTMLInputElement): void {
  input.click();
}