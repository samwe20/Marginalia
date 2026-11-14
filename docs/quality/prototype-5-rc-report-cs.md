# RC report — prototype.5 (bugy 1–4 + cross-cutting)

> Tabulka smoke z **nainstalované** aplikace doplní CI artefakt `desktop-smoke-<sha>/smoke-results.json` po zeleném `windows-installed-smoke`. Dokud CI neprojde, **netvrďte** desktop jako ověřený.

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

## Smoke — výsledky (doplnit z CI)

| ID | Název | Výsledek | Poznámka |
|----|-------|----------|----------|
| … | viz `smoke-results.json` | PASS/FAIL | |

## Screenshoty (z instalované app, artefakt CI)

- `smoke-pdf-text-selected.png`
- `smoke-light-mode.png`
- `smoke-book-reopened.png`