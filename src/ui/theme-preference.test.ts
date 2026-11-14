/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyThemeToApp,
  loadThemePreference,
  resolveEffectiveTheme,
  saveThemePreference,
} from "./theme-preference";

describe("theme-preference", () => {
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
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
  });

  it("persists user choice", () => {
    saveThemePreference("dark");
    expect(loadThemePreference()).toBe("dark");
  });

  it("applies resolved theme to app root", () => {
    const app = document.createElement("div");
    saveThemePreference("light");
    const mode = applyThemeToApp(app, "light");
    expect(mode).toBe("light");
    expect(app.dataset.theme).toBe("light");
    expect(resolveEffectiveTheme("system")).toBe("light");
  });
});