/** Derive clean title/author from ebook filenames (eBookEater, Gutenberg-ish, slugs). */

export type FilenameMeta = { title: string; author: string };

const EBOOK_EATER_SUFFIX =
  /\s*[\(\[\{]?\s*ID\s*[:\s]*\d+\s*[-–—]\s*eBookEater(?:\.cz)?\s*[\)\]\}]?\s*$/i;
const TRAILING_ID = /\s*[\(\[]\s*ID\s*[:\s]*\d+\s*[\)\]]\s*$/i;
const TRAILING_SITE = /\s*[-–—]\s*(eBookEater(?:\.cz)?|Project\s*Gutenberg|Standard\s*Ebooks)\s*$/i;

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/i, "").trim();
}

function humanizeSlug(slugish: string): string {
  return slugish
    .replace(/[_]+/g, " ")
    .replace(/-+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanStem(raw: string): string {
  let s = stripExtension(raw);
  s = s.replace(EBOOK_EATER_SUFFIX, "");
  s = s.replace(TRAILING_ID, "");
  s = s.replace(TRAILING_SITE, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

/**
 * Parse `"Author - Title (ID 92 - eBookEater.cz).mobi"` or slug-like
 * `"friedrich-nietzsche-thus-spoke-zarathustra-id-92-f97e880c"`.
 */
export function parseFilenameMeta(fileName: string): FilenameMeta {
  let stem = cleanStem(fileName);
  // Drop trailing hash / id fragments common in library slugs copied as titles.
  stem = stem.replace(/\s*[-_]id[-_]\d+.*$/i, "").trim();
  stem = stem.replace(/\s*[-_][a-f0-9]{6,10}\s*$/i, "").trim();

  const dashSplit = stem.split(/\s+[-–—]\s+/);
  if (dashSplit.length >= 2) {
    const author = dashSplit[0]!.trim();
    const title = dashSplit.slice(1).join(" — ").trim();
    if (author && title && author.length < 80) {
      return { title, author };
    }
  }

  // Slug: author-name-title-words (best-effort: first 2–3 tokens as author for known patterns)
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(stem) && !/\s/.test(stem)) {
    const parts = stem.split("-").filter(Boolean);
    if (parts.length >= 3) {
      // "friedrich-nietzsche-thus-spoke-zarathustra" → author Friedrich Nietzsche
      const author = humanizeSlug(parts.slice(0, 2).join(" "));
      const title = humanizeSlug(parts.slice(2).join(" "));
      return { title, author };
    }
    return { title: humanizeSlug(stem), author: "" };
  }

  return { title: stem || stripExtension(fileName), author: "" };
}

export function looksLikeTechnicalSlug(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^[a-z0-9]+(?:-[a-z0-9]+){2,}-[a-f0-9]{6,}$/i.test(v)) return true;
  if (/-id-\d+/i.test(v)) return true;
  if (v.length > 48 && /^[a-z0-9-]+$/i.test(v) && v.includes("-")) return true;
  return false;
}
