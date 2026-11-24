# PR #21 Jan QA — progress

Branch: `cursor/integration-all-d744` · tip `932733d` · base: `develop` · **do not merge**

## Status overview

| # | Úprava | Smoke | CI |
|---|--------|-------|-----|
| 1 | Chevron | **S39** | pending tip |
| 2 | Backlink citace | **S40** | pending tip |
| 3 | Deduplikace | **S41** | pending tip |
| 4 | Koš + Vrátit | **S42** | pending tip |
| 5 | Filtry | **S43** | pending tip |
| 6 | Stress 1000 knih | stress.spec | **watching** [44223050094](https://github.com/samwe20/Marginalia/actions/runs/44223050094) |

## Failed baseline — [44217431406](https://github.com/samwe20/Marginalia/actions/runs/44217431406) @ `2e2323a`

Smoke **44/44** ✓ · Stress ✗ (~34 min)

| metric | value | expected | result |
|--------|-------|----------|--------|
| T01 books @ timeout | 403 | 1000 | ✗ (~0.5 book/s) |
| quotes / notes | 5000 / 500 | ≥5000 / ≥500 | ✓ |
| T04/T05 book growth | 515 → 579 | stable 1000 | ✗ ghost scan overlap |

**Root causes**
1. O(n²) `findBookCardBySha256` during bulk import → fixed `5a37550`
2. Ghost scan after T01 timeout → overlapping rescans grew counts → fixed `932733d` (scan epoch + cancel)
3. Notes FTS before import + rewriting unchanged cards → fixed `932733d`

## Tip `932733d` fixes

- Scan epoch + `cancelLibraryScan` / `shouldAbort` (no overlapping imports)
- Path+sha fast-path skips re-hash + card rewrite on unchanged rescan
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

## Next

Await stress metrics from [44223050094](https://github.com/samwe20/Marginalia/actions/runs/44223050094); report real numbers; no merge.
