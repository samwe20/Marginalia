import { describe, expect, it } from "vitest";
import { anchorFromPdfSelection } from "./anchor";
import { formatQuoteMarkdown, parseQuoteMarkdown } from "./quote-markdown";

describe("quote-markdown", () => {
  it("round-trips quote file", () => {
    const anchor = anchorFromPdfSelection("hello world", 0, 0, 5, []);
    const doc = {
      meta: {
        id: "01JTEST",
        book_slug: "sample-book",
        book_title: "Sample",
        author: "Author",
        page: "1",
        color: "yellow",
        tags: ["proto"],
        created: "2026-11-14T12:00:00Z",
        updated: "2026-11-14T12:00:00Z",
        anchor,
      },
      quoteText: "hello",
      comment: "Note.",
    };
    const md = formatQuoteMarkdown(doc);
    const back = parseQuoteMarkdown(md);
    expect(back.quoteText).toBe("hello");
    expect(back.comment).toBe("Note.");
    expect(back.meta.id).toBe("01JTEST");
    expect(back.meta.anchor.selectors.length).toBeGreaterThan(0);
  });
});