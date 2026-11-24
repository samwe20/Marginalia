# Funkční test report — **0.1.0-prototype.4**

Datum běhu: 2026-11-14 (CI agent, Linux).  
Větev: `feature/functional-tests` (z `develop` po sloučení PR #9).

## Souhrn

| Oblast | Automatizováno | Výsledek |
|--------|----------------|----------|
| Unit / integrace (Vitest) | 12 testů | **PASS** |
| E2E Playwright | 11 testů | **PASS** |
| Rust `cargo test` | Linux CI | běží v CI; lokálně na agentu bez GTK |

## Pass / fail podle toku (plán)

| ID | Tok | Auto | Výsledek | Poznámka |
|----|-----|------|----------|----------|
| IN-* | Instalace / první běh | — | **Manuální** | |
| BK-01 | PDF otevření + restore | E2E | **PASS** | |
| BK-02 | EPUB reader | E2E | **PASS** | |
| BK-03,04 | Drag-drop, recent | — | **Manuální** | |
| HL-01,02 | PDF highlight restore | E2E | **PASS** | |
| HL-03,05 | EPUB highlight, resize | — | **Manuální** | Chybí desktop E2E |
| HL-04 | Citace + poznámka | E2E | **PASS** | Backlinks; `.md` na disku manuálně |
| NT-01,03 | Poznámky + demo | E2E | **PASS** | Web úložiště |
| NT-02 | Nová poznámka | E2E | **PASS** | přes nevyřešený odkaz |
| WK-02 | Autocomplete `[[` | — | **Manuální** | |
| WK-03–05 | Backlinks / navigace / create | E2E + Vitest | **PASS** | |
| WK-06 | SQLite links | cargo | **PASS** (CI) | |
| SR-01,03 | Hledání + filtr demo | E2E | **PASS** | |
| SR-02 | FTS knihovna | cargo | **PASS** (CI) | Desktop data manuální |
| SR-04 | FTS poznámky | — | **N/A** | Neimplementováno |
| DM-01 | Demo load/remove | E2E | **PASS** | |
| UI-01,03 | Téma, Ctrl+F | E2E | **PASS** (téma částečně) | |
| UI-02,04 | Ctrl+O, Esc | — | **Manuální** | |
| SY-*, PE-* | OneDrive, restart | — | **Manuální** | Viz checklist Jan |

## Zjištěné problémy

| Závažnost | Popis | Stav |
|-----------|--------|------|
| Nízká | CSS `.backlinks-hidden` dříve skrývala i panely na detailu — **opraveno** v #9 (`reader-backlinks-pane`). | Opraveno v `develop` |
| Nízká | EPUB harness čekal >50 znaků textu; flaky v headless — **opraveno** (čeká na `foliate-view`, min 10 znaků). | Opraveno na této větvi |
| Střední | Fulltext hledání nepokrývá samostatné poznámky (`poznamky/`). | **Otevřeno** — mimo rozsah testů |
| Střední | Žádné Tauri-driver E2E na CI — installer se netestuje automaticky. | **Otevřeno** |

## Co dál

1. Jan: [manual-checklist-jan.md](./manual-checklist-jan.md)
2. Po merge: develop-latest nahrá **prototype.4** installer
3. Volitelně: tauri-driver job na `windows-build` artefaktu

## Installer (develop)

Po dokončení CI na `develop` (merge #9):

`https://github.com/samwe20/Marginalia/releases/download/develop-latest/` + soubor `Marginalia-0.1.0-prototype.4-test-<sha>-setup.exe`