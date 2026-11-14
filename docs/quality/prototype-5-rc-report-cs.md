# RC report — prototype.5 (bugy 1–4 + cross-cutting)

> **CI run [#54](https://github.com/samwe20/Marginalia/actions/runs/43638524352)** (`af84463`) — všech 14 checků zelených; harness nainstalované app poprvé doběhl (~8½ min). Artefakt `desktop-smoke-8705c81` — viz tabulka níže.  
> **Upozornění:** WDIO logoval `1 failed` spec soubor, ale job byl zelený (PowerShell/gsudo nepropagoval exit kód) — oprava v dalším commitu. **Plný Janův checklist není 100 % PASS** dokud nejsou zelené S04–S06/S05/S12 ve `smoke-results.json` a gate je přísný.

## Kořenové příčiny (Jan)

| # | Symptom | Kořenová příčina | Stejná třída — co jsme prošli/opravili |
|---|---------|------------------|----------------------------------------|
| 1 | Otevřít knihu nefunguje | Web-only `#file-open`; desktop bez `dialog.open` + `fs.readFile` | Jednotná `pickBookFileViaDialog()`; capability `dialog:allow-open`, `fs:allow-read-file` |
| 2 | PDF bez výběru textu | Chybějící `pdfjs` worker/CSS + CSS skrýval text vrstvu | Worker `?url`, `pdf_viewer.css`, `.backlinks-hidden` jen na reader panelu |
| 3 | Motiv se nemění | Žádná perzistence / žádný boot `data-theme` | `theme-preference.ts`, Nastavení Systém/Světlý/Tmavý, `localStorage` |
| 4 | Po zavření kniha zmizí | Knihy jen v paměti, bez kopie do knihovny | `persistBookFile`, `readBookBytes`, reopen z karty, scope `allow_library_path` |

## Cross-cutting review (povinné)

- **File pickery:** kniha (dialog), knihovna (Nastavení), „Najít soubor“ při reopen — vše přes Tauri dialog + FS scope, ne `<input type=file>`.
- **Web-only API:** `isTauri()` větvení v `open-book`, `book-library`, `storage`.
- **CSP / asset protocol:** `allow_library_path` rozšiřuje FS i `asset_protocol_scope`.
- **Perzistence:** knihy → `knihovna/knihy/`, karty YAML, citace `.md`, index Rust — smoke S06/S12 cílí na knihovnu po reloadu.

## Smoke — výsledky (run 43638524352, artefakt `desktop-smoke-8705c81`)

| ID | Název | Výsledek | Poznámka |
|----|-------|----------|----------|
| S01 | Library shell | PASS | |
| S02 | Theme Systém/Světlý/Tmavý | PASS | screenshot `smoke-light-mode.png` |
| S03 | Open PDF (smoke hook) | PASS | |
| S04 | Ctrl+O → fixture PDF | FAIL | špatný flow testu (`#btn-back-library` po kliku na knihovnu) |
| S05 | PDF výběr textu | FAIL | `selectFirstPdfText()` false v instalované app |
| S06 | Reopen z knihovny | FAIL | navázané na S04/S05 |
| S07 | EPUB | PASS | |
| S08 | Otevřít knihu | PASS | |
| S09 | Hledání | PASS | |
| S10 | Demo data | PASS | |
| S11 | Poznámky / wikilink UI | PASS | drill-down ruční |
| S12 | Reload → karta knihovny | FAIL | `reloadSession` bez karty |

## Screenshoty (z instalované app, artefakt CI)

- `smoke-pdf-text-selected.png`
- `smoke-light-mode.png`
- `smoke-book-reopened.png`