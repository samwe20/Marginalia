# PR #21 Jan QA — progress

Branch: `cursor/integration-all-d744` · tip (pending push) · base: `develop` · **do not merge**

## Status overview

| # | Úprava | Smoke | CI |
|---|--------|-------|-----|
| 1 | Chevron | **S39** | green |
| 2 | Backlink citace | **S40** | green |
| 3 | Deduplikace | **S41** | green |
| 4 | Koš + Vrátit | **S42** | green |
| 5 | Filtry | **S43** | green |
| 6 | Stress 1000 knih | stress.spec | fixing perf |

## Run [44217431406](https://github.com/samwe20/Marginalia/actions/runs/44217431406) — `2e2323a`

Smoke **44/44** ✓ · Stress ✗

| metric | value | threshold | result |
|--------|-------|-----------|--------|
| books @ T01 timeout | 403 | 1000 | ✗ |
| quotes / notes | 5000 / 500 | ≥5000 / ≥500 | ✓ |
| rescan progress | 515 → 579 | stable 1000 | ✗ (ghost scan overlap) |
| initialScanMsMax | — | 600000 | not finished |
| rescanMsMax | — | 480000 | timeouts |

**Root causes**
1. O(n²) `findBookCardBySha256` during bulk import (`5a37550`)
2. Ghost scan: T01 timeout left `finishLibrarySetup` running → T04/T05 started parallel rescans → book count grew 403→515→579 (not true dupes)
3. Notes FTS rebuild before import; card rewrites on unchanged identity

**Fixes in this tip**
- Scan epoch + `cancelLibraryScan` / `shouldAbort` (no overlapping imports)
- Skip card rewrite when sha/path/title/author unchanged
- Defer notes FTS until after book import
- Stress table: import/rescan ms, books, quotes, notes, JS heap MB

## Smoke ↔ Jan 1–5

| Úprava | Test |
|--------|------|
| Chevron | S39 |
| Backlink | S40 |
| Deduplikace | S41 |
| Koš + Vrátit | S42 |
| Filtry | S43 |
