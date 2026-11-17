/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadDesktopReaderFlow = vi.fn(async (): Promise<"paginated" | "scrolled" | null> => null);
const saveDesktopReaderFlow = vi.fn(async (_flow: "paginated" | "scrolled") => undefined);

vi.mock("./desktop-prefs", () => ({
  loadDesktopReaderFlow: () => loadDesktopReaderFlow(),
  saveDesktopReaderFlow: (flow: "paginated" | "scrolled") => saveDesktopReaderFlow(flow),
}));

describe("reader-flow preference", () => {
  beforeEach(() => {
    vi.resetModules();
    loadDesktopReaderFlow.mockReset();
    saveDesktopReaderFlow.mockReset();
    loadDesktopReaderFlow.mockResolvedValue(null);
    saveDesktopReaderFlow.mockResolvedValue(undefined);
    localStorage.clear();
  });

  it("defaults to scrolled", async () => {
    const { loadReaderFlow, DEFAULT_FOLIATE_FLOW } = await import("./reader-flow");
    expect(DEFAULT_FOLIATE_FLOW).toBe("scrolled");
    expect(loadReaderFlow()).toBe("scrolled");
  });

  it("persists through the durable desktop store and hydrates after restart", async () => {
    const mod = await import("./reader-flow");
    await mod.saveReaderFlow("paginated");
    expect(localStorage.getItem("marginalia.readerFlow")).toBe("paginated");
    expect(saveDesktopReaderFlow).toHaveBeenCalledWith("paginated");

    vi.resetModules();
    loadDesktopReaderFlow.mockResolvedValue("paginated");
    localStorage.clear();
    const again = await import("./reader-flow");
    expect(again.loadReaderFlow()).toBe("scrolled");
    await again.hydrateReaderFlow();
    expect(again.loadReaderFlow()).toBe("paginated");
    expect(localStorage.getItem("marginalia.readerFlow")).toBe("paginated");
  });
});
