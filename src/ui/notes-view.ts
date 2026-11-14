import { createMarginaliaEditor } from "../editor/marginaliaEditor";
import type { NoteIndex } from "../lib/noteIndex";
import { getDemoNotes, isDemoEnabled } from "../lib/demo-data";
import { listNotes, saveNote, createBlankNote, type LibraryNote } from "../lib/notes";
import { renderMarkdown } from "../lib/preview";
import { escapeHtml } from "../lib/html";
import { renderFolioBacklinksPanel } from "./folio-backlinks";
import { noteIndexPath } from "../lib/marginalia-paths";
import type { WikiNavigationHandlers } from "../lib/wiki-navigation";
import { openWikiTarget } from "../lib/wiki-navigation";

export interface NotesViewContext {
  libraryRoot: string;
  index: NoteIndex;
  theme: "light" | "dark";
  wiki: WikiNavigationHandlers;
  onReindex: () => Promise<void>;
}

export async function renderNotesView(
  stageMain: HTMLElement,
  ctx: NotesViewContext,
  activeNoteId?: string,
): Promise<void> {
  const userNotes = await listNotes(ctx.libraryRoot);
  const demoNotes = isDemoEnabled() ? getDemoNotes() : [];
  const all: LibraryNote[] = [
    ...demoNotes.map((n) => ({
      id: n.id,
      title: n.title,
      filename: n.filename,
      body: n.body,
      created: n.created,
      updated: n.updated,
    })),
    ...userNotes.filter((u) => !demoNotes.some((d) => d.id === u.id)),
  ];

  let current = activeNoteId ? all.find((n) => n.id === activeNoteId) : all[0];

  const paint = () => {
    stageMain.innerHTML = `
      <div class="notes-layout">
        <aside class="notes-list">
          <div class="notes-list__header">
            <h2 class="section-title">Poznámky</h2>
            <button type="button" class="ghost-btn solid" id="btn-new-note">Nová</button>
          </div>
          <ul class="notes-list__items">
            ${all
              .map(
                (n) =>
                  `<li><button type="button" class="note-list-item${current?.id === n.id ? " active" : ""}" data-note-id="${escapeHtml(n.id)}">${escapeHtml(n.title)}</button></li>`,
              )
              .join("")}
          </ul>
        </aside>
        <div class="notes-editor-pane">
          <div id="editor-root" class="editor-root"></div>
          <div id="preview-root" class="preview-root preview-pane-inline" tabindex="0" aria-label="Náhled"></div>
        </div>
        <aside class="backlinks-pane notes-backlinks" id="note-backlinks-pane"></aside>
      </div>
    `;

    stageMain.querySelector("#btn-new-note")?.addEventListener("click", async () => {
      const note = createBlankNote("Nová poznámka");
      await saveNote(ctx.libraryRoot, note);
      all.unshift(note);
      current = note;
      await ctx.onReindex();
      void renderNotesView(stageMain, ctx, note.id);
    });

    stageMain.querySelectorAll("[data-note-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.noteId!;
        current = all.find((n) => n.id === id);
        void renderNotesView(stageMain, ctx, id);
      });
    });

    if (!current) {
      stageMain.querySelector(".notes-editor-pane")!.innerHTML =
        `<p class="muted">Zatím žádné poznámky. Načtěte ukázková data nebo vytvořte novou.</p>`;
      return;
    }

    const editorHost = stageMain.querySelector("#editor-root") as HTMLElement;
    const previewRoot = stageMain.querySelector("#preview-root") as HTMLElement;
    const path = noteIndexPath(current.filename);

    const openWiki = (title: string, createIfMissing: boolean) =>
      openWikiTarget(ctx.index, title, createIfMissing, ctx.wiki);

    let saveTimer: number | null = null;
    const scheduleSave = (text: string) => {
      current!.body = text;
      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        if (current!.id.startsWith("demo-")) {
          void ctx.onReindex();
          return;
        }
        void saveNote(ctx.libraryRoot, current!).then(() => ctx.onReindex());
      }, 600);
      previewRoot.innerHTML = renderMarkdown(text, ctx.index, { allowRemoteImages: false });
      wirePreviewWikiClicks(previewRoot, openWiki);
    };

    const editor = createMarginaliaEditor(
      editorHost,
      ctx.index,
      { onChange: scheduleSave, onOpenWiki: openWiki },
      ctx.theme,
    );
    editor.setText(current.body);
    scheduleSave(current.body);

    const blPane = stageMain.querySelector("#note-backlinks-pane") as HTMLElement;
    renderFolioBacklinksPanel(blPane, path, ctx.index, openWiki);
  };

  paint();
}

function wirePreviewWikiClicks(root: HTMLElement, openWiki: (title: string, c: boolean) => void) {
  root.querySelectorAll("a[data-wiki-title]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openWiki((a as HTMLElement).dataset.wikiTitle!, true);
    });
  });
}