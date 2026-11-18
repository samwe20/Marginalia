# PR #21 Jan QA — progress

Branch: `cursor/integration-all-d744` · tip (pending stress fix) · base: `develop` · **do not merge**

## Status overview

| # | Úprava | App | Smoke | CI |
|---|--------|-----|-------|----|
| 1 | Skrytá metadata citace (chevron) | done | S39 OK | green |
| 2 | Čitelné + klikací backlinky | done | S40 OK | green |
| 3 | Deduplikace knih (sha/path) | done | S41 OK | green |
| 4 | Mazání citací + Vrátit | done | S42 OK | green |
| 5 | Rozbalitelné filtry na Citace | done | S43 OK | green |
| 6 | Zátěžový CI job 1000 knih | **fixing** | stress.spec | red on 44201414247 → fix pushed |

## Latest green smoke (S27/S43 fix tip)

| Tip | Run | Installer | Result |
|-----|-----|-----------|--------|
| `3bad997` | [44206694106](https://github.com/samwe20/Marginalia/actions/runs/44206694106) | `d44354a` | **44 / 44** |
| `abcc71a` (docs) | [44206767300](https://github.com/samwe20/Marginalia/actions/runs/44206767300) | `47af699` | **44 / 44** |

- Exe (tip): https://github.com/samwe20/Marginalia/releases/download/pr-21-test/Marginalia-0.1.0-test-integration-47af699-setup.exe

## Stress failure on [44201414247](https://github.com/samwe20/Marginalia/actions/runs/44201414247) (`97270ca`)

- **Root cause:** T01 called `finishLibrarySetup` inside one `browser.execute`. Scanning ~1000 books blocks the WebView longer than WDIO `connectionRetryTimeout` (180s) → `Request timed out` on `execute/async`. T02–T05 then hung on a dead session; suite aborted at 60 min; no `stress-metrics.json` written.
- **Not** a softened threshold — same expected book/quote/note counts.
- **Fix:** `startLibrarySetupScan` / `startRescanBooks` + `libraryScanJob` poll (short executes); yield every book via `setTimeout(0)`; `libraryContentCounts` counts `.md` files without parsing bodies; write metrics after each test.

## Flake on docs-only tip `41a07cb` (fixed in `3bad997`)

| Test | Root cause | Fix |
|------|------------|-----|
| **S27** | CSS attr selector breaks on spaces in renamed note filename | dataset click + `escapeAttr` |
| **S43** | empty user quotes → demo Quotes chrome without Filtry toggle | always user Filtry when `libraryRoot` set |

## Root causes fixed along the way

1. S27 missing `.notes-layout` — sync loading shell.
2. S27 renamed-note click — spaces in filename.
3. Book duplicates — sha/path identity + merge.
4. S13 — unique `sample-extra.pdf` + skip `knihy/`.
5. Stress script timeout / O(n²) — sha index + yields (earlier).
6. S43 demo Quotes chrome.
7. **Stress WDIO hang** — long scan must not live inside one execute (above).

## Next

- Re-run `windows-installed-stress` on the stress-fix tip; paste metrics table here.
