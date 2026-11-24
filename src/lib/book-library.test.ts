import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeLibraryEntries, parseBookCardYaml, persistBookFile, readBookBytes } from "./book-library";

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

  it("parses book card without closing --- fence", () => {
    const card = parseBookCardYaml(
      '---\n\ntitle: "Fixture"\nauthor: "Smoke Autor"\nsha256: abc\npath: "C:\\\\lib\\\\sample.pdf"\nupdated: 2026-01-01\n\n',
    );
    expect(card?.author).toBe("Smoke Autor");
    expect(card?.path).toContain("sample.pdf");
  });

  it("merges disk library cards with recent order", () => {
    const disk = [
      {
        slug: "sample-aa12",
        kind: "pdf" as const,
        title: "sample",
        author: "",
        sha256: "a".repeat(64),
        filePath: "/lib/knihy/sample-aa12.pdf",
        updated: "2026-01-02T00:00:00.000Z",
      },
    ];
    const recent = [
      {
        slug: "sample-aa12",
        kind: "pdf" as const,
        title: "sample",
        author: "",
        sha256: "a".repeat(64),
        filePath: "/lib/knihy/sample-aa12.pdf",
        updated: "",
      },
    ];
    const merged = mergeLibraryEntries(recent, disk);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.filePath).toContain("sample-aa12.pdf");
  });

  it("dedupes same content hash under different title-derived slugs", () => {
    const sha = "b".repeat(64);
    const disk = [
      {
        slug: "old-filename-bbbbbbbb",
        kind: "pdf" as const,
        title: "old-filename",
        author: "",
        sha256: sha,
        filePath: "/lib/knihy/old.pdf",
        updated: "2026-01-01T00:00:00.000Z",
      },
      {
        slug: "thus-spoke-zarathustra-bbbbbbbb",
        kind: "pdf" as const,
        title: "Thus spoke Zarathustra",
        author: "Nietzsche",
        sha256: sha,
        filePath: "/lib/knihy/old.pdf",
        updated: "2026-01-03T00:00:00.000Z",
      },
    ];
    const merged = mergeLibraryEntries([], disk);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.sha256).toBe(sha);
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