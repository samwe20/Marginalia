/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNote, DEFAULT_NOTE_TITLE, listNotes, renameNote, safeNoteTitle, saveNote } from "./notes";

describe("notes (Folio naming)", () => {
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

  it("safeNoteTitle strips characters Windows forbids and reserved names", () => {
    expect(safeNoteTitle('  a<b>:c"/d\\e|f?g*  ')).toBe("abcdefg");
    expect(safeNoteTitle("Čtení.  ")).toBe("Čtení");
    expect(safeNoteTitle("CON")).toBe("_CON");
    expect(safeNoteTitle("   ")).toBe(DEFAULT_NOTE_TITLE);
  });

  it("repeated new notes never share a file", async () => {
    const a = await createNote("/lib", DEFAULT_NOTE_TITLE);
    const b = await createNote("/lib", DEFAULT_NOTE_TITLE);
    const c = await createNote("/lib", DEFAULT_NOTE_TITLE);
    expect([a.filename, b.filename, c.filename]).toEqual(["Bez názvu.md", "Bez názvu 2.md", "Bez názvu 3.md"]);
    a.body = "první";
    await saveNote("/lib", a);
    const all = await listNotes("/lib");
    expect(all).toHaveLength(3);
    expect(all.find((n) => n.id === a.id)?.body).toBe("první");
    expect(all.find((n) => n.id === b.id)?.body).toBe("# Bez názvu 2\n\n");
  });

  it("rename moves to the new title and avoids taken names", async () => {
    const a = await createNote("/lib", "Alfa");
    const b = await createNote("/lib", "Beta");
    const renamed = await renameNote("/lib", b, "Alfa");
    expect(renamed.filename).toBe("Alfa 2.md");
    expect(renamed.title).toBe("Alfa 2");
    const same = await renameNote("/lib", a, "Alfa");
    expect(same.filename).toBe("Alfa.md");
    const all = await listNotes("/lib");
    expect(all.map((n) => n.filename).sort()).toEqual(["Alfa 2.md", "Alfa.md"]);
  });
});
