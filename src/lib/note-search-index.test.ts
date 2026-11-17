import { describe, expect, it } from "vitest";
import { searchNotesLocal, snippetForNote } from "./note-search-index";
import type { LibraryNote } from "./notes";

const sample: LibraryNote = {
  id: "n1",
  title: "Čtenářský deník",
  filename: "denik.md",
  body: "Poznámka o ironii ve Folio stylu.",
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-02T00:00:00.000Z",
};

describe("note-search-index", () => {
  it("finds notes by title or body", () => {
    expect(searchNotesLocal([sample], "ironii")).toHaveLength(1);
    expect(searchNotesLocal([sample], "Folio")).toHaveLength(1);
    expect(searchNotesLocal([sample], "xyz")).toHaveLength(0);
  });

  it("builds snippet around match", () => {
    const s = snippetForNote(sample, "ironii");
    expect(s.toLowerCase()).toContain("ironii");
  });
});