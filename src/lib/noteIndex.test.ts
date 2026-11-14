import { describe, expect, it } from "vitest";
import { NoteIndex, parseWikiTargets, stripCodeForLinks } from "./noteIndex";

describe("Folio noteIndex (ported)", () => {
  it("ignores wikilinks inside code fences", () => {
    const text = "[[real]]\n\n~~~md\n[[example]]\n~~~\n\n`[[inline]]`\n\n```\n[[unfinished]]";
    expect(parseWikiTargets(stripCodeForLinks(text)).map((l) => l.title)).toEqual(["real"]);
  });

  it("tracks backlinks between entries", () => {
    const index = new NoteIndex();
    index.setNotes([
      {
        id: "a",
        title: "A",
        path: "poznamky/a.md",
        relativePath: "poznamky/a.md",
        mtime: 0,
        createdAt: null,
        kind: "note",
      },
      {
        id: "b",
        title: "Babička",
        path: "knihy/b.md",
        relativePath: "knihy/b.md",
        mtime: 0,
        createdAt: null,
        kind: "book",
      },
    ]);
    index.setContent("poznamky/a.md", "Odkaz na [[Babička]] v textu.");
    expect(index.getBacklinks("knihy/b.md")).toHaveLength(1);
    expect(index.getBacklinks("knihy/b.md")[0].title).toBe("A");
  });
});