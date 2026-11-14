/**
 * Folio CodeMirror editor setup (subset) — see samwe20/Folio src/editor/setup.ts
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  placeholder,
} from "@codemirror/view";
import type { NoteIndex } from "../lib/noteIndex";
import { createEditorTheme } from "./theme";
import { wikiExtension, type WikiOpenHandler } from "./wikiExtension";

export interface MarginaliaEditorHooks {
  onChange: (text: string) => void;
  onOpenWiki: WikiOpenHandler;
}

export interface MarginaliaEditor {
  view: EditorView;
  setText: (text: string) => void;
  getText: () => string;
  focus: () => void;
  setTheme: (theme: "light" | "dark") => void;
  reconfigureWiki: () => void;
  destroy: () => void;
}

export function createMarginaliaEditor(
  parent: HTMLElement,
  index: NoteIndex,
  hooks: MarginaliaEditorHooks,
  theme: "light" | "dark" = "light",
  editorPlaceholder = "Pište v Markdown — [[wikilinky]] jako ve Folio…",
): MarginaliaEditor {
  let currentTheme = theme;
  const themeConfig = new Compartment();
  const wikiConfig = new Compartment();
  const placeholderConfig = new Compartment();
  let placeholderText = editorPlaceholder;

  const buildExtensions = () => [
    history(),
    drawSelection(),
    highlightActiveLine(),
    markdown({ base: markdownLanguage }),
    placeholderConfig.of(placeholder(placeholderText)),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
    themeConfig.of(createEditorTheme(currentTheme)),
    wikiConfig.of(wikiExtension(index, hooks.onOpenWiki)),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) hooks.onChange(update.state.doc.toString());
    }),
    EditorView.lineWrapping,
  ];

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: buildExtensions(),
    }),
  });

  return {
    view,
    setText(text) {
      view.setState(EditorState.create({ doc: text, extensions: buildExtensions() }));
      view.scrollDOM.scrollTop = 0;
    },
    getText() {
      return view.state.doc.toString();
    },
    focus() {
      view.focus();
    },
    setTheme(next) {
      currentTheme = next;
      view.dispatch({ effects: themeConfig.reconfigure(createEditorTheme(next)) });
    },
    reconfigureWiki() {
      view.dispatch({ effects: wikiConfig.reconfigure(wikiExtension(index, hooks.onOpenWiki)) });
    },
    destroy() {
      view.destroy();
    },
  };
}