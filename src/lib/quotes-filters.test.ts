import { describe, expect, it } from "vitest";
import {
  applyQuotesFilters,
  countActiveQuotesFilters,
  emptyQuotesFilterState,
} from "./quotes-filters";
import type { QuoteDocument } from "./quote-markdown";

function doc(partial: {
  id: string;
  book_slug: string;
  book_title: string;
  author: string;
  created: string;
  quoteText: string;
  comment?: string;
}): QuoteDocument {
  return {
    meta: {
      id: partial.id,
      book_slug: partial.book_slug,
      book_title: partial.book_title,
      author: partial.author,
      page: "1",
      color: "yellow",
      tags: [],
      created: partial.created,
      updated: partial.created,
      anchor: { selectors: [{ type: "TextQuoteSelector", exact: partial.quoteText }] },
    },
    quoteText: partial.quoteText,
    comment: partial.comment ?? "",
  };
}

describe("quotes-filters", () => {
  const docs = [
    doc({
      id: "1",
      book_slug: "a",
      book_title: "Alpha",
      author: "Ada",
      created: "2026-11-17T10:00:00.000Z",
      quoteText: "hello world",
      comment: "note",
    }),
    doc({
      id: "2",
      book_slug: "b",
      book_title: "Beta",
      author: "Bob",
      created: "2026-10-01T10:00:00.000Z",
      quoteText: "other",
    }),
  ];
  const live = {
    titleBySlug: new Map([
      ["a", "Alpha Live"],
      ["b", "Beta Live"],
    ]),
    authorBySlug: new Map([
      ["a", "Ada Live"],
      ["b", "Bob Live"],
    ]),
  };

  it("filters by live book title and combines with text search", () => {
    const f = { ...emptyQuotesFilterState(), bookTitles: ["Alpha Live"] };
    const out = applyQuotesFilters(docs, "hello", f, live);
    expect(out.map((d) => d.meta.id)).toEqual(["1"]);
  });

  it("counts active filter groups", () => {
    expect(countActiveQuotesFilters(emptyQuotesFilterState())).toBe(0);
    expect(
      countActiveQuotesFilters({
        bookTitles: ["A"],
        authors: ["B"],
        dateFrom: "2026-01-01",
        dateTo: "",
        onlyWithNote: true,
      }),
    ).toBe(4);
  });
});
