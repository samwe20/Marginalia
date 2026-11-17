/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractCoverBytesFromEpub } from "./cover-extract";
import { applyOpfMetadataFromXml } from "./file-metadata";

describe("cover-extract", () => {
  it("reads EPUB cover when present in OPF", async () => {
    const buf = readFileSync(join("tests", "fixtures", "sample.epub"));
    const slice = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const cov = await extractCoverBytesFromEpub(slice);
    expect(cov?.bytes.byteLength).toBeGreaterThan(0);
  });

  it("falls back gracefully when OPF has no cover item", async () => {
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>X</dc:title></metadata><manifest></manifest></package>`;
    expect(applyOpfMetadataFromXml(opf).title).toBe("X");
  });
});