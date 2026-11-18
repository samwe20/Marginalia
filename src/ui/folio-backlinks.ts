import type { NoteIndex } from "../lib/noteIndex";
import type { NoteMeta } from "../types/folio";
import { escapeHtml } from "../lib/html";
import {
  formatQuoteBacklinkSubtitle,
  looksLikeUlid,
  quotePreviewLabel,
} from "../lib/quote-display";

export type FolioBacklinkHandlers = {
  openWiki: (title: string, createIfMissing: boolean) => void;
  /** Open a quote in the reader (library) or demo quote detail. */
  openQuote: (quoteId: string) => void;
  /** Open a note by id (preferred over title for notes). */
  openNote?: (noteId: string) => void;
};

/** Folio-style backlinks + outgoing lists (see Folio app.ts renderLinks). */
export function renderFolioBacklinksPanel(
  container: HTMLElement,
  indexPath: string,
  index: NoteIndex,
  handlers: FolioBacklinkHandlers | ((title: string, createIfMissing: boolean) => void),
): void {
  const h: FolioBacklinkHandlers =
    typeof handlers === "function"
      ? { openWiki: handlers, openQuote: (id) => handlers(id, false) }
      : handlers;

  const backlinks = index.getBacklinks(indexPath);
  const outgoing = index.getOutgoing(indexPath);

  container.innerHTML = `
    <div class="backlinks-header">
      <h2>Odkazuje sem</h2>
      <span class="backlinks-count">${backlinks.length}</span>
    </div>
    <p class="backlinks-hint">Poznámky a citace odkazující sem přes <code>[[…]]</code> (stejně jako ve Folio).</p>
    <div class="backlinks-list" id="panel-backlinks-list"></div>
    <div class="outgoing-header"><h3>Odchozí odkazy</h3></div>
    <div class="outgoing-list" id="panel-outgoing-list"></div>
  `;

  const bl = container.querySelector("#panel-backlinks-list")!;
  if (!backlinks.length) {
    bl.innerHTML = `<p class="link-empty">Zatím žádné zpětné odkazy.</p>`;
  } else {
    bl.innerHTML = "";
    for (const note of backlinks) {
      bl.appendChild(linkButton(note, index, h, false));
    }
  }

  const out = container.querySelector("#panel-outgoing-list")!;
  if (!outgoing.length) {
    out.innerHTML = `<p class="link-empty">Žádné odchozí wikilinky.</p>`;
  } else {
    out.innerHTML = "";
    for (const item of outgoing) {
      if (item.note) {
        out.appendChild(linkButton(item.note, index, h, false));
      } else {
        const label = looksLikeUlid(item.title) ? "Chybí: odkaz" : `Chybí: ${item.title}`;
        out.appendChild(
          linkButton(
            {
              title: item.title,
              path: "",
              id: "",
              relativePath: "",
              mtime: 0,
              createdAt: null,
            },
            index,
            {
              ...h,
              openWiki: () => h.openWiki(item.title, true),
            },
            true,
            label,
          ),
        );
      }
    }
  }
}

function displayPrimary(note: NoteMeta, labelOverride?: string): string {
  if (labelOverride) return sanitizeLabel(labelOverride);
  if (note.kind === "quote") {
    const preview = note.quotePreview?.trim() || note.title;
    return sanitizeLabel(preview || "Citace");
  }
  return sanitizeLabel(note.title || "Poznámka");
}

function sanitizeLabel(raw: string): string {
  const t = raw.trim();
  if (!t || looksLikeUlid(t)) return "Citace";
  return t;
}

function linkButton(
  note: NoteMeta,
  index: NoteIndex,
  handlers: FolioBacklinkHandlers,
  missing: boolean,
  labelOverride?: string,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `link-item${missing ? " missing" : ""}${note.kind === "quote" ? " link-item--quote" : ""}`;
  if (note.kind) btn.dataset.linkKind = note.kind;
  if (note.id) btn.dataset.linkId = note.id;

  const primary = displayPrimary(note, labelOverride);
  let secondary = "";
  if (note.kind === "quote") {
    secondary = formatQuoteBacklinkSubtitle(note.quoteBookTitle ?? "", note.quotePage ?? "");
  } else if (!missing) {
    secondary = index.snippetForBacklink(note.id, note.title);
  }

  btn.innerHTML = `<span class="link-item__title">${escapeHtml(primary)}</span>${
    secondary ? `<small class="link-item__sub">${escapeHtml(secondary)}</small>` : ""
  }`;

  btn.addEventListener("click", () => {
    if (missing) {
      handlers.openWiki(note.title, true);
      return;
    }
    if (note.kind === "quote") {
      handlers.openQuote(note.id);
      return;
    }
    if (note.kind === "book") {
      handlers.openWiki(note.title, false);
      return;
    }
    if (handlers.openNote && note.id) {
      handlers.openNote(note.id);
      return;
    }
    handlers.openWiki(note.title, false);
  });
  return btn;
}

/** @deprecated kept for tests — prefer quotePreviewLabel */
export function _quotePreviewForTests(text: string): string {
  return quotePreviewLabel(text);
}
