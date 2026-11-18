# PR #21 Jan QA — progress

Branch: `cursor/integration-all-d744` · tip `a17b660` · base: `develop` · **do not merge**

## Status overview

| # | Úprava | App | Smoke | CI |
|---|--------|-----|-------|----|
| 1 | Skrytá metadata citace (chevron) | done | **S39** | green |
| 2 | Čitelné + klikací backlinky | done | **S40** | green |
| 3 | Deduplikace knih (sha/path) | done | **S41** | green |
| 4 | Mazání citací + Vrátit | done | **S42** | green |
| 5 | Rozbalitelné filtry na Citace | done | **S43** | green |
| 6 | Zátěžový CI job 1000 knih | done (poll fix) | stress.spec | **in progress** |

## Run [44211675468](https://github.com/samwe20/Marginalia/actions/runs/44211675468) — tip `b54c4ea`

| Job | Result |
|-----|--------|
| rust-tests / rust-tests-windows / cargo-audit | success |
| windows-build | success (installer short sha `194a4be`) |
| **web** (`npm run test:e2e`) | **FAILED** — 3 Playwright ui-flows |
| windows-installed-smoke | **success** (44/44 expected; Jan S39–S43 covered) |
| windows-pr-test-release | success → exe `…-194a4be-setup.exe` |
| windows-installed-stress | **in progress** |

### e2e failure root cause (fixed)

Web e2e sets `libraryRoot=/Marginalia` + demo data. The S43 fix used `if (state.libraryRoot)` alone → always user Quotes chrome (`0 citací`, Filtry) and hid demo `.quote-db-grid` / `[data-demo-quote]`.

Failed tests:
1. `citace: filtr podle štítku` — missing `.quote-db-grid`
2. `detail citace: wikilinks…` — missing `[data-demo-quote='demo-q007']`
3. `hledání na stránce Citace` — missing `.quote-db-card`

**Fix:** user Filtry chrome when `libraryRoot && (userQuotes.length > 0 || !isDemoEnabled())`; demo grid when demo is on and there are no user quotes. S43 still gets Filtry on installed smoke (demo off). Local: `ui-flows.spec.ts` **9/9** pass.

## Installed smoke coverage (Jan 1–5)

| # | Feature | Smoke id | Asserts |
|---|---------|----------|---------|
| 1 | Chevron metadata in reader | S39 | collapse/expand meta |
| 2 | Readable clickable quote backlink | S40 | preview text, no ULID, opens reader |
| 3 | Book dedupe | S41 | bibliography rename + rescan → 1 card |
| 4 | Trash + Vrátit | S42 | delete + undo persists restart |
| 5 | Expandable Quotes filters | S43 | `#quotes-filters-toggle` / panel / clear |

## Stress job

- Generator: **1000** books, ~5000 quotes, ~500 notes (`generate-stress-library.mjs`).
- Suite prints `=== stress metrics table ===` and writes `stress-metrics.json` (T00–T06).
- Poll fix `49d6340`: scan no longer trapped in one WebDriver execute.
- Waiting for first green stress run → paste real numbers here.

## Exe (this tip)

https://github.com/samwe20/Marginalia/releases/download/pr-21-test/Marginalia-0.1.0-test-integration-194a4be-setup.exe
