/**
 * Generate a large Marginalia library for installed-app stress CI.
 *
 * Usage:
 *   node scripts/ci/generate-stress-library.mjs <libraryRoot>
 *
 * Creates ~1000 unique book files (PDF/EPUB/MOBI mix, nested dirs, Czech names,
 * eBookEater suffixes, some no-meta, few corrupt), ~5000 quotes under citace/{slug}/,
 * ~500 notes under poznamky/ with [[wikilinks]], and manifest.json.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");

const BOOK_TOTAL = 1000;
const QUOTE_TOTAL = 5000;
const NOTE_TOTAL = 500;
const CORRUPT_COUNT = 12;
const NO_META_COUNT = 60;
const EBOOK_EATER_COUNT = 280;

const CZECH_AUTHORS = [
  "Božena Němcová",
  "Karel Čapek",
  "Jaroslav Hašek",
  "Milan Kundera",
  "Bohumil Hrabal",
  "Karel Hynek Mácha",
  "Jan Neruda",
  "Franz Kafka",
  "Josef Škvorecký",
  "Václav Havel",
  "Ivan Klíma",
  "Ota Pavel",
  "Arnošt Lustig",
  "Ladislav Fuks",
  "Jiří Weil",
];

const CZECH_TITLES = [
  "Babička",
  "R.U.R.",
  "Osudy dobrého vojáka Švejka",
  "Nesnesitelná lehkost bytí",
  "Obsluhoval jsem anglického krále",
  "Máj",
  "Povídky malostranské",
  "Proces",
  "Zbabělci",
  "Audience",
  "Láska a smetí",
  "Smrt krásných srnců",
  "Modlitba pro Kateřinu Horovitzovou",
  "Spalovač mrtvol",
  "Život s hvězdou",
  "Krakatit",
  "Továrna na absolutno",
  "Válka s mloky",
  "Příliš hlučná samota",
  "Žert",
];

const NESTED_DIRS = [
  "shelf/a",
  "shelf/b/deep",
  "archiv/ceska-literatura",
  "archiv/preklady/2020",
  "romany/klasika",
  "romany/soucasna",
  "inbox/new",
  "inbox/unsorted/batch-1",
  "policky/horni",
  "policky/dolni/serie",
];

const INITIAL_SCAN_MS_MAX = Number(process.env.MARGINALIA_STRESS_INITIAL_MS_MAX || 600_000);
const RESCAN_MS_MAX = Number(process.env.MARGINALIA_STRESS_RESCAN_MS_MAX || 480_000);

function usage() {
  console.error("Usage: node scripts/ci/generate-stress-library.mjs <libraryRoot>");
  process.exit(2);
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Mirror src/lib/paths.ts bookSlug. */
function bookSlug(title, sha256) {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${base || "kniha"}-${sha256.slice(0, 8)}`;
}

/** Mirror src/lib/filename-meta.ts parseFilenameMeta (subset used for stress names). */
function parseFilenameMeta(fileName) {
  const EBOOK_EATER_SUFFIX =
    /\s*[\(\[\{]?\s*ID\s*[:\s]*\d+\s*[-–—]\s*eBookEater(?:\.cz)?\s*[\)\]\}]?\s*$/i;
  const TRAILING_ID = /\s*[\(\[]\s*ID\s*[:\s]*\d+\s*[\)\]]\s*$/i;
  const TRAILING_SITE = /\s*[-–—]\s*(eBookEater(?:\.cz)?|Project\s*Gutenberg|Standard\s*Ebooks)\s*$/i;
  let stem = fileName.replace(/\.[^.]+$/i, "").trim();
  stem = stem.replace(EBOOK_EATER_SUFFIX, "");
  stem = stem.replace(TRAILING_ID, "");
  stem = stem.replace(TRAILING_SITE, "");
  stem = stem.replace(/\s{2,}/g, " ").trim();
  stem = stem.replace(/\s*[-_]id[-_]\d+.*$/i, "").trim();
  stem = stem.replace(/\s*[-_][a-f0-9]{6,10}\s*$/i, "").trim();
  const dashSplit = stem.split(/\s+[-–—]\s+/);
  if (dashSplit.length >= 2) {
    const author = dashSplit[0].trim();
    const title = dashSplit.slice(1).join(" — ").trim();
    if (author && title && author.length < 80) return { title, author };
  }
  return { title: stem || fileName.replace(/\.[^.]+$/i, ""), author: "" };
}

function makePdf(uniqueTag) {
  const text = `Marginalia stress ${uniqueTag}`.slice(0, 48).padEnd(48, " ");
  const stream = `BT /F1 12 Tf 40 120 Td (${text}) Tj ET`;
  const len = stream.length;
  // Minimal single-page PDF; unique content → unique sha.
  return Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 400 200]/Parent 2 0 R/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>endobj
4 0 obj<</Length ${len}>>stream
${stream}
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
0000000242 00000 n 
0000000${String(300 + len).padStart(3, "0")} 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
${400 + len}
%%EOF
`,
    "utf8",
  );
}

