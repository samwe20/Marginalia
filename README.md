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

Na větvi `develop` po úspěšném běhu CI najdete instalační `.exe` v artefaktu workflow **Marginalia checks** (job `windows-build`, artefakt `marginalia-windows-installer`, platnost cca 30 dní).

1. Otevřete příslušný běh v GitHub Actions u pushnutého commitu na `develop`.
2. Stáhněte artefakt `marginalia-windows-installer` (soubor NSIS `*-setup.exe`).
3. Spusťte instalátor. U nepodepsané sestavy Windows může zobrazit SmartScreen — zvolte **Další informace** → **Přesto spustit**.

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