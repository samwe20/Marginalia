/** Human-readable location labels for quotes (never raw CFI in UI). */

export function isEpubCfi(value: string): boolean {
  const p = value.trim();
  return /^EPUBCFI\(/i.test(p) || p.startsWith("epubcfi(") || /\/\d+!\//.test(p);
}

export function formatReadableLocus(opts: {
  pageOrCfi: string;
  chapterTitle?: string | null;
  sectionIndex?: number | null;
  sectionCount?: number | null;
  percent?: number | null;
}): string {
  const raw = opts.pageOrCfi.trim();
  if (/^\d+$/.test(raw)) return `str. ${raw}`;
  if (!isEpubCfi(raw) && raw && raw.length <= 48) return raw;

  const chapter = opts.chapterTitle?.trim();
  if (chapter) {
    if (typeof opts.percent === "number" && Number.isFinite(opts.percent)) {
      return `${chapter} · ${Math.round(opts.percent)} %`;
    }
    return chapter;
  }
  if (
    typeof opts.sectionIndex === "number" &&
    typeof opts.sectionCount === "number" &&
    opts.sectionCount > 0
  ) {
    return `kap. ${opts.sectionIndex + 1}/${opts.sectionCount}`;
  }
  if (typeof opts.percent === "number" && Number.isFinite(opts.percent)) {
    return `${Math.round(opts.percent)} %`;
  }
  return "v knize";
}
