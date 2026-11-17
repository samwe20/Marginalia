import type { NoteIndex } from "../lib/noteIndex";
import type { NoteMeta } from "../types/folio";
import { escapeHtml } from "../lib/html";

/** Folio-style backlinks + outgoing lists (see Folio app.ts renderLinks). */
export function renderFolioBacklinksPanel(
  container: HTMLElement,
  indexPath: string,
  index: NoteIndex,
  onOpenWiki: (title: string, createIfMissing: boolean) => void,
): void {
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
      bl.appendChild(linkButton(note, index, onOpenWiki, false));
    }
  }

  const out = container.querySelector("#panel-outgoing-list")!;
  if (!outgoing.length) {
    out.innerHTML = `<p class="link-empty">Žádné odchozí wikilinky.</p>`;
  } else {
    out.innerHTML = "";
    for (const item of outgoing) {
      const label = item.note ? item.title : `Chybí: ${item.title}`;
      out.appendChild(
        linkButton(
          item.note ?? ({ title: item.title, path: "", id: "", relativePath: "", mtime: 0, createdAt: null }),
          index,
          () => onOpenWiki(item.title, true),
          !item.note,
          label,
        ),
      );
    }
  }
}

function linkButton(
  note: NoteMeta,
  index: NoteIndex,
  onOpen: (title: string, createIfMissing: boolean) => void,
  missing: boolean,
  label?: string,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `link-item${missing ? " missing" : ""}`;
  const snippet = index.snippetForBacklink(note.id, note.title);
  btn.innerHTML = `<span>${escapeHtml(label ?? note.title)}</span>${
    snippet ? `<small>${escapeHtml(snippet)}</small>` : ""
  }`;
  btn.addEventListener("click", () => onOpen(note.title, !missing));
  return btn;
}