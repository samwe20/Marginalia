# Instalovaná app — povinný smoke (Windows)

## CI

- Job **`windows-installed-smoke`** (závisí na `windows-build`):
  1. Stáhne NSIS artefakt z CI buildu.
  2. Tichá instalace: `/S /D=%LOCALAPPDATA%\MarginaliaSmoke`.
  3. Spustí **nainstalovaný** binár přes **tauri-driver** + **WebdriverIO** (`driverProvider: external`, Edge WebDriver). Na GHA jde harness přes **gsudo --integrity Medium** (WebView2 při High Integrity neotevře DevTools port).
  4. `MARGINALIA_SMOKE=1` + `MARGINALIA_SMOKE_DEFER_LIBRARY=1` simuluje čistou instalaci (blokující popup knihovny). Fixture: PDF v podsložce `shelf/`, EPUB + MOBI v kořeni knihovny.

- Job **`windows-pr-test-release`** (jen **pull_request**, po zeleném smoke): nahraje **jeden** `.exe` na release tag `pr-<číslo>-test` (přímý asset, ne ZIP).

- Job **`windows-develop-release`** publikuje `develop-latest` **jen na push do `develop`**, pokud smoke projde.

- **Striktní gate:** `scripts/ci/windows-installed-smoke.ps1` selže, pokud libovolný řádek v `smoke-results.json` má `ok: false` (S01–S17, S18–S23).

## Příkazy lokálně (Windows)

```powershell
$env:INSTALLER_PATH = ".\Marginalia-0.1.0-prototype.6-test-xxxxxxx-setup.exe"
cargo install tauri-driver --locked
npm ci
./scripts/ci/windows-installed-smoke.ps1
```

Výstupy: `test-results/desktop-smoke/` (screenshoty, `smoke-results.json`).

## Mapování na Janův checklist (first-run + citace H)

| ID | Požadavek | Automatizace |
|----|-----------|--------------|
| S01 | Knihovna / shell | `[data-route="library"]` |
| S18 | **First-run popup**, bez otevření před složkou, výběr složky → auto-scan | `smoke_reset_first_run` + `finishLibrarySetup` + blok `openBookAtPath` / `rescan` |
| S02 | motiv | Nastavení → `data-theme-pref` |
| S03 | PDF z karty knihovny | klik `data-kind="pdf"` |
| S04 | Auto-list PDF (podsložka) + EPUB + MOBI | ≥3 karty včetně `data-kind="mobi"` |
| S05 | PDF výběr **neukládá** citaci | pointer drag v `.textLayer`, `smoke_list_quote_files` beze změny |
| S06 | reopen | karta knihovny |
| S07 | EPUB (viditelný text) | karta `data-kind="epub"` + `epubReaderRenderInfo` (`iframe` vs `fallback`) |
| S08–S13 | dřívější checklist | beze změny |
| S14 | **PDF citace po H** | pointer výběr + `browser.keys('H')`, `.md`, highlight, panel, Citace |
| S15 | **EPUB citace po H** | stejný UI flow; klik jinam bez H nesmí přidat citaci |
| S19 | **MOBI text + citace po H** | karta `data-kind="mobi"` + `renderInfo` + pointer + **H** |
| S20 | citace knihy A ≠ panel knihy B | `smoke_read_library_text` + panel |
| S21 | **Autor** | `#reader-author` → `knihy/<slug>.md` + chipy panel + záložka Citace |
| S22 | poznámka k citaci | `textarea[data-quote-comment]` + `reloadSession` |
| S23 | PDF stránka + counter | 2stránkový fixture, `reader-page-counter` `2/2`, label `str. 2` |
| S16–S17 | wikilink, dialog | smoke API (ne citace) |

**Citace se v smoke netestují přes `createPdfQuoteFromSelection` / `createEpubQuoteFromSelection`.** Rust invoke slouží jen k ověření souborů na disku (`smoke_list_quote_files`, `smoke_read_library_text`).

## Nepoužívat web build jako důkaz desktopu

Playwright `test:e2e` běží na **Vite preview** (web parita). Desktop regressions chytá výhradně **installed-app** job výše.