<div align="center">

# Marginalia

**A Windows desktop app** for reading books (PDF, EPUB), saving quotes, writing notes, and linking ideas with `[[wiki links]]` — UI patterns inspired by [Folio](https://github.com/samwe20/Folio).

> ### WORK IN PROGRESS
>
> **Early prototype in active development.** A **personal project** for serious reading — **not a commercial product**, no stable release, and behaviour may change without notice. Installers from `develop` are for the author and willing testers only.

[![Windows CI](https://github.com/samwe20/Marginalia/actions/workflows/marginalia.yml/badge.svg?branch=develop)](https://github.com/samwe20/Marginalia/actions/workflows/marginalia.yml)
[![Stack](https://img.shields.io/badge/stack-Tauri%202%20·%20Vite%20·%20TypeScript-333)](https://tauri.app/)

**[Test build from `develop`](#test-installer)** · [Quick start](#quick-start) · [Library folder](#library-folder)

</div>

---

## The problem

If you read a lot, you collect **quotes, highlights, and insights** across many books. Sooner or later you ask:

- How do I **find** that passage again?
- How do I **connect** an idea in one book to another?
- How do I **navigate** my own notes so they stay oriented, not scattered?

Marginalia is a small Windows app that treats a reading library as **linked notes on disk**, not a pile of forgotten marks.

---

## What Marginalia does

**Marginalia** is built with **[Tauri 2](https://tauri.app/)** for **Windows 10/11**. It answers the questions above by combining a reader with a plain-folder library:

| Need | In the app |
|------|------------|
| Remember where a quote came from | Highlights become **quotes** saved as Markdown with **source metadata** (book, page or EPUB CFI, date) |
| Connect ideas across books | **Notes** in Markdown with `[[wiki links]]`, autocomplete, and jump-to navigation |
| See what points here | **Odkazuje sem** panel — **backlinks** to incoming links (same idea as Folio) |
| Search the pile | **Full-text search** over quotes from your library (local SQLite index) |
| Own your data | **Offline** library folder you choose (e.g. in OneDrive) — no built-in cloud |

Under the hood: **PDF.js** and **foliate-js** for reading; quote and book cards as **Markdown + YAML** on disk; quote and link indexes in **local SQLite**.

---

## [Folio](https://github.com/samwe20/Folio)

Marginalia is a **standalone app** today. [Folio](https://github.com/samwe20/Folio) is a calm Markdown editor with `[[wiki links]]` and backlinks — a **design reference** for minimal, functional UI and linking behaviour.

**A future connection between Marginalia and Folio is planned.** The exact shape of that integration is **not decided yet** and is **not** shipped in this repo.

---

## Features on `develop`

This reflects branch **`develop`** at the time of this README. Open pull requests **#15–#18** describe work that is **not merged** yet — after merge, `develop` will differ.

### Working in the prototype

| Area | Status |
|------|--------|
| **Platform** | Windows 10/11, Tauri 2 + WebView2 |
| **Formats** | **PDF** and **EPUB** — read and navigate in-app |
| **Highlights → quotes** | **Highlight** mode; selected text is saved to the library (“Quote saved” toast) |
| **On-disk quotes** | `citace/<book-slug>/<ULID>.md` — YAML + blockquote; book card `knihy/<slug>.md` |
| **Notes** | Standalone `.md` notes, CodeMirror editor |
| **Wiki links** | `[[title]]`, autocomplete, open existing or create a new note |
| **Backlinks** | **Odkazuje sem** on notes, books, and quotes |
| **Quote browser** | Grid and filters (book, tag, text); optional demo data for UI preview |
| **Search** | FTS for **quotes** from your library; notes search is still limited / demo-oriented |
| **Library** | Pick a folder in Settings; books on disk + recents in UI; **offline** |
| **Covers in UI** | Typographic initials on demo books; user books show a title initial for now |
| **CI & tests** | Vitest, Playwright e2e, Windows installed smoke (WebdriverIO) |

### Known limits on `develop`

- **Prototype** — reader and import behaviour still change often.
- **No MOBI** on `develop` (PDF and EPUB only).
- **Author** field exists on book cards but is often empty until metadata is filled in.
- Quotes are saved when you **finish a highlight stroke**, not yet via a dedicated **H** hotkey (see PR #16).
- **Full-text search across all notes** is marked **not implemented** in the test plan.

### In open PRs (not merged)

| PR | Topic | Note |
|----|--------|------|
| [#15](https://github.com/samwe20/Marginalia/pull/15) | Library entry dialog, scan/import books from folder, reader chrome and quote panel fixes | Awaiting approval |
| [#16](https://github.com/samwe20/Marginalia/pull/16) | **MOBI/AZW**, quote save with **H**, EPUB/MOBI reading modes, highlight restore, notes and wiki links | Awaiting approval |
| [#17](https://github.com/samwe20/Marginalia/pull/17) | App icon — **concept C** (page, highlight, backlink) | Awaiting review; **not** on `develop` |
| [#18](https://github.com/samwe20/Marginalia/pull/18) | **Bibliography**, offline metadata prefill, citations (informal / **CSN ISO 690** / **APA 7**), covers from EPUB/MOBI/PDF | Awaiting approval |

---

## Quick start

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

---

## Test installer

Pushes to `develop` publish a **pre-release** asset (`develop-latest` — test build, not a stable “latest”):

`https://github.com/samwe20/Marginalia/releases/download/develop-latest/Marginalia-<version>-test-<short-sha>-setup.exe`

The filename changes every build (version from `package.json` / `tauri.conf.json`, SHA from the commit). See [develop-latest](https://github.com/samwe20/Marginalia/releases/tag/develop-latest) for the current `Marginalia-*-test-*-setup.exe` asset.

Unsigned builds may trigger Windows SmartScreen — **More info** → **Run anyway**.

---

## Library folder

In the folder you choose (e.g. synced with OneDrive):

| Path | Contents |
|------|----------|
| `knihy/<book-slug>.md` | Book card (title, author, file path, hash) |
| `citace/<book-slug>/<ULID>.md` | One quote — YAML front matter + quoted text |
| `poznamky/*.md` | Free-standing notes with wiki links |

Quote and link indexes live in app-local SQLite (rebuildable).

---

## Tests

```bash
npm test
npm run test:e2e
```

On Windows: `npm run test:desktop-smoke` (requires a built installer as in CI). Details: [docs/testing/](docs/testing/).

---

## Git workflow

`feature/*` or `cursor/*` → **`develop`** (test builds, smoke) → later PR to **`main`**. Significant merges are approved by Jan.

---

## License

No license file in the repo yet — personal prototype; wider use is not expected for now.