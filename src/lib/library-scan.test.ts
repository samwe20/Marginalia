import { describe, expect, it } from "vitest";
import { isPathInsideLibrary } from "./library-scan";

describe("library-scan", () => {
  it("treats nested paths as inside the library root", () => {
    expect(isPathInsideLibrary("/lib", "/lib/shelf/a.pdf")).toBe(true);
    expect(isPathInsideLibrary("/lib", "/other/a.pdf")).toBe(false);
  });
});
