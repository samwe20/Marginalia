# Funkční testovací plán — Marginália (prototype)

Účel: ověřit reálné uživatelské scénáře čtení, zvýrazňování, citací, poznámek a wikilinků. Plán rozlišuje **automatizované** (CI / Playwright / Vitest / `cargo test`) a **manuální** (desktop installer, OneDrive, změna velikosti okna).

Verze pod stromem: **0.1.0-prototype.4** (`develop`).

## 1. Instalace a první spuštění

| ID | Scénář | Očekávání | Automatizace |
|----|--------|-----------|--------------|
| IN-01 | Instalace NSIS `.exe` na Windows 11 | Aplikace se nainstaluje bez chyby, zástupce funguje | **Manuální** (Jan) |
| IN-02 | První běh bez knihovny | Výzva k výběru složky knihovny, prázdná knihovna | **Manuální** |
| IN-03 | Výběr složky (lokální disk) | Cesta se zobrazí v Nastavení, FS scope bez chyby | **Manuální** (Tauri dialog) |

## 2. Otevření knih — PDF a EPUB

| ID | Scénář | Očekávání | Automatizace |
|----|--------|-----------|--------------|
| BK-01 | Otevřít `sample.pdf` | Reader se vykreslí, textová vrstva k dispozici | **E2E** harness `runPdfHighlightRestoreTest` |
| BK-02 | Otevřít `sample.epub` | `foliate-view` v readeru | **E2E** `highlight-restore.spec.ts` |
| BK-03 | Přetáhnout soubor do drop zóny | Stejné jako dialog Otevřít | **Manuální** |
| BK-04 | Nedávno otevřené knihy | Karta v knihovně po opětovném startu | **Manuální** (desktop) |

## 3. Zvýraznění → citace → soubor `.md`

| ID | Scénář | Očekávání | Automatizace |
|----|--------|-----------|--------------|
| HL-01 | PDF: zvýraznit text (režim Zvýrazňovat) | Citace uložena, anchor v metadata | **E2E** harness (uložení + obnova overlay) |
| HL-02 | PDF: znovuotevření knihy | Zvýraznění / citace obnoveny z úložiště | **E2E** harness |
| HL-03 | EPUB: zvýraznit a uložit | `.md` citace v knihovně + záznam v indexu | **Manuální** (chybí E2E pro EPUB highlight) |
| HL-04 | Citace s osobní poznámkou (markdown) | Wikilinks v poznámce klikatelné v detailu | **E2E** (demo citace + backlinks); plný `.md` na disku **manuální** |
| HL-05 | Změna velikosti okna / fontu readeru | Anchory PDF/EPUB drží pozici | **Manuální** |

## 4. Poznámky (samostatné)

| ID | Scénář | Očekávání | Automatizace |
|----|--------|-----------|--------------|
| NT-01 | Route **Poznámky**, seznam + editor | CodeMirror + náhled, ukládání do `poznamky/` | **E2E** (web: localStorage); **manuální** desktop soubory |
| NT-02 | Nová poznámka | Soubor v knihovně, objeví se v indexu | **E2E** (nevyřešený odkaz → create); desktop soubor **manuální** |
| NT-03 | Ukázkové poznámky (demo) | Po načtení demo viditelné, editace demo neukládá na disk | **E2E** |

## 5. Wikilinks, autocomplete, backlinks

| ID | Scénář | Očekávání | Automatizace |
|----|--------|-----------|--------------|
| WK-01 | `[[název]]` v editoru | Náhled Folio styl, `wiki-link` / `missing` | **Vitest** `noteIndex`; vizuálně **manuální** |
| WK-02 | Autocomplete `[[` | Nabídka titulů (Folio CM extension) | **Manuální** (CodeMirror pozice) |
| WK-03 | Backlinks kniha / citace / poznámka | Panel „Odkazuje sem“ + odchozí | **E2E** demo detail + poznámky |
| WK-04 | Klik na odkaz → navigace | Kniha / citace / poznámka | **E2E** (částečně); cross-target **Vitest** `marginalia-link-index` |
| WK-05 | Nevyřešený odkaz | Confirm → nová poznámka | **E2E** `Neexistující pojem` |
| WK-06 | SQLite `links-index.sqlite` po rebuild | Shoda s in-memory grafem | **cargo test** `links::tests`, **manuální** sync po restartu |

