import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteIndex } from "./noteIndex";
import { rebuildMarginaliaLinkIndex } from "./marginalia-link-index";
import { disableDemoData, enableDemoData } from "./demo-data";
import { bookIndexPath } from "./marginalia-paths";

describe("marginalia link index", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
    });
    enableDemoData();
  });

  afterEach(() => {
    disableDemoData();
    vi.unstubAllGlobals();
  });

  it("registers demo books, quotes, notes and backlinks", async () => {
    const index = new NoteIndex();
    await rebuildMarginaliaLinkIndex(index, "/Marginalia");
    expect(index.getNotes().length).toBeGreaterThan(20);
    const bab = bookIndexPath("demo-babicka");
    const backlinks = index.getBacklinks(bab);
    expect(backlinks.length).toBeGreaterThan(0);
    const rows = index.exportLinkRows();
    expect(rows.some((r) => r.target_path === bab)).toBe(true);
  });
});