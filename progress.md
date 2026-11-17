# PR #21 Jan QA — progress

Branch: `cursor/integration-all-d744` · base: `develop` · **do not merge**

## Status overview

| # | Úprava | App | Smoke | CI |
|---|--------|-----|-------|----|
| 1 | Skrytá metadata citace (chevron) | done (`fad8a88`) | S39 | passed on fad8a88 |
| 2 | Čitelné + klikací backlinky citací | done | S40 | pending green suite |
| 3 | Deduplikace knih (sha/path) | done | S41 | pending |
| 4 | Mazání citací + Vrátit | done | S42 | pending |
| 5 | Rozbalitelné filtry na Citace | done | S43 | pending |
| 6 | Zátěžový CI job 1000 knih | done (`windows-installed-stress`) | stress.spec | pending |

## S27 failure on `fad8a88` (CI 44193493387)

- **Symptom:** `waitUntil` → `Can't call getAttribute on .notes-layout` (element missing).
- **Not a chevron regression:** `fad8a88` only touched inspector quote cards / S39; notes route untouched.
- **Root cause:** `setRoute("notes")` deferred the first paint until after `await requireLibraryConfigured()`. During that gap (esp. after heavy S26 reader/restart) `.notes-layout` does not exist. WDIO `$().getAttribute` **throws** on missing nodes, so `waitUntil` aborts instead of retrying. On `40b2aab` timing usually won the race (39/39).
- **Fix (app, not softened test):** paint a synchronous `notes-layout` loading shell in `setRoute("notes")` (same pattern as Quotes), then remount via `renderNotesView`. Restore strict S27 `getAttribute` + 20s wait.

## Commits

- `fad8a88` — chevron meta collapse + S39
- `2cc0b4d` — backlinks, dedupe, delete, filters, stress CI, S40–S43
- `e3b4808` — temporary softened S27 wait (superseded)
- `631fe7c` — sync notes loading shell + destroy readers on leave + restore strict S27

## CI `5a3bd6a` (run 44198505003)

- **Smoke:** 43 passing, **1 failing = S13** (S27 + S39–S43 all green).
  - Cause: `MARGINALIA_FIXTURE_PDF_EXTRA` pointed at the same `sample.pdf` → identical sha → sha-stable identity correctly refused a 4th card (`3→3, imported=4`).
  - Fix: distinct `tests/fixtures/sample-extra.pdf` + skip scanning managed `knihy/` copies.
- **Stress:** script timeout ~30s mid-scan (~32/1000). Fix: 20min script timeout, yield during sync, O(n) sha index (was O(n²) card re-reads).

## Next

1. Pushed `35acbb3` (S13 + stress). Waiting for green smoke → exe + stress metrics table.
