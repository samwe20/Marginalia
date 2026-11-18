import { describe, expect, it } from "vitest";
import { initialsForCover, pickCoverPalette, renderTypographicCoverHtml } from "./typographic-cover";

describe("typographic-cover", () => {
  it("picks stable palette from slug", () => {
    expect(pickCoverPalette("abc")).toBe(pickCoverPalette("abc"));
  });

  it("renders title and author initials", () => {
    expect(initialsForCover("Babička", "Božena Němcová")).toMatch(/B|N/i);
    const html = renderTypographicCoverHtml({
      slug: "test-123",
      title: "Dílo",
      author: "Jan Novák",
    });
    expect(html).toContain("book-cover");
    expect(html).not.toContain("undefined");
  });
});