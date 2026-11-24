import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyOpfMetadataFromXml, extractBibliographyFromEpubBuffer } from "./file-metadata";

describe("file-metadata", () => {
  it("parses OPF dc:* fields from fixture", async () => {
    const buf = readFileSync(join("tests", "fixtures", "sample.epub"));
    const meta = await extractBibliographyFromEpubBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(meta.title).toBe("Fixture Book");
    expect(meta.authors?.[0]?.family).toBeTruthy();
    expect(meta.language).toBe("en");
    expect(meta.language).toBe("en");
  });

  it("reads contributor roles from extended OPF", () => {
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Hlavní název</dc:title>
      <dc:creator>Jan Novák</dc:creator>
      <dc:date>1998-06-01</dc:date>
      <dc:publisher>Academia</dc:publisher>
      <dc:identifier>urn:isbn:9788020000001</dc:identifier>
      <dc:language>cs</dc:language>
    </metadata></package>`;
    const m = applyOpfMetadataFromXml(opf);
    expect(m.title).toBe("Hlavní název");
    expect(m.year).toBe("1998");
    expect(m.isbn).toMatch(/978/);
    expect(m.publisher).toBe("Academia");
  });
});