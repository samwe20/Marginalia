# EPUB / MOBI — foliate na WebView2

## Proč dřív končil text v `.epub-fallback-text`

Foliate-js vykresluje kapitoly v **sandboxovaném `<iframe>`** a nastavuje `iframe.src` na **`blob:`** URL (viz `foliate-js/paginator.js`). Marginália měla v `src-tauri/tauri.conf.json` CSP:

```text
frame-src 'none'
```

To v **WebView2** (nainstalovaná app, ne Vite dev server) blokuje načtení obsahu do iframu. Foliate paginator zůstane prázdný, `getContents()` nemá text a po timeoutu aplikace zobrazí **`.epub-fallback-text`** (plain text ze spine).

## Oprava (produkt)

- CSP: **`frame-src 'self' blob: data:`** — povolené blob/data rámce pro foliate.
- **`#epub-root` / `foliate-view`**: `min-height`, aby paginator dostal nenulovou výšku pro layout sloupců.

Fallback zůstává jako záloha při opravdu prázdném rendereru (velký EPUB, rozbitá sekce, MOBI).

## Smoke

- `epubReaderRenderInfo` + `data-epub-render-mode` na `#epub-root`: režim **`iframe` | `fallback` | `empty`**.
- `epubPointerSelectionRect`: souřadnice v **iframe** nebo na **fallback** (co uživatel reálně vidí).
- S07 / S15 / S19 zapisují `renderInfo` do `smoke-results.json`; S15 a S19 citace = skutečný pointer + klávesa **H** (ne smoke invoke na uložení).
- Installed smoke: jeden pokus drag s `origin` = shadow iframe element (18c457b); pak ve content iframe skutečný **double-click** nebo **klik + Shift+šipky**, **H** stále ve frame. Fallback viewport jen pro `.epub-fallback-text`. Diagnostika: screenshot + `epubSelectionDiagnostics`.
- Produkt: highlighter čte `ownerDocument` výběru; **H** poslouchá `window` i **keydown** ve foliate content dokumentech (`onHighlightSaveKey`).