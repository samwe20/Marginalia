import { escapeHtml } from "./html";

const PALETTES = [
  "slate",
  "sand",
  "forest",
  "wine",
  "ink",
  "clay",
  "mist",
  "umber",
] as const;

export type CoverPalette = (typeof PALETTES)[number];

export function pickCoverPalette(seed: string): CoverPalette {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length]!;
}

export function initialsForCover(title: string, author: string): string {
  const t = title.trim();
  const a = author.trim();
  if (t && a) {
    const tw = t.split(/\s+/)[0]?.[0] ?? "";
    const aw = a.split(/\s+/).pop()?.[0] ?? "";
    return (tw + aw).toUpperCase() || t.slice(0, 2).toUpperCase();
  }
  if (t) return t.slice(0, 2).toUpperCase();
  return "?";
}

export function renderTypographicCoverHtml(opts: {
  slug: string;
  title: string;
  author: string;
  subtitle?: string;
}): string {
  const palette = pickCoverPalette(opts.slug);
  const initials = initialsForCover(opts.title, opts.author);
  const line = (opts.subtitle ?? opts.author).trim() || opts.title.trim().slice(0, 28);
  return `<div class="book-cover book-cover--${palette}" aria-hidden="true">
    <span class="book-cover__initials">${escapeHtml(initials)}</span>
    <span class="book-cover__line">${escapeHtml(line.slice(0, 36))}</span>
  </div>`;
}

/** Rasterize typographic cover for cache (browser / Tauri webview). */
export async function renderTypographicCoverPng(opts: {
  slug: string;
  title: string;
  author: string;
  width?: number;
  height?: number;
}): Promise<Blob> {
  const w = opts.width ?? 240;
  const h = opts.height ?? 320;
  const palette = pickCoverPalette(opts.slug);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  const gradients: Record<CoverPalette, [string, string, string]> = {
    slate: ["#5c636c", "#3f454d", "#f4f4f2"],
    sand: ["#e7e1d4", "#c9bfae", "#3a342c"],
    forest: ["#4a5e52", "#2f3f36", "#e8efe9"],
    wine: ["#6b4a52", "#4a3138", "#f5e8ea"],
    ink: ["#2a2c30", "#121418", "#e8eaed"],
    clay: ["#a67c52", "#7d5a3c", "#fff8f0"],
    mist: ["#d5dce3", "#9fadb8", "#2e3540"],
    umber: ["#6e5c4a", "#4a3c30", "#f6efe6"],
  };
  const [c1, c2, fg] = gradients[palette];
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.font = '500 42px "Plus Jakarta Sans Variable", system-ui, sans-serif';
  const initials = initialsForCover(opts.title, opts.author);
  ctx.fillText(initials, w / 2, h * 0.46);
  ctx.font = '500 11px "Plus Jakarta Sans Variable", system-ui, sans-serif';
  ctx.globalAlpha = 0.88;
  const line = (opts.author || opts.title).trim().slice(0, 32);
  ctx.fillText(line.toUpperCase(), w / 2, h * 0.62);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}