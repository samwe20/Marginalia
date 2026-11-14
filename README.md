# Marginália

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