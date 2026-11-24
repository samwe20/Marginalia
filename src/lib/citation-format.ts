import type { BookBibliography, BibliographyAuthor } from "./book-bibliography";
import { formatAuthorsDisplay } from "./book-bibliography";
import apaCsl from "../assets/csl/apa.csl?raw";

export type CitationStyleId = "informal" | "iso690" | "apa7";

export interface CitationInput {
  quoteText: string;
  pageLabel: string;
  bibliography: BookBibliography;
}

function cleanJoin(parts: string[], sep: string): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(sep);
}

function authorsIso690(authors: BibliographyAuthor[]): string {
  const parts = authors
    .map((a) => {
      const f = a.family.trim().toUpperCase();
      const g = a.given.trim();
      const initials = g
        ? g
            .split(/\s+/)
            .map((w) => `${w[0]}.`)
            .join(" ")
        : "";
      if (f && initials) return `${f}, ${initials}`;
      return f || g;
    })
    .filter(Boolean);
  return cleanJoin(parts, ", ");
}

function normalizePageForCitation(pageLabel: string): string {
  const p = pageLabel.trim();
  if (!p) return "";
  if (/^\d+$/.test(p)) return `s. ${p}`;
  if (/^str\./i.test(p)) return p;
  if (/^s\./i.test(p)) return p;
  return p;
}

/** Neformální: „Citát.“ — Autor, Název (rok), s. 42 */
export function formatInformalCitation(input: CitationInput): string {
  const quote = input.quoteText.trim().replace(/\s+/g, " ");
  const quotePart = quote ? `„${quote}.“` : "";
  const authors = formatAuthorsDisplay(input.bibliography.authors);
  const title = input.bibliography.title.trim();
  const year = input.bibliography.year.trim();
  const titleYear = cleanJoin([title, year ? `(${year})` : ""], " ");
  const work = cleanJoin([authors, titleYear], ", ");
  const page = normalizePageForCitation(input.pageLabel);
  const tail = cleanJoin([work, page], ", ");
  if (quotePart && tail) return `${quotePart} — ${tail}`;
  return quotePart || tail || "Citace";
}

/** Zjednodušená CSN ISO 690 (autor–datum), české diakritické znaky zachovány. */
export function formatIso690Citation(input: CitationInput): string {
  const bib = input.bibliography;
  const authors = authorsIso690(bib.authors);
  const title = bib.title.trim();
  const year = bib.year.trim();
  const place = bib.place.trim();
  const publisher = bib.publisher.trim();
  const page = normalizePageForCitation(input.pageLabel);
  const quote = input.quoteText.trim().replace(/\s+/g, " ");

  const pub = cleanJoin([place, publisher], ": ");
  const bibParts = cleanJoin(
    [
      authors,
      year ? `${year}.` : "",
      title ? `${title}.` : "",
      bib.subtitle.trim() ? `${bib.subtitle.trim()}.` : "",
      pub ? `${pub}.` : "",
      bib.edition.trim() ? `${bib.edition.trim()}.` : "",
    ],
    " ",
  );

  const citeParts = cleanJoin(
    [quote ? `„${quote}"` : "", page],
    ", ",
  );
  const ref = bibParts || title || authors;
  if (citeParts && ref) return `${ref} ${citeParts}.`;
  return ref || citeParts || "Citace";
}

function toCslJson(bib: BookBibliography) {
  const authors = bib.authors
    .filter((a) => a.family.trim() || a.given.trim())
    .map((a) => ({
      family: a.family.trim() || undefined,
      given: a.given.trim() || undefined,
    }));
  const issuedYear = bib.year.trim().match(/\d{4}/)?.[0];
  return {
    type: "book",
    title: bib.title.trim() || undefined,
    subtitle: bib.subtitle.trim() || undefined,
    author: authors.length ? authors : undefined,
    publisher: bib.publisher.trim() || undefined,
    publisherPlace: bib.place.trim() || undefined,
    edition: bib.edition.trim() || undefined,
    ISBN: bib.isbn.trim() || undefined,
    language: bib.language.trim() || undefined,
    issued: issuedYear ? { "date-parts": [[Number(issuedYear)]] } : undefined,
  };
}

let citeEngineReady: Promise<void> | null = null;

async function ensureApaEngine(): Promise<void> {
  if (citeEngineReady) return citeEngineReady;
  citeEngineReady = (async () => {
    const Cite = (await import("@citation-js/core")).default;
    await import("@citation-js/plugin-csl");
    const tmpl = (Cite as { plugins?: { config?: { get?: (k: string) => { add?: (id: string, xml: string) => void } } } })
      .plugins?.config?.get?.("template");
    tmpl?.add?.("apa7-marginalia", apaCsl);
  })();
  return citeEngineReady;
}

/** APA 7 přes citation.js + bundlovaný CSL (apa.csl, CC BY-SA 3.0). */
export async function formatApa7Citation(input: CitationInput): Promise<string> {
  await ensureApaEngine();
  const { default: Cite } = await import("@citation-js/core");
  const page = input.pageLabel.trim().replace(/^str\.\s*/i, "").match(/\d+/)?.[0] ?? "";
  const cite = new Cite(toCslJson(input.bibliography));
  const bib = cite.format("bibliography", {
    format: "text",
    template: "apa7-marginalia",
    lang: "en-US",
  }) as string;
  const quote = input.quoteText.trim();
  if (quote) {
    const auth = formatAuthorsDisplay(input.bibliography.authors);
    const year = input.bibliography.year.match(/\d{4}/)?.[0] ?? "n.d.";
    const pp = page ? `, s. ${page}` : "";
    const lead = auth ? `${auth} (${year}${pp})` : year;
    return `${lead}. ${quote}`.trim();
  }
  if (bib.trim()) return bib.trim();
  return formatInformalCitation(input);
}

export async function formatCitation(
  style: CitationStyleId,
  input: CitationInput,
): Promise<string> {
  if (style === "informal") return formatInformalCitation(input);
  if (style === "iso690") return formatIso690Citation(input);
  return formatApa7Citation(input);
}