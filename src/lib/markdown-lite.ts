import { escapeHtml } from "./html";

/** Minimal markdown for demo note previews (no HTML injection). */
export function renderMarkdownLite(source: string): string {
  const blocks = source.trim().split(/\n\n+/);
  return blocks
    .map((block) => {
      if (block.startsWith("> ")) {
        const inner = inline(block.split("\n").map((l) => l.replace(/^>\s?/, "")).join("\n"));
        return `<blockquote class="md-quote">${inner}</blockquote>`;
      }
      if (block.match(/^[-*] /m)) {
        const items = block
          .split("\n")
          .filter((l) => /^[-*] /.test(l))
          .map((l) => `<li>${inline(l.replace(/^[-*] /, ""))}</li>`)
          .join("");
        return `<ul class="md-list">${items}</ul>`;
      }
      if (/^\d+\. /.test(block)) {
        const items = block
          .split("\n")
          .filter((l) => /^\d+\. /.test(l))
          .map((l) => `<li>${inline(l.replace(/^\d+\.\s/, ""))}</li>`)
          .join("");
        return `<ol class="md-list">${items}</ol>`;
      }
      const lines = block.split("\n").map((line) => {
        if (line.startsWith("## ")) return `<h3 class="md-h3">${inline(line.slice(3))}</h3>`;
        return `<p>${inline(line)}</p>`;
      });
      return lines.join("");
    })
    .join("");
}

function inline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return s;
}