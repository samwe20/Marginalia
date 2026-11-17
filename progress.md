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
- _(pending push)_ — sync notes loading shell + destroy readers on leave + restore strict S27

## Next

1. Push S27 root fix.
2. Wait for green `windows-installed-smoke` (S27 + S39–S43) → exe release.
3. Collect `windows-installed-stress` metrics table into this file.
