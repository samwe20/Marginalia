import { describe, expect, it } from "vitest";
import { looksLikeTechnicalSlug, parseFilenameMeta } from "./filename-meta";

describe("parseFilenameMeta", () => {
  it("strips eBookEater ID suffix and splits author", () => {
    const m = parseFilenameMeta("William Shakespeare - Hamlet (ID 344 - eBookEater.cz).mobi");
    expect(m.author).toBe("William Shakespeare");
    expect(m.title).toBe("Hamlet");
  });

  it("parses Frankenstein-style Author - Title", () => {
    const m = parseFilenameMeta("Mary Shelley - Frankenstein.epub");
    expect(m.author).toBe("Mary Shelley");
    expect(m.title).toBe("Frankenstein");
  });

  it("humanizes slug titles with author prefix", () => {
    const m = parseFilenameMeta("friedrich-nietzsche-thus-spoke-zarathustra-id-92-f97e880c.mobi");
    expect(m.author.toLowerCase()).toContain("friedrich");
    expect(m.author.toLowerCase()).toContain("nietzsche");
    expect(m.title.toLowerCase()).toContain("zarathustra");
    expect(m.title).not.toMatch(/f97e880c/i);
  });

  it("detects technical slugs", () => {
    expect(looksLikeTechnicalSlug("friedrich-nietzsche-thus-spoke-zarathustra-id-92-f97e880c")).toBe(
      true,
    );
    expect(looksLikeTechnicalSlug("Thus spoke Zarathustra")).toBe(false);
  });
});
