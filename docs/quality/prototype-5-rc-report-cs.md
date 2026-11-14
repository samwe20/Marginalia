# RC report — prototype.5 (bugy 1–4 + cross-cutting)

> **Ověřeno nainstalovanou app** — CI run [43648627548](https://github.com/samwe20/Marginalia/actions/runs/43648627548) (`9bbdf8d`), job `windows-installed-smoke`, **12/12 PASS** ve `smoke-results.json`, přísná brána (exit kód WDIO + kontrola JSON).

## Kořenové příčiny (Jan)

| # | Symptom | Kořenová příčina | Stejná třída — co jsme prošli/opravili |
|---|---------|------------------|----------------------------------------|
| 1 | Otevřít knihu nefunguje | Web-only `#file-open`; desktop bez `dialog.open` + `fs.readFile` | Jednotná `pickBookFileViaDialog()`; capability `dialog:allow-open`, `fs:allow-read-file` |
| 2 | PDF bez výběru textu | Chybějící `pdfjs` worker/CSS + canvas blokoval výběr + bez signálu readiness | Worker/CSS, `pointer-events: none` na canvas, `data-pdf-text-ready`, `useSystemFonts` |
| 3 | Motiv se nemění | Žádná perzistence / žádný boot `data-theme` | `theme-preference.ts`, Nastavení Systém/Světlý/Tmavý, `localStorage` |
| 4 | Po zavření kniha zmizí | UI jen z `localStorage` recent; karty na disku ignorované; root knihovny mizel po restartu | `knihy/*.md` + Tauri Store (`libraryRoot`, recent); boot `allow_library_path` + smoke fixture fallback |

## Cross-cutting review (povinné)

- **File pickery:** kniha (dialog), knihovna (Nastavení), „Najít soubor“ při reopen — vše přes Tauri dialog + FS scope, ne `<input type=file>`.
- **Web-only API:** `isTauri()` větvení v `open-book`, `book-library`, `storage`.
- **CSP / asset protocol:** `allow_library_path` rozšiřuje FS i `asset_protocol_scope`.
- **Perzistence:** knihy → `knihovna/knihy/`, karty YAML, citace `.md`, index Rust — S06/S12 na instalované app.
- **Smoke Ctrl+O:** capture listener + vypnutí `promptOpenBook` při `MARGINALIA_SMOKE=1`.
- **Hledání (desktop):** demo výsledky vykreslit před `index_search`; tlačítko **Hledat**.

## Smoke — výsledky (run 43648627548)

| ID | Název | Výsledek | Poznámka |
|----|-------|----------|----------|
| S01 | Library shell | PASS | |
| S02 | Theme Systém/Světlý/Tmavý | PASS | `smoke-light-mode.png` |
| S03 | Open PDF (smoke hook) | PASS | čeká `data-pdf-text-ready` |
| S04 | Ctrl+O → fixture PDF | PASS | |
| S05 | PDF výběr textu | PASS | `smoke-pdf-text-selected.png` |
| S06 | Reopen z knihovny | PASS | `smoke-book-reopened.png` |
| S07 | EPUB | PASS | |
| S08 | Otevřít knihu | PASS | |
| S09 | Hledání | PASS | demo „Tolstoj“ + `#btn-search-run` |
| S10 | Demo data | PASS | ověřena demo mřížka v knihovně |
| S11 | Poznámky UI | PASS | `#btn-new-note` po S10 remove |
| S12 | Restart → karta + reopen | PASS | `smoke-book-restarted.png` |

Artefakt CI: `desktop-smoke-c5ad4a3` (zip se screenshoty + `smoke-results.json`) — [stáhnout z Actions](https://github.com/samwe20/Marginalia/actions/runs/43648627548).

## Installer (test build ze stejného CI — **ne** merge nutný k downloadu)

- **NSIS .exe (přímý artefakt CI):** [Marginalia-0.1.0-prototype.5-test-c5ad4a3-setup.exe](https://github.com/samwe20/Marginalia/actions/runs/43648627548) → job artifacts `marginalia-windows-installer-0.1.0-prototype.5-test-c5ad4a3` (vyžaduje přihlášení GitHub).
- Publikovaný `develop-latest` release: až po **merge PR #13** do `develop` a zeleném smoke na `develop`.

## Screenshoty (nainstalovaná app, z artefaktu)

- `smoke-pdf-text-selected.png` — vybraný text v PDF
- `smoke-light-mode.png` — světlý motiv
- `smoke-book-reopened.png` — kniha znovu z karty (S06)
- `smoke-book-restarted.png` — po `reloadSession` + reopen (S12)

## Merge / publish (Jan)

- **Nepřipraveno k merge** na `develop`, dokud PR [#13](https://github.com/samwe20/Marginalia/pull/13) nemá na head commitu zelenou CI včetně smoke (aktuálně `9bbdf8d` — splněno na větvi PR).
- Po merge: první gated `develop-latest` installer až po smoke na push do `develop`.