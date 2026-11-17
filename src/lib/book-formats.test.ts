import { describe, expect, it } from "vitest";
import { detectBookFileKind, isSupportedBookFile } from "./book-formats";

describe("book-formats", () => {
  it("detects mobi and azw", () => {
    expect(detectBookFileKind("book.mobi")).toBe("mobi");
    expect(detectBookFileKind("book.azw")).toBe("mobi");
    expect(detectBookFileKind("book.azw3")).toBe("mobi");
    expect(isSupportedBookFile("x.AZW")).toBe(true);
  });
});