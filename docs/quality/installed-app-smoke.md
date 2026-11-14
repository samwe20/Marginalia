# Instalovaná app — povinný smoke (Windows)

## CI

- Job **`windows-installed-smoke`** (závisí na `windows-build`):
  1. Stáhne NSIS artefakt z CI buildu.
  2. Tichá instalace: `/S /D=%LOCALAPPDATA%\MarginaliaSmoke`.
  3. Spustí **nainstalovaný** `Marginalia.exe` přes **tauri-driver** + **WebdriverIO** (`@wdio/tauri-service`, `driverProvider: official`, Edge WebDriver).
  4. `MARGINALIA_SMOKE=1` povolí Rust/front-end hooky (obejití nativního dialogu, Ctrl+O → fixture PDF).

- Job **`windows-develop-release`** publikuje `develop-latest` **jen pokud** smoke projde (`needs: [windows-build, windows-installed-smoke]`).

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
| S03/S04 | PDF tlačítko + Ctrl+O | `smoke_open_book` + smoke Ctrl+O → fixture |
| S05–S06 | výběr textu, knihovna | WDIO výběr v `.textLayer`, reopen karta |
| S07 | EPUB | `smoke_open_book` |
| S02 | motiv | Nastavení → data-theme-pref |
| S09 | hledání | `#search-input` |
| S10 | demo data | `#btn-demo-load` / `#btn-demo-remove` |
| S12 | restart | `browser.reloadSession()` |

Rozšíření (highlight → `.md`, EPUB výběr myší, D&D, wikilink drill-down) se doplňují ve stejném `tests/desktop/specs/smoke.spec.ts` — **green status platí jen pro to, co spec skutečně assertuje**.

## Nepoužívat web build jako důkaz desktopu

Playwright `test:e2e` běží na **Vite preview** (web parita). Desktop regressions chytá výhradně **installed-app** job výše.