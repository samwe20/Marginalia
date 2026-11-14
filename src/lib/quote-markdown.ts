import type { Anchor } from "./anchor";
import { parseAnchor, serializeAnchor } from "./anchor";

export interface QuoteFrontmatter {
  id: string;
  book_slug: string;
  book_title: string;
  author: string;
  page: string;
  color: string;
  tags: string[];
  created: string;
  updated: string;
  anchor: Anchor;
}

export interface QuoteDocument {
  meta: QuoteFrontmatter;
  quoteText: string;
  comment: string;
}

const FM_START = "---\n";
const FM_END = "\n---\n";

function escapeYamlString(value: string): string {
  if (/[:#\n'"\\]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function parseYamlScalar(line: string): string {
  const idx = line.indexOf(":");
  if (idx < 0) return "";
  let v = line.slice(idx + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return JSON.parse(v.replace(/^'/, '"').replace(/'$/, '"'));
  }
  return v;
}

export function formatQuoteMarkdown(doc: QuoteDocument): string {
  const m = doc.meta;
  const lines = [
    FM_START,
    `id: ${m.id}`,
    `book_slug: ${escapeYamlString(m.book_slug)}`,
    `book_title: ${escapeYamlString(m.book_title)}`,
    `author: ${escapeYamlString(m.author)}`,
    `page: ${escapeYamlString(m.page)}`,
    `color: ${m.color}`,
    `tags: [${m.tags.map((t) => escapeYamlString(t)).join(", ")}]`,
    `created: ${m.created}`,
    `updated: ${m.updated}`,
    `anchor: ${JSON.stringify(serializeAnchor(m.anchor))}`,
    FM_END,
    `> ${doc.quoteText.split("\n").join("\n> ")}`,
  ];
  if (doc.comment.trim()) {
    lines.push("", doc.comment.trim());
  }
  lines.push("");
  return lines.join("\n");
}

export function parseQuoteMarkdown(source: string): QuoteDocument {
  if (!source.startsWith(FM_START)) {
    throw new Error("Missing frontmatter");
  }
  const end = source.indexOf(FM_END, FM_START.length);
  if (end < 0) throw new Error("Unclosed frontmatter");
  const fm = source.slice(FM_START.length, end);
  const body = source.slice(end + FM_END.length).trim();

  const meta: Partial<QuoteFrontmatter> = {
    tags: [],
    color: "yellow",
  };
  for (const line of fm.split("\n")) {
    const key = line.split(":")[0]?.trim();
    if (!key) continue;
    switch (key) {
      case "id":
        meta.id = parseYamlScalar(line);
        break;
      case "book_slug":
        meta.book_slug = parseYamlScalar(line);
        break;
      case "book_title":
        meta.book_title = parseYamlScalar(line);
        break;
      case "author":
        meta.author = parseYamlScalar(line);
        break;
      case "page":
        meta.page = parseYamlScalar(line);
        break;
      case "color":
        meta.color = parseYamlScalar(line);
        break;
      case "tags": {
        const raw = line.slice(line.indexOf(":") + 1).trim();
        meta.tags = raw
          .replace(/^\[/, "")
          .replace(/\]$/, "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        break;
      }
      case "created":
        meta.created = parseYamlScalar(line);
        break;
      case "updated":
        meta.updated = parseYamlScalar(line);
        break;
      case "anchor": {
        const json = line.slice(line.indexOf(":") + 1).trim();
        meta.anchor = parseAnchor(JSON.parse(json) as unknown as string);
        break;
      }
    }
  }

  let quoteText = "";
  let comment = "";
  const quoteMatch = body.match(/^>([^\n\S].*)$/m);
  if (body.startsWith(">")) {
    const lines = body.split("\n");
    const quoteLines: string[] = [];
    const rest: string[] = [];
    let inQuote = true;
    for (const ln of lines) {
      if (inQuote && ln.startsWith(">")) {
        quoteLines.push(ln.replace(/^>\s?/, ""));
      } else {
        inQuote = false;
        rest.push(ln);
      }
    }
    quoteText = quoteLines.join("\n").trim();
    comment = rest.join("\n").trim();
  } else {
    quoteText = quoteMatch?.[1]?.trim() ?? body;
  }

  const required = ["id", "book_slug", "book_title", "author", "page", "created", "updated", "anchor"] as const;
  for (const k of required) {
    if (meta[k] == null) throw new Error(`Missing ${k}`);
  }

  return {
    meta: meta as QuoteFrontmatter,
    quoteText,
    comment,
  };
}

export function extractQuoteBodyForIndex(doc: QuoteDocument): string {
  return `${doc.meta.book_title} ${doc.meta.author} ${doc.quoteText} ${doc.comment}`;
}