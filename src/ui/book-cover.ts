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
    return `<div class="book-card__cover book-card__cover--img">
      <img class="book-card__cover-image" src="${escapeAttr(src)}" alt="" loading="lazy" decoding="async" data-cover-slug="${escapeAttr(opts.slug)}" />
    </div>`;
  }
  return renderTypographicCoverHtml({
    slug: opts.slug,
    title: opts.title,
    author: opts.author,
  });
}