import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDemoPayload,
  disableDemoData,
  enableDemoData,
  getDemoQuotes,
  isDemoEnabled,
  searchDemoQuotes,
} from "./demo-data";

describe("demo-data", () => {
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

  afterEach(() => {
    disableDemoData();
    vi.unstubAllGlobals();
  });

  it("starts disabled", () => {
    expect(isDemoEnabled()).toBe(false);
    expect(getDemoQuotes()).toEqual([]);
  });

  it("loads curated payload", () => {
    const p = buildDemoPayload();
    expect(p.books.length).toBeGreaterThanOrEqual(6);
    expect(p.quotes.length).toBeGreaterThanOrEqual(20);
  });

  it("enables and searches quotes", () => {
    enableDemoData();
    expect(isDemoEnabled()).toBe(true);
    const hits = searchDemoQuotes("Hamlet");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.quoteText.toLowerCase().includes("být"))).toBe(true);
  });

  it("can be removed", () => {
    enableDemoData();
    disableDemoData();
    expect(isDemoEnabled()).toBe(false);
  });
});