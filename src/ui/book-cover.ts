import { coverImageUrl } from "../lib/book-cover-cache";
import { renderTypographicCoverHtml } from "../lib/typographic-cover";
import { escapeAttr } from "../lib/html";

export async function renderBookCoverMarkup(opts: {
  libraryRoot: string;
  slug: string;
  title: string;
  author: string;
}): Promise<string> {
  const src = await coverImageUrl(opts.libraryRoot, opts.slug);
  if (src) {
    return `<div class="book-card__cover book-card__cover--img" data-cover-host="${escapeAttr(opts.slug)}">
      <img class="book-card__cover-image" src="${escapeAttr(src)}" alt="" loading="lazy" decoding="async"
        data-cover-slug="${escapeAttr(opts.slug)}"
        data-cover-title="${escapeAttr(opts.title)}"
        data-cover-author="${escapeAttr(opts.author)}" />
    </div>`;
  }
  return renderTypographicCoverHtml({
    slug: opts.slug,
    title: opts.title,
    author: opts.author,
  });
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
