# Instalovaná app — povinný smoke (Windows)

## CI

- Job **`windows-installed-smoke`** (závisí na `windows-build`):
  1. Stáhne NSIS artefakt z CI buildu.
  2. Tichá instalace: `/S /D=%LOCALAPPDATA%\MarginaliaSmoke`.
  3. Spustí **nainstalovaný** binár přes **tauri-driver** + **WebdriverIO** (`driverProvider: external`, Edge WebDriver). Na GHA jde harness přes **gsudo --integrity Medium** (WebView2 při High Integrity neotevře DevTools port).
  4. `MARGINALIA_SMOKE=1` + `MARGINALIA_SMOKE_DEFER_LIBRARY=1` simuluje čistou instalaci (blokující popup knihovny). Fixture: PDF v podsložce `shelf/`, EPUB v kořeni knihovny.

- Job **`windows-pr-test-release`** (jen **pull_request**, po zeleném smoke): nahraje **jeden** `.exe` na release tag `pr-<číslo>-test` (přímý asset, ne ZIP).

- Job **`windows-develop-release`** publikuje `develop-latest` **jen na push do `develop`**, pokud smoke projde.

- **Striktní gate:** `scripts/ci/windows-installed-smoke.ps1` selže, pokud libovolný řádek v `smoke-results.json` má `ok: false` (S01–S17 + S18).

## Příkazy lokálně (Windows)

```powershell
$env:INSTALLER_PATH = ".\Marginalia-0.1.0-prototype.6-test-xxxxxxx-setup.exe"
cargo install tauri-driver --locked
npm ci
./scripts/ci/windows-installed-smoke.ps1
```

Výstupy: `test-results/desktop-smoke/` (screenshoty, `smoke-results.json`).

## Mapování na Janův checklist (nový first-run flow)

| ID | Požadavek | Automatizace |
|----|-----------|--------------|
| S01 | Knihovna / shell | `[data-route="library"]` |
| S18 | **First-run popup**, bez otevření před složkou, výběr složky → auto-scan | `smoke_reset_first_run` + `finishLibrarySetup` + blok `openBookAtPath` / `rescan` |
| S02 | motiv | Nastavení → `data-theme-pref` |
| S03 | PDF z karty knihovny | klik `data-kind="pdf"` |
| S04 | Auto-list PDF (podsložka) + EPUB | ≥2 karty, fixture PDF pod `shelf/` |
| S05–S06 | výběr textu, reopen | WDIO výběr v `.textLayer`, karta knihovny |
| S07 | EPUB (viditelný text) | karta `data-kind="epub"` + `epubVisibleTextLength` |
| S08 | Obnovit knihy ze složky | `[data-testid="btn-rescan-books"]` |
| S09 | hledání | `#search-input` (demo index) |
| S10 | demo data | `#btn-demo-load` / `#btn-demo-remove` |
| S11 | poznámky UI | `data-notes-ready` |
| S12 | restart drží složku + knihy | `reloadSession` → `getLibraryRoot` + karty |
| S13 | **Obnovit** nový soubor | `smoke_stage_file_in_library` + `rescanBooksFromFolder` |
| S14 | **PDF citace** | `__MARGINALIA_SMOKE_API__` + `smoke_list_quote_files` |
| S15 | **EPUB citace** | stejné pro EPUB |
| S16 | **wikilink + backlink** | `seedWikilinkBacklink` → `#panel-backlinks-list` |
| S17 | **dialog plugin** | `smoke_dialog_capable` + `verifyDialogPlugin` |

## Nepoužívat web build jako důkaz desktopu

Playwright `test:e2e` běží na **Vite preview** (web parita). Desktop regressions chytá výhradně **installed-app** job výše.