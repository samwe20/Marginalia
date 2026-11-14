import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistBookFile, readBookBytes } from "./book-library";

describe("book-library", () => {
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
  });

  it("roundtrips book bytes in web storage", async () => {
    const data = new TextEncoder().encode("fake-pdf").buffer;
    const { slug, storedPath } = await persistBookFile(
      "/Marginalia",
      { title: "Test Book", sha256: "a".repeat(64) },
      data,
      "test.pdf",
    );
    const back = await readBookBytes("/Marginalia", slug, storedPath);
    expect(back).not.toBeNull();
    expect(new TextDecoder().decode(back!)).toBe("fake-pdf");
  });
});