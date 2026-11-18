import { coverImageUrl } from "../lib/book-cover-cache";
import { renderTypographicCoverHtml } from "../lib/typographic-cover";
import { escapeAttr } from "../lib/html";

export function coverImageMarkup(opts: {
  slug: string;
  title: string;
  author: string;
  src: string;
}): string {
  return `<div class="book-card__cover book-card__cover--img" data-cover-host="${escapeAttr(opts.slug)}">
      <img class="book-card__cover-image" src="${escapeAttr(opts.src)}" alt="" loading="lazy" decoding="async"
        data-cover-slug="${escapeAttr(opts.slug)}"
        data-cover-title="${escapeAttr(opts.title)}"
        data-cover-author="${escapeAttr(opts.author)}" />
    </div>`;
}

export async function renderBookCoverMarkup(opts: {
  libraryRoot: string;
  slug: string;
  title: string;
  author: string;
}): Promise<string> {
  const src = await coverImageUrl(opts.libraryRoot, opts.slug);
  if (src) {
    return coverImageMarkup({ slug: opts.slug, title: opts.title, author: opts.author, src });
  }
  return renderTypographicCoverHtml({
    slug: opts.slug,
    title: opts.title,
    author: opts.author,
  });
}

/**
 * Swap typographic placeholders for cached cover images without replacing the whole card.
 * Keeps book cards stable for clicks while covers load.
 */
export async function upgradeBookCardCoversInPlace(
  root: ParentNode,
  libraryRoot: string,
): Promise<void> {
  const cards = root.querySelectorAll<HTMLElement>(".book-card:not(.book-card--demo)[data-slug]");
  for (const card of cards) {
    const slug = card.dataset.slug;
    if (!slug) continue;
    if (card.querySelector("img.book-card__cover-image")) continue;
    const src = await coverImageUrl(libraryRoot, slug);
    if (!src) continue;
    const host = card.querySelector(".book-card__cover, .book-cover");
    if (!host) continue;
    host.outerHTML = coverImageMarkup({
      slug,
      title: card.dataset.title || "",
      author: card.dataset.author || "",
      src,
    });
  }
  bindCoverImageFallbacks(root);
}

/** Never leave a broken <img> — swap to typographic card on error. */
export function bindCoverImageFallbacks(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>("img.book-card__cover-image").forEach((img) => {
    if (img.dataset.fallbackBound === "1") return;
    img.dataset.fallbackBound = "1";
    img.addEventListener("error", () => {
      const host = img.closest(".book-card__cover");
      if (!host) {
        img.remove();
        return;
      }
      const title = img.dataset.coverTitle || "";
      const author = img.dataset.coverAuthor || "";
      const slug = img.dataset.coverSlug || "book";
      host.outerHTML = renderTypographicCoverHtml({ slug, title, author });
    });
  });
}
