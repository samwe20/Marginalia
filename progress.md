# PR #21 Jan QA — progress

Branch: `cursor/integration-all-d744` · tip (O(n²) scan fix) · base: `develop` · **do not merge**

## Status overview

| # | Úprava | Smoke | CI |
|---|--------|-------|-----|
| 1 | Chevron metadata | **S39** | green |
| 2 | Čitelné backlinky | **S40** | green |
| 3 | Deduplikace knih | **S41** | green |
| 4 | Koš + Vrátit | **S42** | green |
| 5 | Rozbalitelné filtry | **S43** | green |
| 6 | Stress 1000 knih | stress.spec | red on 2e2323a → O(n²) fix |

## Run [44217431406](https://github.com/samwe20/Marginalia/actions/runs/44217431406) — `2e2323a`

| Job | Result |
|-----|--------|
| web e2e | ✓ |
| windows-installed-smoke | ✓ **44/44** |
| windows-pr-test-release | ✓ exe `c782e8e` |
| windows-installed-stress | ✗ |

### Stress metrics (actual, incomplete)

| metric | value | threshold | result |
|--------|-------|-----------|--------|
| expectedBooks | 1000 | 1000 | — |
| books after T01 timeout | **403** | 1000 | ✗ T01 still running after 720s |
| uniqueSlugs / uniqueShas | 403 / 403 | = books | no dupes |
| duplicateSlugCount / Sha | 0 / 0 | 0 | ✓ |
| quotes | 5000 | ≥5000 | ✓ T03 |
| notes | 500 | ≥500 | ✓ T03 |
| initialScanMsMax | — | 600000 ms | not finished |
| rescanMsMax | — | 480000 ms | T04/T05 timed out mid-scan (515→579 books) |

T00 ✓ · T01 ✗ · T02 ✗ · T03 ✓ · T04 ✗ · T05 ✗ · T06 ✓

**Root cause:** each new book called `findBookCardBySha256` → full `listBookCardsWithSlugs` (O(n²) disk reads). Bulk scan now trusts the in-memory sha index (`trustCallerIdentity`).

Not measured by this stress job: covers, open book, search, filters UI, backlinks, memory.

## Smoke ↔ Jan 1–5

| # | Feature | Smoke |
|---|---------|-------|
| 1 | Chevron | S39 |
| 2 | Backlink citace | S40 |
| 3 | Deduplikace | S41 |
| 4 | Koš + Vrátit | S42 |
| 5 | Filtry | S43 |
