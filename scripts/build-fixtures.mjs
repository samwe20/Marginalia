import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";

const outDir = join("tests", "fixtures");
const publicDir = join("public", "fixtures");
mkdirSync(outDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

/** Two-page PDF for page counter + quote page smoke (S23). */
const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R 6 0 R]/Count 2>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 400 200]/Parent 2 0 R/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>endobj
4 0 obj<</Length 58>>stream
BT /F1 16 Tf 48 120 Td (Marginalia fixture page one) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
6 0 obj<</Type/Page/MediaBox[0 0 400 200]/Parent 2 0 R/Resources<</Font<</F1 5 0 R>>>>/Contents 7 0 R>>endobj
7 0 obj<</Length 58>>stream
BT /F1 16 Tf 48 120 Td (Marginalia fixture page two) Tj ET
endstream
endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
0000000242 00000 n 
0000000352 00000 n 
0000000422 00000 n 
0000000563 00000 n 
trailer<</Size 8/Root 1 0 R>>
startxref
673
%%EOF`;
writeFileSync(join(outDir, "sample.pdf"), pdf);
writeFileSync(join(publicDir, "sample.pdf"), pdf);

const epubPath = join(outDir, "sample.epub");
const zip = new JSZip();
zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
zip.file(
  "META-INF/container.xml",
  `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
);
zip.file(
  "content.opf",
  `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Fixture Book</dc:title>
    <dc:creator>Public Domain</dc:creator>
    <dc:identifier id="id">fixture-epub</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chap" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="chap"/></spine>
</package>`,
);
zip.file(
  "nav.xhtml",
  `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Nav</title></head>
<body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav></body></html>`,
);
const coverPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAAAeCAIAAADby5UUAAAAFklEQVR4nO3BMQEAAADCoPVP7WkJoAAAAG4fEJYAAZQk6iMAAAAASUVORK5CYII=",
  "base64",
);
zip.file("cover.png", coverPng);
zip.file(
  "chapter.xhtml",
  `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Ch1</title></head>
<body><p>Marginalia fixture epub paragraph for highlighting tests.</p></body></html>`,
);
const epub = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync(epubPath, epub);
writeFileSync(join(publicDir, "sample.epub"), epub);

const mobiPath = join(outDir, "sample.mobi");
if (!existsSync(mobiPath)) {
  console.warn("tests/fixtures/sample.mobi missing — commit the MOBI smoke fixture alongside sample.epub");
}

console.log("Wrote tests/fixtures and public/fixtures sample.pdf, sample.epub");