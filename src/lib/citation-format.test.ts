import { describe, expect, it } from "vitest";
import type { BookBibliography } from "./book-bibliography";
import {
  formatInformalCitation,
  formatIso690Citation,
} from "./citation-format";

const sampleBib = (): BookBibliography => ({
  authors: [
    { given: "Karel", family: "Čapek" },
    { given: "Alois", family: "Jirásek" },
  ],
  title: "Tlustý byl",
  subtitle: "Podtitul díla",
  year: "1925",
  publisher: "Československý spisovatel",
  place: "Praha",
  edition: "",
  isbn: "",
  translator: "",
  editor: "",
  language: "cs",
});

describe("citation-format", () => {
  it("formats informal citation with multiple authors and page", () => {
    const out = formatInformalCitation({
      quoteText: "Svět je krásný",
      pageLabel: "42",
      bibliography: sampleBib(),
    });
    expect(out).toContain("„Svět je krásný.“");
    expect(out).toContain("Čapek");
    expect(out).toContain("Jirásek");
    expect(out).toContain("(1925)");
    expect(out).toContain("s. 42");
    expect(out).not.toMatch(/undefined/);
  });

  it("omits missing fields in informal format", () => {
    const out = formatInformalCitation({
      quoteText: "Jen citát",
      pageLabel: "",
      bibliography: {
        ...sampleBib(),
        year: "",
        authors: [{ given: "", family: "Novák" }],
      },
    });
    expect(out).not.toMatch(/undefined/);
    expect(out).not.toMatch(/,,/);
    expect(out).toContain("Novák");
  });

  it("formats ISO 690 with diacritics", () => {
    const out = formatIso690Citation({
      quoteText: "Úryvek",
      pageLabel: "str. 7",
      bibliography: {
        ...sampleBib(),
        authors: [{ given: "Božena", family: "Němcová" }],
        year: "1853",
        title: "Babička",
        publisher: "A. Borovy",
        place: "Praha",
      },
    });
    expect(out).toContain("NĚMCOVÁ");
    expect(out).toContain("B.");
    expect(out).toContain("Babička");
    expect(out).toContain("1853");
    expect(out).not.toMatch(/undefined/);
  });
});