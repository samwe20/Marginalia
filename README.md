<div align="center">

# Marginalia

**Samostatná aplikace pro Windows** — čtení knih (PDF, EPUB), citace, poznámky a propojování přes `[[wikilinky]]` ve stylu [Folio](https://github.com/samwe20/Folio) / Obsidian.

> ### WORK IN PROGRESS
>
> **Raný prototyp v aktivním vývoji.** Osobní projekt pro vlastní studium knih — **není komerční produkt**, nemá stabilní vydání a API se může měnit bez varování. Testovací instalery z `develop` jsou jen pro autora a ochotné testery.

[![Windows CI](https://github.com/samwe20/Marginalia/actions/workflows/marginalia.yml/badge.svg?branch=develop)](https://github.com/samwe20/Marginalia/actions/workflows/marginalia.yml)
[![Stack](https://img.shields.io/badge/stack-Tauri%202%20·%20Vite%20·%20TypeScript-333)](https://tauri.app/)

**[Testovací build z `develop`](#instalace-testovací-verze)** · [Rychlý start](#rychlý-start) · [Složka knihovny](#složka-knihovny)

</div>

---

## Co je Marginalia?

**Marginalia** (Marginália) je desktopová aplikace postavená na **[Tauri 2](https://tauri.app/)** pro **Windows**. Slouží ke správě **citátů a poznámek z knih** — nahrazuje workflow s citacemi v **Notability** na iPadu a přidává vrstvu nad surovými poznámkami: citace a poznámky se dají **propojovat** a **dohledávat** napříč knihovnou.

- Otevřete **PDF** nebo **EPUB** (soubor nebo kniha ve složce knihovny).
- V režimu **Zvýrazňovat** označíte úryvek — aplikace ho uloží jako **citaci** s metadaty (kniha, stránka / CFI, datum).
- K citacím a v samostatných **poznámkách** píšete v Markdownu včetně `[[Hamlet]]` — funguje **autocomplete** a panel **Odkazuje sem** (backlinky ve stylu Folia).
- Data leží v **složce, kterou zvolíte** (např. v OneDrive) — offline, bez vlastního cloudu.

Technicky: čtečka PDF (PDF.js), EPUB (foliate-js), citace a karty knih jako **Markdown + YAML** na disku, fulltext a graf odkazů v lokálním SQLite.

---

## Vztah k [Folio](https://github.com/samwe20/Folio)

Marginalia je dnes **samostatná aplikace**. [Folio](https://github.com/samwe20/Folio) je sesterský projekt — klidný Markdown editor s `[[wikilinky]]` a backlinks. Marginalia z něj přebírá **vzory UI a propojování poznámek** (čisté, minimalistické rozhraní).

**Propojení obou aplikací je do budoucna plánované** (společná knihovna nebo synchronizace poznámek). Konkrétní podoba integrace zatím není rozhodnutá — v repozitáři se neuvádí jako hotová funkce.

---

## Funkce podle stavu (`develop`)

Níže je stav větve **`develop`** k datu úpravy README. Otevřené pull requesty (#15–#18) popisují rozpracovanou práci, která **ještě není sloučená** — po mergi se liší od veřejného `develop`.

### Hotové nebo použitelné v prototypu

| Oblast | Stav |
|--------|------|
| **Platforma** | Windows 10/11, Tauri 2 + WebView2 |
| **Formáty** | **PDF** a **EPUB** — čtení, navigace v readeru |
| **Zvýraznění a citace** | Režim **Zvýrazňovat**; po označení textu se citace uloží do knihovny (toast „Citace uložena“) |
| **Soubory citací** | `citace/<slug-knihy>/<ULID>.md` — YAML + blockquote; karta knihy `knihy/<slug>.md` |
| **Poznámky** | Samostatné `.md` poznámky, editor CodeMirror, Markdown |
| **Wikilinky** | `[[název]]`, autocomplete, navigace na existující / vytvoření nové poznámky |
| **Backlinky** | Panel **Odkazuje sem** u poznámek, knih a citací (inspirace Folio) |
| **Přehled citací** | Mřížka / filtry (kniha, štítek, text); demo data pro náhled UI |
| **Hledání** | Fulltext **citací** z knihovny (Tauri SQLite); u poznámek zatím spíš demo / jednoduchý filtr |
| **Knihovna** | Volba složky v Nastavení; knihy na disku + nedávné v UI; **offline** |
| **Obálky v UI** | U demo knih typografická písmena; u vlastních knih zatím iniciála z názvu |
| **CI a testy** | Unit (Vitest), browser E2E (Playwright), Windows installed smoke (WebdriverIO) |

### Omezení a dílčí nedotaženosti

- Projekt je **prototyp** — chování readeru a importu knih se ještě mění.
- **MOBI** na `develop` **není** (jen PDF/EPUB).
- **Autor knihy** — pole v kartě knihy existuje, u importovaných souborů často zůstává prázdné, dokud se metadata nedoplní.
- Uložení citace je dnes vázané na **označení ve zvýrazňovacím režimu**, ne na samostatnou klávesu **H** (viz PR #16).
- **FTS přes všechny poznámky** v plánu testů označeno jako neimplementované.

### Rozpracováno v otevřených PR (nesloučeno)

| PR | Téma | Poznámka |
|----|------|----------|
| [#15](https://github.com/samwe20/Marginalia/pull/15) | Vstupní dialog knihovny, automatický import knih ze složky, vylepšení reader chrome a panelu citací | Čeká na schválení |
| [#16](https://github.com/samwe20/Marginalia/pull/16) | **MOBI/AZW**, uložení citace klávesou **H**, režimy čtení EPUB/MOBI, obnova zvýraznění, poznámky a wikilinky | Čeká na schválení |
| [#17](https://github.com/samwe20/Marginalia/pull/17) | Ikona aplikace — **koncept C** (stránka, zvýraznění, backlink) | Čeká na review; **není** v `develop` |
| [#18](https://github.com/samwe20/Marginalia/pull/18) | **Bibliografie**, offline předvyplnění metadat, citace **neformální / ČSN ISO 690 / APA 7**, obálky z EPUB/MOBI/PDF | Čeká na schválení |

---

## Proč vzniká

Notability na iPadu dobře slouží k označování PDF a rychlým poznámkám u textu. Chybí ale **síť nad citacemi**: propojení mezi knihami, zpětné odkazy a práce s citacemi jako se soubory v syncované složce. Marginalia to zkouší na Windows s otevřeným formátem (Markdown) a stejnou logikou wikilinků jako ve Folio.

---

## Rychlý start

Předpoklady: [Tauri prerequisites](https://tauri.app/start/prerequisites/) na Windows (Rust, WebView2, Visual Studio build tools).

```powershell
git clone https://github.com/samwe20/Marginalia.git
cd Marginalia
git checkout develop
npm ci
npm run desktop:dev
```

Sestavení instalátoru:

```powershell
npm run desktop:build:windows
```

Výstup: `src-tauri/target/release/bundle/nsis/`.

---

## Instalace testovací verze

Po pushi na `develop` CI zveřejní instalační soubor jako **předběžné vydání** (`develop-latest` — test build, ne stabilní „latest“):

`https://github.com/samwe20/Marginalia/releases/download/develop-latest/Marginalia-<verze>-test-<krátký-sha>-setup.exe`

Název se mění s každým buildem (verze z `package.json` / `tauri.conf.json`, SHA z commitu). Aktuální asset je u release [develop-latest](https://github.com/samwe20/Marginalia/releases/tag/develop-latest).

U nepodepsané sestavy může Windows SmartScreen zobrazit varování — **Další informace** → **Přesto spustit**.

---

## Složka knihovny

Ve složce, kterou zvolíte (např. v OneDrive):

| Cesta | Obsah |
|-------|--------|
| `knihy/<book-slug>.md` | Karta knihy (název, autor, cesta k souboru, hash) |
| `citace/<book-slug>/<ULID>.md` | Jedna citace — YAML front matter + citovaný text |
| `poznamky/*.md` | Volné poznámky s wikilinky |

Indexy fulltextu a odkazů: SQLite v lokálních datech aplikace (lze znovu sestavit).

---

## Testy

```bash
npm test
npm run test:e2e
```

Na Windows: `npm run test:desktop-smoke` (vyžaduje sestavený installer dle CI). Podrobněji: [docs/testing/](docs/testing/).

---

## Git workflow

`feature/*` nebo `cursor/*` → **`develop`** (test buildy, smoke) → později PR do **`main`**. Sloučení významných změn schvaluje Jan.

---

## Licence

Zatím bez explicitní licence v repozitáři — osobní prototyp; použití mimo autora zatím neočekáváme.