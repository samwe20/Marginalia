import type { BookBibliography, BibliographyAuthor } from "./book-bibliography";
import { emptyBibliography } from "./book-bibliography";

export type ExtractedBibliography = Partial<BookBibliography>;

type FoliateContributor = { name?: string; sortAs?: string } | string;

function textValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && !Array.isArray(v)) {
    const m = v as Record<string, string>;
    return (m.cs || m.en || Object.values(m)[0] || "").trim();
  }
  return "";
}

function splitContributorName(name: string): BibliographyAuthor {
  const raw = name.trim();
  if (!raw) return { family: "", given: "" };
  if (raw.includes(",")) {
    const [family, given] = raw.split(",", 2).map((s) => s.trim());
    return { family: family || "", given: given || "" };
  }
  const tokens = raw.split(/\s+/);
  if (tokens.length === 1) return { family: tokens[0]!, given: "" };
  return { family: tokens[tokens.length - 1]!, given: tokens.slice(0, -1).join(" ") };
}

function contributorsToAuthors(list: unknown): BibliographyAuthor[] {
  if (!list) return [];
  const arr = Array.isArray(list) ? list : [list];
  const out: BibliographyAuthor[] = [];
  for (const item of arr) {
    if (typeof item === "string") {
      out.push(splitContributorName(item));
      continue;
    }
    const c = item as FoliateContributor;
    const name = typeof c === "object" && c ? textValue((c as { name?: unknown }).name) : "";
    if (name) out.push(splitContributorName(name));
  }
  return out;
}

/** Map foliate-js `book.metadata` (Readium-ish) → bibliography fields. */
export function mapFoliateMetadata(metadata: unknown): ExtractedBibliography {
  if (!metadata || typeof metadata !== "object") return {};
  const m = metadata as Record<string, unknown>;
  const title = textValue(m.title);
  const subtitle = textValue(m.subtitle);
  const authors = contributorsToAuthors(m.author);
  const translatorList = (m.translator as unknown) ?? filterContributorRole(m, "trl");
  const editorList = (m.editor as unknown) ?? filterContributorRole(m, "edt");
  const publisher = textValue(
    Array.isArray(m.publisher) ? (m.publisher[0] as { name?: string })?.name ?? m.publisher[0] : m.publisher,
  );
  const published = textValue(m.published);
  const year = published.match(/\d{4}/)?.[0] ?? "";
  const language = Array.isArray(m.language) ? textValue(m.language[0]) : textValue(m.language);
  const isbn = pickIsbn(m);
  const translator = contributorsToAuthors(translatorList).map(formatAuthorDisplayShort).filter(Boolean).join("; ");
  const editor = contributorsToAuthors(editorList).map(formatAuthorDisplayShort).filter(Boolean).join("; ");
  return {
    authors: authors.length ? authors : undefined,
    title: title || undefined,
    subtitle: subtitle || undefined,
    year: year || undefined,
    publisher: publisher || undefined,
    language: language || undefined,
    isbn: isbn || undefined,
    translator: translator || undefined,
    editor: editor || undefined,
  };
}

function formatAuthorDisplayShort(a: BibliographyAuthor): string {
  const g = a.given.trim();
  const f = a.family.trim();
  if (g && f) return `${g} ${f}`;
  return f || g;
}

function filterContributorRole(_m: Record<string, unknown>, _role: string): unknown {
  return undefined;
}

function pickIsbn(m: Record<string, unknown>): string {
  const id = m.identifier ?? m.altIdentifier;
  if (typeof id === "string" && /isbn/i.test(id)) return id.replace(/^.*:/, "").trim();
  if (Array.isArray(id)) {
    for (const x of id) {
      const s = typeof x === "string" ? x : textValue((x as { value?: string })?.value);
      if (/978|979|\d{9}[\dX]/i.test(s)) return s.replace(/^urn:isbn:/i, "").trim();
    }
  }
  return "";
}

export function mergeExtractedBibliography(
  current: BookBibliography,
  extracted: ExtractedBibliography,
): BookBibliography {
  const out = { ...current, authors: current.authors.map((a) => ({ ...a })) };
  const setIfEmpty = <K extends keyof BookBibliography>(key: K, val: BookBibliography[K] | undefined) => {
    const cur = out[key];
    if (Array.isArray(cur)) {
      if (cur.every((a) => !a.family.trim() && !a.given.trim()) && Array.isArray(val) && val.length) {
        (out[key] as BibliographyAuthor[]) = val as BibliographyAuthor[];
      }
      return;
    }
    const s = String(cur ?? "").trim();
    const next = String(val ?? "").trim();
    if (!s && next) (out[key] as string) = next;
  };
  if (extracted.authors?.length) setIfEmpty("authors", extracted.authors);
  setIfEmpty("title", extracted.title);
  setIfEmpty("subtitle", extracted.subtitle);
  setIfEmpty("year", extracted.year);
  setIfEmpty("publisher", extracted.publisher);
  setIfEmpty("place", extracted.place);
  setIfEmpty("edition", extracted.edition);
  setIfEmpty("isbn", extracted.isbn);
  setIfEmpty("translator", extracted.translator);
  setIfEmpty("editor", extracted.editor);
  setIfEmpty("language", extracted.language);
  return out;
}

function pickXmlValues(opfXml: string, tag: string): string[] {
  const re = new RegExp(`<(?:dc:)?${tag}[^>]*>([^<]*)</(?:dc:)?${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(opfXml))) out.push(m[1]!.trim());
  return out.filter(Boolean);
}

export function applyOpfMetadataFromXml(opfXml: string): ExtractedBibliography {
  const pick = (tag: string) => pickXmlValues(opfXml, tag);
  const title = pick("title")[0] ?? "";
  const creators = pick("creator");
  const authors = creators.length ? creators.map(splitContributorName) : [];
  const publisher = pick("publisher")[0] ?? "";
  const date = pick("date")[0] ?? "";
  const year = date.match(/\d{4}/)?.[0] ?? "";
  const language = pick("language")[0] ?? "";
  const ids = pick("identifier");
  const isbn = ids.find((x) => /isbn|978|979/i.test(x))?.replace(/^.*?:/, "").trim() ?? "";
  return {
    title: title || undefined,
    authors: authors.length ? authors : undefined,
    publisher: publisher || undefined,
    year: year || undefined,
    language: language || undefined,
    isbn: isbn || undefined,
  };
}

export async function extractBibliographyFromEpubBuffer(buffer: ArrayBuffer): Promise<ExtractedBibliography> {
  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);
    const container = await zip.file("META-INF/container.xml")?.async("string");
    if (!container) return {};
    const opfPath =
      container.match(/full-path\s*=\s*"([^"]+)"/i)?.[1] ??
      container.match(/full-path\s*=\s*'([^']+)'/i)?.[1];
    if (!opfPath) return {};
    const opf = await zip.file(opfPath)?.async("string");
    if (!opf) return {};
    return applyOpfMetadataFromXml(opf);
  } catch {
    return {};
  }
}

export function emptyExtracted(): ExtractedBibliography {
  return emptyBibliography();
}