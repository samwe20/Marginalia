import { createMarginaliaEditor } from "../editor/marginaliaEditor";
import type { NoteIndex } from "../lib/noteIndex";
import { getDemoNotes, isDemoEnabled } from "../lib/demo-data";
import { listNotes, saveNote, createNote, renameNote, DEFAULT_NOTE_TITLE, type LibraryNote } from "../lib/notes";
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
  stageMain.innerHTML = `
      <div class="notes-layout" data-notes-loading="1">
        <aside class="notes-list">
          <div class="notes-list__header">
            <h2 class="section-title">Poznámky</h2>
          </div>
          <p class="muted notes-list__items">Načítání…</p>
        </aside>
        <div class="notes-editor-pane">
          <div id="editor-root" class="editor-root"></div>
        </div>
        <aside class="backlinks-pane notes-backlinks" id="note-backlinks-pane"></aside>
      </div>
    `;
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
      <div class="notes-layout" data-notes-ready="1" data-active-note-id="${escapeHtml(current?.id ?? "")}" data-active-note-filename="${escapeHtml(current?.filename ?? "")}">
        <aside class="notes-list">
          <div class="notes-list__header">
            <h2 class="section-title">Poznámky</h2>
            <button type="button" class="ghost-btn solid" id="btn-new-note">Nová</button>
          </div>
          <ul class="notes-list__items">
            ${all
              .map(
                (n) =>
                  `<li><button type="button" class="note-list-item${current?.id === n.id ? " active" : ""}" data-note-id="${escapeHtml(n.id)}" data-note-filename="${escapeHtml(n.filename)}">${escapeHtml(n.title)}</button></li>`,
              )
              .join("")}
          </ul>
        </aside>
        <div class="notes-editor-pane">
          <input class="note-title-input" id="note-title" placeholder="${DEFAULT_NOTE_TITLE}" spellcheck="false" enterkeyhint="done" aria-label="Název poznámky" />
          <div id="editor-root" class="editor-root"></div>
        </div>
        <aside class="backlinks-pane notes-backlinks" id="note-backlinks-pane"></aside>
      </div>
    `;

    let saveTimer: number | null = null;
    let saveGeneration = 0;
    /** Write any pending edit now, so a rename or note switch never resurrects or loses text. */
    const flushSave = async () => {
      if (!current) return;
      saveGeneration += 1; // invalidate any in-flight debounced save that could recreate the old file after rename
      if (saveTimer == null) return;
      window.clearTimeout(saveTimer);
      saveTimer = null;
      if (!current.id.startsWith("demo-")) await saveNote(ctx.libraryRoot, current);
    };

    stageMain.querySelector("#btn-new-note")?.addEventListener("click", async () => {
      await flushSave();
      const note = await createNote(ctx.libraryRoot, DEFAULT_NOTE_TITLE);
      await ctx.onReindex();
      await renderNotesView(stageMain, ctx, note.id);
    });

    stageMain.querySelectorAll("[data-note-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = (btn as HTMLElement).dataset.noteId!;
        await flushSave();
        await renderNotesView(stageMain, ctx, id);
      });
    });

    if (!current) {
      stageMain.querySelector(".notes-editor-pane")!.innerHTML =
        `<p class="muted">Zatím žádné poznámky. Načtěte ukázková data nebo vytvořte novou.</p>`;
      return;
    }

    const editorHost = stageMain.querySelector("#editor-root") as HTMLElement;
    const path = noteIndexPath(current.filename);

    const openWiki = (title: string, createIfMissing: boolean) =>
      openWikiTarget(ctx.index, title, createIfMissing, ctx.wiki);

    const titleInput = stageMain.querySelector("#note-title") as HTMLInputElement;
    titleInput.value = current.title;
    const activeListItem = () => stageMain.querySelector(".note-list-item.active");
    titleInput.addEventListener("input", () => {
      const item = activeListItem();
      if (item) item.textContent = titleInput.value.trim() || DEFAULT_NOTE_TITLE;
    });
    let renaming = false;
    const renameCurrent = async () => {
      const note = current;
      if (!note || renaming) return;
      const nextTitle = titleInput.value.trim();
      if (!nextTitle) {
        titleInput.value = note.title;
        const item = activeListItem();
        if (item) item.textContent = note.title;
        return;
      }
      if (nextTitle === note.title || note.id.startsWith("demo-")) return;
      renaming = true;
      stageMain.querySelector(".notes-layout")?.setAttribute("data-note-rename", "pending");
      try {
        await flushSave();
        const renamed = await renameNote(ctx.libraryRoot, note, nextTitle);
        Object.assign(note, renamed);
        await ctx.onReindex();
        await renderNotesView(stageMain, ctx, renamed.id);
      } catch (e) {
        console.error("Rename failed", e);
        titleInput.value = note.title;
        const layout = stageMain.querySelector(".notes-layout");
        layout?.setAttribute("data-note-rename", "error");
        layout?.setAttribute(
          "data-note-rename-error",
          e instanceof Error ? e.message.slice(0, 240) : String(e).slice(0, 240),
        );
        ctx.wiki.toast("Přejmenování selhalo", "error");
        renaming = false;
      }
    };
    titleInput.addEventListener("blur", () => void renameCurrent());
    titleInput.addEventListener("change", () => void renameCurrent());
    titleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        titleInput.blur();
      }
    });

    const scheduleSave = (text: string) => {
      current!.body = text;
      if (saveTimer) window.clearTimeout(saveTimer);
      const gen = (saveGeneration += 1);
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        if (gen !== saveGeneration) return;
        if (current!.id.startsWith("demo-")) {
          void ctx.onReindex();
          return;
        }
        void saveNote(ctx.libraryRoot, current!).then(() => {
          if (gen === saveGeneration) void ctx.onReindex();
        });
      }, 600);
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