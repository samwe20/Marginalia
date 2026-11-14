# Marginália

Soukromá aplikace pro Windows na správu citací a poznámek z knih.

## Co umí

- Otevírá knihy ve formátech PDF, EPUB a dalších.
- V textu se dají vybírat citace a úryvky.
- Každá citace se automaticky uloží s metadaty: kniha, autor, stránka a datum.
- Ke citacím jde psát vlastní komentáře.
- Citace se dají propojovat mezi sebou napříč knihami.

## Proč

Nahrazuje práci s citacemi v Notability na iPadu a přidává to, co tam chybí: vrstvu nad poznámkami, kde se citace propojují a dají se dohledat.

## Stav

Projekt je na začátku. Aplikace je čistě pro soukromé použití a není určená k prodeji.

Prototype Windows app (Tauri 2) for PDF/EPUB reading, highlighting, and Markdown quote files in a user-chosen library folder.

## Build and run (Windows)

Prerequisites: [Tauri prerequisites](https://tauri.app/start/prerequisites/) on Windows (Rust, WebView2, Visual Studio build tools).

```powershell
git clone https://github.com/samwe20/Marginalia.git
cd Marginalia
git checkout develop
npm ci
npm run desktop:dev
```

Installer build:

```powershell
npm run desktop:build:windows
```

Output: `src-tauri/target/release/bundle/nsis/`.

## Instalace testovací verze

Po pushi na `develop` CI zveřejní instalační soubor jako **předběžné vydání** (`develop-latest`, pouze test build, není „latest“):

`https://github.com/samwe20/Marginalia/releases/download/develop-latest/Marginalia-<verze>-test-<krátký-sha>-setup.exe`

Název se mění s každým buildem (verze z `package.json` / `tauri.conf.json`, SHA z commitu). Aktuální přímý odkaz je v release [develop-latest](https://github.com/samwe20/Marginalia/releases/tag/develop-latest) u assetu `Marginalia-*-test-*-setup.exe`.

U nepodepsané sestavy Windows může SmartScreen zobrazit varování — **Další informace** → **Přesto spustit**.

## Library layout

Under the folder you pick (e.g. in OneDrive):

- `knihy/<book-slug>.md` — book card
- `citace/<book-slug>/<ULID>.md` — one quote per file (YAML + blockquote)

FTS index: SQLite in app local data (rebuildable).

## Tests

```bash
npm test
npm run test:e2e
```

## Git workflow

`feature/*` → `develop` → (later) PR to `main`.