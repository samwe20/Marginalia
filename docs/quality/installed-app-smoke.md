# Instalovaná app — povinný smoke (Windows)

## CI

- Job **`windows-installed-smoke`** (závisí na `windows-build`):
  1. Stáhne NSIS artefakt z CI buildu.
  2. Tichá instalace: `/S /D=%LOCALAPPDATA%\MarginaliaSmoke`.
  3. Spustí **nainstalovaný** binár přes **tauri-driver** + **WebdriverIO** (`driverProvider: external`, Edge WebDriver). Na GHA jde harness přes **gsudo --integrity Medium** (WebView2 při High Integrity neotevře DevTools port).
  4. `MARGINALIA_SMOKE=1` povolí Rust/front-end hooky (obejití nativního dialogu, Ctrl+O → fixture PDF).

- Job **`windows-develop-release`** publikuje `develop-latest` **jen pokud** smoke projde (`needs: [windows-build, windows-installed-smoke]`).

- **Striktní gate:** `scripts/ci/windows-installed-smoke.ps1` selže, pokud libovolný řádek v `smoke-results.json` má `ok: false` (S01–S17).

## Příkazy lokálně (Windows)

```powershell
$env:INSTALLER_PATH = ".\Marginalia-0.1.0-prototype.5-test-xxxxxxx-setup.exe"
cargo install tauri-driver --locked
npm ci
./scripts/ci/windows-installed-smoke.ps1
```

Výstupy: `test-results/desktop-smoke/` (screenshoty, `smoke-results.json`).

## Mapování na Janův checklist

| ID | Požadavek | Automatizace |
|----|-----------|--------------|
| S01 | Knihovna / shell | `[data-route="library"]` |
| S02 | motiv | Nastavení → `data-theme-pref` |
| S03/S04 | PDF tlačítko + Ctrl+O | `smoke_open_book` + smoke Ctrl+O → fixture |
| S05–S06 | výběr textu, knihovna | WDIO výběr v `.textLayer`, reopen karta |
| S07 | EPUB | `smoke_open_book` |
| S08 | Otevřít knihu | `#btn-open-book` viditelné |
| S09 | hledání | `#search-input` (demo index) |
| S10 | demo data | `#btn-demo-load` / `#btn-demo-remove` |
| S11 | poznámky UI | `data-notes-ready` |
| S12 | restart | `browser.reloadSession()` → karta přetrvá |
| S13 | **D&D přidání** (bug #4) | `smoke_drop_book` → zavřít/znovu → restart |
| S14 | **PDF citace** | `__MARGINALIA_SMOKE_API__` + `smoke_list_quote_files` + Citace + obnova |
| S15 | **EPUB citace** | stejné pro EPUB + `mark.quote-highlight` |
| S16 | **wikilink + backlink** | `seedWikilinkBacklink` → `#panel-backlinks-list` |
| S17 | **nativní Open dialog** | `smoke_dialog_capable` + načtení `dialog` pluginu (bez automatizace okna) |

## Nepoužívat web build jako důkaz desktopu

Playwright `test:e2e` běží na **Vite preview** (web parita). Desktop regressions chytá výhradně **installed-app** job výše.