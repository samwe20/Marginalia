# PR #21 Jan QA — progress

Branch: `cursor/integration-all-d744` · tip (pending push) · base: `develop` · **do not merge**

## Status overview

| # | Úprava | App | Smoke | CI |
|---|--------|-----|-------|----|
| 1 | Skrytá metadata citace (chevron) | done | S39 | green on 97270ca |
| 2 | Čitelné + klikací backlinky | done | S40 | green on 97270ca |
| 3 | Deduplikace knih (sha/path) | done | S41 | green on 97270ca |
| 4 | Mazání citací + Vrátit | done | S42 | green on 97270ca |
| 5 | Rozbalitelné filtry na Citace | done | S43 | fix after flake on 41a07cb |
| 6 | Zátěžový CI job 1000 knih | done | stress.spec | **in progress** on 44201414247 |

## Latest green smoke (run [44201414247](https://github.com/samwe20/Marginalia/actions/runs/44201414247))

- Commit tip: `97270ca`
- Installer merge short sha: `a4f8124`
- **PASS: 44 / 44** (S13, S27, S39–S43 all OK)
- Exe: https://github.com/samwe20/Marginalia/releases/download/pr-21-test/Marginalia-0.1.0-test-integration-a4f8124-setup.exe
- Stress job still running on that run (started ~00:45 UTC)

## Flake on docs-only tip `41a07cb` (run [44204509523](https://github.com/samwe20/Marginalia/actions/runs/44204509523))

Smoke **42 / 44** — same installer as green run, so not a chevron regression:

| Test | Symptom | Root cause | Fix |
|------|---------|------------|-----|
| **S27** | after restart, click `[data-note-filename="Smoke prejmenovana ….md"]` not found | WDIO CSS attr selector breaks on spaces in the renamed filename; listFilenames via `dataset` still saw the note | click via `dataset.noteFilename` equality + wait for `data-active-note-filename`; `escapeAttr` on note list attrs |
| **S43** | `#quotes-filters-toggle` missing while `#quotes-filter` exists | with `libraryRoot` set but `userQuotes.length === 0`, Quotes fell through to **demo** chrome (search only, no Filtry toggle) | always render user Quotes + expandable filters when `state.libraryRoot` is set |

Assertions were not softened — S27 still requires disk text + active note after click; S43 still requires toggle/panel/clear/aria-expanded.

## Root causes fixed along the way

1. **S27 missing `.notes-layout`:** async notes paint after `requireLibraryConfigured` left a WDIO race; sync loading shell + reader teardown.
2. **S27 renamed-note click:** CSS attribute selector + spaces in filename (see above).
3. **Book duplicates (Jan):** `ensureBookCard`/`bookSlug(title,sha)` minted a second card after bibliography rename; identity is now sha/path-stable + merge migration.
4. **S13 rescan:** `PDF_EXTRA` was identical `sample.pdf` → same sha; fixed with `sample-extra.pdf` + skip scanning managed `knihy/`.
5. **Stress mid-scan timeout:** default ~30s script timeout + O(n²) card re-reads; 20min timeout + sha index + UI yields.
6. **S43 demo Quotes chrome:** empty user quotes with library configured skipped Filtry UI (see above).

## Next

- Push S27/S43 fixes → re-run installed smoke.
- Wait for `windows-installed-stress` on 44201414247 (and/or the new tip); paste metrics table here.