## 6. Hledání a filtry

| ID | Scénář | Očekávání | Automatizace |
|----|--------|-----------|--------------|
| SR-01 | Globální hledání (demo) | Hit na citaci („Hamlet“) | **E2E** |
| SR-02 | FTS přes Tauri `index_search` | Výsledky z vlastní knihovny | **cargo test** `fts_search_finds_quote`; **manuální** s reálnou knihovnou |
| SR-03 | Filtr citací podle knihy / štítku / textu | Zužuje mřížku | **E2E** (štítek) |
| SR-04 | Hledání v poznámkách (FTS poznámek) | — | **Neimplementováno** — pouze demo text filter v citacích |

## 7. Ukázková data

| ID | Scénář | Očekávání | Automatizace |
|----|--------|-----------|--------------|
| DM-01 | Načíst / odstranit demo | Knihovna, citace, poznámky, index | **E2E** |
| DM-02 | Demo nemění uživatelovy soubory | Žádné zápisy mimo localStorage / demo payload | **Manuální** |

## 8. Vzhled a klávesnice

| ID | Scénář | Očekávání | Automatizace |
|----|--------|-----------|--------------|
| UI-01 | Světlý / tmavý režim | `data-theme`, systémové preference | **E2E** (nastavení atributu); systém **manuální** |
| UI-02 | Ctrl+O otevřít soubor | Dialog / file input | **Manuální** (Tauri) |
| UI-03 | Ctrl+F hledání | Route Hledat, focus input | **E2E** |
| UI-04 | Esc v readeru | Skrytí panelu citací | **Manuální** |

## 9. Synchronizace knihovny (OneDrive / externí úpravy)

| ID | Scénář | Očekávání | Automatizace |
|----|--------|-----------|--------------|
| SY-01 | Knihovna v OneDrive | Soubory `.md` citací a poznámek synchronizují | **Manuální** (Jan) |
| SY-02 | Úprava `.md` mimo aplikaci → restart | Změny viditelné po `index_rebuild` / otevření | **Manuální** |
| SY-03 | Přidání knihy do složky zvenku | Objeví se po indexaci | **Manuální** |

## 10. Perzistence po restartu

| ID | Scénář | Očekávání | Automatizace |
|----|--------|-----------|--------------|
| PE-01 | Restart aplikace | Cesta knihovny, citace, poznámky, link index | **Manuální** (installer) |
| PE-02 | Web build (`localStorage`) | Demo flag, library root string | **E2E** (nepřímé) |

---

## Automatizace v CI (`.github/workflows/marginalia.yml`)

| Job | Co pokrývá |
|-----|------------|
| `web` | `npm test`, `npm run test:e2e` (Playwright + fixtures) |
| `rust-tests` (Linux) | `cargo test` včetně FTS a `links` |
| `rust-tests-windows` | stejné na `windows-latest` |
| `windows-build` | Sestavení installeru (ne E2E desktopu) |

**Desktop E2E** (nainstalovaná NSIS app, WebdriverIO + `tauri-driver` na `windows-installed-smoke`) **gateuje** publish `develop-latest`. Web Playwright zůstává jen parita UI.

## Spuštění lokálně

```bash
npm test
npm run test:e2e
cd src-tauri && cargo test
```

## Reference

- Playwright: `tests/e2e/`
- Harness: `src/lib/e2e-harness.ts` (`?e2e=1`)
- Fixtury: `tests/fixtures/sample.pdf`, `sample.epub`