async function makeEpub(uniqueTag, title, author, withMeta) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  const metaBlock = withMeta
    ? `<dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author || "Neznámý")}</dc:creator>
    <dc:identifier id="id">stress-${escapeXml(uniqueTag)}</dc:identifier>
    <dc:language>cs</dc:language>`
    : `<dc:identifier id="id">stress-${escapeXml(uniqueTag)}</dc:identifier>
    <dc:language>cs</dc:language>`;
  zip.file(
    "content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${metaBlock}
  </metadata>
  <manifest>
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
<body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Kapitola</a></li></ol></nav></body></html>`,
  );
  zip.file(
    "chapter.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Ch1</title></head>
<body><p>Stress EPUB odstavec ${escapeXml(uniqueTag)} — ${escapeXml(title)}.</p></body></html>`,
  );
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeMobi(template, uniqueTag) {
  // Keep a valid-looking MOBI header from the fixture; append unique trailer for sha.
  const marker = Buffer.from(`\nMARGINALIA-STRESS-${uniqueTag}\n`, "utf8");
  return Buffer.concat([template, marker]);
}

function makeCorrupt(kind, uniqueTag) {
  const junk = Buffer.from(`CORRUPT-${kind}-${uniqueTag}-${randomUUID()}\n`, "utf8");
  if (kind === "pdf") return Buffer.concat([Buffer.from("%PDF-1.4\n", "utf8"), junk.slice(0, 40)]);
  if (kind === "epub") return Buffer.from(`PK\x03\x04corrupt-epub-${uniqueTag}`, "binary");
  return Buffer.from(`BOOKMOBI\x00corrupt-${uniqueTag}`, "binary");
}

function formatQuoteMarkdown({ id, slug, title, author, text, created }) {
  const anchor = JSON.stringify({
    selectors: [{ type: "TextQuoteSelector", exact: text.slice(0, 80) }],
  });
  return `---
id: ${id}
book_slug: ${JSON.stringify(slug)}
book_title: ${JSON.stringify(title)}
author: ${JSON.stringify(author)}
page: "1"
color: yellow
tags: [stress]
created: ${created}
updated: ${created}
anchor: ${anchor}
---
> ${text}

Stress poznámka k citaci [[Poznámka 1]].
`;
}

function formatNoteFile({ id, title, body, created }) {
  return `---
id: ${id}
title: ${JSON.stringify(title)}
created: ${created}
updated: ${created}
---
${body.endsWith("\n") ? body : `${body}\n`}`;
}

function pickKind(i) {
  const r = i % 10;
  if (r < 4) return "pdf";
  if (r < 7) return "epub";
  return "mobi";
}

function buildFileName({ index, kind, author, title, ebookEater, noMeta }) {
  const ext = kind === "mobi" ? "mobi" : kind;
  if (noMeta) return `kniha-${String(index).padStart(4, "0")}.${ext}`;
  const base = `${author} - ${title}`;
  if (ebookEater) {
    const id = 1000 + index;
    return `${base} (ID ${id} - eBookEater.cz).${ext}`;
  }
  return `${base}.${ext}`;
}

