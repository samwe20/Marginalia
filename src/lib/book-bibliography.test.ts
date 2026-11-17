import { describe, expect, it } from "vitest";
import { migrateBibliographyFromCard, parseLegacyAuthor, formatAuthorsDisplay } from "./book-bibliography";

describe("book-bibliography", () => {
  it("migrates legacy author string", () => {
    const bib = migrateBibliographyFromCard("Dílo", "Karel Čapek", null);
    expect(bib.title).toBe("Dílo");
    expect(formatAuthorsDisplay(bib.authors)).toContain("Čapek");
  });

  it("parses comma-separated author", () => {
    const [a] = parseLegacyAuthor("Novák, Jan");
    expect(a.family).toBe("Novák");
    expect(a.given).toBe("Jan");
  });
});