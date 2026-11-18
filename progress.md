# PR #21 Jan QA — progress

Branch: `cursor/integration-all-d744` · tip `abcc71a` · base: `develop` · **do not merge**

## Status overview

| # | Úprava | App | Smoke | CI |
|---|--------|-----|-------|----|
| 1 | Skrytá metadata citace (chevron) | done | S39 OK | green |
| 2 | Čitelné + klikací backlinky | done | S40 OK | green |
| 3 | Deduplikace knih (sha/path) | done | S41 OK | green |
| 4 | Mazání citací + Vrátit | done | S42 OK | green |
| 5 | Rozbalitelné filtry na Citace | done | S43 OK | green (re-verified) |
| 6 | Zátěžový CI job 1000 knih | done | stress.spec | **in progress** (multiple runs) |

## Latest green smoke (S27/S43 fix tip)

| Tip | Run | Installer | Result |
|-----|-----|-----------|--------|
| `3bad997` | [44206694106](https://github.com/samwe20/Marginalia/actions/runs/44206694106) | `d44354a` | **44 / 44** |
| `abcc71a` (docs) | [44206767300](https://github.com/samwe20/Marginalia/actions/runs/44206767300) | `47af699` | **44 / 44** |

- Exe (tip): https://github.com/samwe20/Marginalia/releases/download/pr-21-test/Marginalia-0.1.0-test-integration-47af699-setup.exe
- Prior green: `97270ca` / `a4f8124` — [44201414247](https://github.com/samwe20/Marginalia/actions/runs/44201414247)

S27 + S43 both **PASS** after the root fixes (dataset note click; `libraryRoot` always shows Filtry chrome).

## Flake on docs-only tip `41a07cb` (run [44204509523](https://github.com/samwe20/Marginalia/actions/runs/44204509523))

Smoke **42 / 44** — same installer as green run, so not a chevron regression:

| Test | Symptom | Root cause | Fix |
|------|---------|------------|-----|
| **S27** | after restart, click `[data-note-filename="Smoke prejmenovana ….md"]` not found | WDIO CSS attr selector breaks on spaces in the renamed filename; listFilenames via `dataset` still saw the note | click via `dataset.noteFilename` equality + wait for `data-active-note-filename`; `escapeAttr` on note list attrs |
| **S43** | `#quotes-filters-toggle` missing while `#quotes-filter` exists | with `libraryRoot` set but `userQuotes.length === 0`, Quotes fell through to **demo** chrome (search only, no Filtry toggle) | always render user Quotes + expandable filters when `state.libraryRoot` is set |

## Root causes fixed along the way

1. **S27 missing `.notes-layout`:** async notes paint after `requireLibraryConfigured` left a WDIO race; sync loading shell + reader teardown.
2. **S27 renamed-note click:** CSS attribute selector + spaces in filename (see above).
3. **Book duplicates (Jan):** `ensureBookCard`/`bookSlug(title,sha)` minted a second card after bibliography rename; identity is now sha/path-stable + merge migration.
4. **S13 rescan:** `PDF_EXTRA` was identical `sample.pdf` → same sha; fixed with `sample-extra.pdf` + skip scanning managed `knihy/`.
5. **Stress mid-scan timeout:** default ~30s script timeout + O(n²) card re-reads; 20min timeout + sha index + UI yields.
6. **S43 demo Quotes chrome:** empty user quotes with library configured skipped Filtry UI (see above).

## Stress (still running)

| Run | Tip | Stress step started (UTC) | Status |
|-----|-----|---------------------------|--------|
| 44201414247 | 97270ca | 23:46:38 | in progress (~45+ min) |
| 44206694106 | 3bad997 | 00:24:46 | in progress |
| 44206767300 | abcc71a | 00:24:06 | in progress |

Next: paste metrics table when the first stress job finishes.
