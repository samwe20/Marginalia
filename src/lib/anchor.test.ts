import { describe, expect, it } from "vitest";
import {
  anchorFromEpubSelection,
  anchorFromPdfSelection,
  fuzzyLocateTextQuote,
  parseAnchor,
  reanchorInText,
  serializeAnchor,
} from "./anchor";

describe("anchor", () => {
  const pageText = "Once upon a time in a land far away, someone said hello world.";

  it("creates and serializes PDF anchor", () => {
    const anchor = anchorFromPdfSelection(pageText, 0, 49, 60, []);
    const raw = serializeAnchor(anchor);
    const back = parseAnchor(raw);
    expect(back.selectors).toHaveLength(2);
  });

  it("re-anchors by position when text unchanged", () => {
    const anchor = anchorFromPdfSelection(pageText, 0, 49, 60, []);
    const pos = reanchorInText(pageText, anchor);
    expect(pos).toEqual({ start: 49, end: 60 });
  });

  it("fuzzy re-anchors after minor EPUB reflow change", () => {
    const doc = "Chapter 1\n\nOnce upon a time in a land far away, someone said hello world.\n";
    const anchor = anchorFromEpubSelection(doc, 13, 73, "/6/4[chap01ref]!/4/2/1:0");
    const reflowed = "Chapter 1\n\nOnce upon a time in a land far away,\nsomeone said hello world.\n";
    const pos = reanchorInText(reflowed, anchor);
    expect(pos).not.toBeNull();
    expect(reflowed.slice(pos!.start, pos!.end)).toContain("hello");
  });

  it("fuzzyLocateTextQuote prefers prefix/suffix match", () => {
    const haystack = "aaa PREFIX needle SUFFIX bbb PREFIX needle SUFFIX ccc";
    const hit = fuzzyLocateTextQuote(haystack, {
      type: "TextQuoteSelector",
      exact: "needle",
      prefix: "PREFIX ",
      suffix: " SUFFIX",
    });
    expect(hit?.start).toBe(11);
  });
});