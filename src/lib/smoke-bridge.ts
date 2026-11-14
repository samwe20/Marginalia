import { isTauri } from "./runtime";

export type SmokeOpenHandler = (libraryRoot: string, filePath: string) => Promise<void>;

type SmokeFixtures = {
  library_root: string | null;
  pdf_path: string | null;
  epub_path: string | null;
};

export async function wireSmokeAutomation(onOpen: SmokeOpenHandler): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const enabled = (await invoke("smoke_is_enabled")) as boolean;
  if (!enabled) return;
  const fixtures = (await invoke("smoke_fixture_paths")) as SmokeFixtures;
  const { listen } = await import("@tauri-apps/api/event");
  await listen<{ library_root: string; file_path: string }>("marginalia-smoke-open", (ev) => {
    void onOpen(ev.payload.library_root, ev.payload.file_path);
  });
  const openFixture = (filePath: string | null | undefined) => {
    if (!filePath || !fixtures.library_root) return;
    void onOpen(fixtures.library_root, filePath);
  };
  window.addEventListener("keydown", (ev) => {
    if (ev.ctrlKey && ev.key.toLowerCase() === "o") {
      ev.preventDefault();
      openFixture(fixtures.pdf_path);
    }
  });
}