async function main() {
  const libraryRoot = process.argv[2];
  if (!libraryRoot) usage();

  const fixtures = {
    mobi: join(repoRoot, "tests/fixtures/sample.mobi"),
  };
  if (!existsSync(fixtures.mobi)) {
    throw new Error(`Missing MOBI fixture at ${fixtures.mobi}`);
  }
  const mobiTemplate = readFileSync(fixtures.mobi);

  if (existsSync(libraryRoot)) {
    rmSync(libraryRoot, { recursive: true, force: true });
  }
  ensureDir(libraryRoot);
  ensureDir(join(libraryRoot, "citace"));
  ensureDir(join(libraryRoot, "poznamky"));
  ensureDir(join(libraryRoot, "knihy"));
  for (const d of NESTED_DIRS) ensureDir(join(libraryRoot, d));

  const createdAt = new Date().toISOString();
  const bookEntries = [];
  const byKind = { pdf: 0, epub: 0, mobi: 0 };

  console.log(`Generating ${BOOK_TOTAL} books under ${libraryRoot}…`);

  // Spread a few corrupt files across formats (not only the first N PDFs).
  const corruptIndexList = Array.from({ length: CORRUPT_COUNT }, (_, k) =>
    Math.floor((k * BOOK_TOTAL) / CORRUPT_COUNT),
  );
  const corruptIndexes = new Set(corruptIndexList);
  const corruptKindByIndex = new Map(
    corruptIndexList.map((idx, k) => [idx, /** @type {"pdf"|"epub"|"mobi"} */ (["pdf", "epub", "mobi"][k % 3])]),
  );

  for (let i = 0; i < BOOK_TOTAL; i++) {
    const corrupt = corruptIndexes.has(i);
    const kind = corrupt ? corruptKindByIndex.get(i) : pickKind(i);
    byKind[kind] += 1;
    const author = CZECH_AUTHORS[i % CZECH_AUTHORS.length];
    const titleBase = CZECH_TITLES[i % CZECH_TITLES.length];
    // Unique title so filename/slug stems differ even when author rotates.
    const title = `${titleBase} ${i + 1}`;
    const noMeta = !corrupt && i < NO_META_COUNT;
    const ebookEater = !corrupt && !noMeta && i < NO_META_COUNT + EBOOK_EATER_COUNT;
    const nested = NESTED_DIRS[i % NESTED_DIRS.length];
    const uniqueTag = `b${String(i).padStart(4, "0")}-${randomUUID().slice(0, 8)}`;
    const fileName = buildFileName({ index: i + 1, kind, author, title, ebookEater, noMeta });
    const relPath = join(nested, fileName).replace(/\\/g, "/");
    const absPath = join(libraryRoot, relPath);
    ensureDir(dirname(absPath));

    let bytes;
    if (corrupt) {
      bytes = makeCorrupt(kind, uniqueTag);
    } else if (kind === "pdf") {
      bytes = makePdf(uniqueTag);
    } else if (kind === "epub") {
      bytes = await makeEpub(uniqueTag, title, author, !noMeta);
    } else {
      bytes = makeMobi(mobiTemplate, uniqueTag);
    }

    writeFileSync(absPath, bytes);
    const sha = sha256Hex(bytes);
    const parsed = parseFilenameMeta(fileName);
    const slug = bookSlug(parsed.title, sha);

    bookEntries.push({
      index: i + 1,
      relativePath: relPath,
      kind,
      title: parsed.title,
      author: parsed.author,
      slug,
      sha256: sha,
      corrupt,
      noMeta,
      ebookEater,
      nestedDir: nested,
    });

    if ((i + 1) % 100 === 0) console.log(`  books ${i + 1}/${BOOK_TOTAL}`);
  }

  // ~5 quotes per book on average → QUOTE_TOTAL
  console.log(`Generating ${QUOTE_TOTAL} quotes…`);
  let quoteCount = 0;
  const quotesPerBook = Math.ceil(QUOTE_TOTAL / bookEntries.length);
  for (const book of bookEntries) {
    if (quoteCount >= QUOTE_TOTAL) break;
    const dir = join(libraryRoot, "citace", book.slug);
    ensureDir(dir);
    const n = Math.min(quotesPerBook, QUOTE_TOTAL - quoteCount);
    for (let q = 0; q < n; q++) {
      quoteCount += 1;
      const id = `stress${String(quoteCount).padStart(7, "0")}`;
      const text = `Citace ${quoteCount} z knihy ${book.title}: stress odstavec ${q + 1}.`;
      const md = formatQuoteMarkdown({
        id,
        slug: book.slug,
        title: book.title,
        author: book.author || "Neznámý",
        text,
        created: createdAt,
      });
      writeFileSync(join(dir, `${id}.md`), md, "utf8");
    }
  }

  console.log(`Generating ${NOTE_TOTAL} notes with wikilinks…`);
  const noteTitles = [];
  for (let i = 1; i <= NOTE_TOTAL; i++) {
    noteTitles.push(`Poznámka ${i}`);
  }
  for (let i = 0; i < NOTE_TOTAL; i++) {
    const title = noteTitles[i];
    const targetA = noteTitles[(i + 1) % NOTE_TOTAL];
    const targetB = noteTitles[(i + 7) % NOTE_TOTAL];
    const book = bookEntries[i % bookEntries.length];
    const id = `note${String(i + 1).padStart(7, "0")}`;
    const body = `# ${title}

Odkaz na [[${targetA}]] a také [[${targetB}]].

Související kniha: [[${book.title}]] (slug \`${book.slug}\`).

Stress poznámka číslo ${i + 1}.
`;
    const md = formatNoteFile({ id, title, body, created: createdAt });
    writeFileSync(join(libraryRoot, "poznamky", `${title}.md`), md, "utf8");
  }

  writeFileSync(join(libraryRoot, "library-never-delete.marker"), "NEVER DELETE USER LIBRARY", "utf8");

  const manifest = {
    version: 1,
    generatedAt: createdAt,
    libraryRoot: libraryRoot,
    books: {
      total: bookEntries.length,
      byKind,
      corrupt: bookEntries.filter((b) => b.corrupt).length,
      noMeta: bookEntries.filter((b) => b.noMeta).length,
      ebookEater: bookEntries.filter((b) => b.ebookEater).length,
      nestedDirs: NESTED_DIRS.length,
    },
    quotes: { total: quoteCount },
    notes: { total: NOTE_TOTAL, withWikilinks: NOTE_TOTAL },
    thresholds: {
      expectedBooks: BOOK_TOTAL,
      expectedQuotes: QUOTE_TOTAL,
      expectedNotes: NOTE_TOTAL,
      initialScanMsMax: INITIAL_SCAN_MS_MAX,
      rescanMsMax: RESCAN_MS_MAX,
      // Rescan of an unchanged library should not grow the card count.
      rescanMustNotGrow: true,
    },
    bookEntries,
  };

  const manifestPath = join(libraryRoot, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  // Sanity: unique shas/slugs
  const shas = new Set(bookEntries.map((b) => b.sha256));
  const slugs = new Set(bookEntries.map((b) => b.slug));
  if (shas.size !== bookEntries.length) {
    throw new Error(`Duplicate content hashes: ${bookEntries.length - shas.size} collisions`);
  }
  if (slugs.size !== bookEntries.length) {
    throw new Error(`Duplicate slugs: ${bookEntries.length - slugs.size} collisions`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        libraryRoot: relative(repoRoot, libraryRoot) || libraryRoot,
        books: bookEntries.length,
        quotes: quoteCount,
        notes: NOTE_TOTAL,
        uniqueShas: shas.size,
        uniqueSlugs: slugs.size,
        manifest: manifestPath,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
