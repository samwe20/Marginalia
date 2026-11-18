# PR #21 Jan QA — progress

Branch: `cursor/integration-all-d744` · tip (stress speed fix pending) · base: `develop` · **do not merge**

## Status overview

| # | Úprava | App | Smoke | CI |
|---|--------|-----|-------|----|
| 1 | Chevron metadata | done | **S39** | green |
| 2 | Čitelné backlinky | done | **S40** | green |
| 3 | Deduplikace knih | done | **S41** | green |
| 4 | Koš + Vrátit | done | **S42** | green |
| 5 | Rozbalitelné filtry | done | **S43** | green (flake on a17b660; green on 7a4f884) |
| 6 | Stress 1000 knih | **speeding** | stress.spec | red → fix |

## Recent CI tips

| Tip | Run | web e2e | smoke | stress | exe |
|-----|-----|---------|-------|--------|-----|
| `b54c4ea` | [44211675468](https://github.com/samwe20/Marginalia/actions/runs/44211675468) | ✗ 3 ui-flows | ✓ 44/44 | ✗ | `194a4be` |
| `a17b660` | [44214977784](https://github.com/samwe20/Marginalia/actions/runs/44214977784) | ✓ | ✗ S43 flake | in progress | — |
| `7a4f884` | [44215003048](https://github.com/samwe20/Marginalia/actions/runs/44215003048) | ✓ | ✓ | in progress | — |
| `49d6340` | [44211663987](https://github.com/samwe20/Marginalia/actions/runs/44211663987) | ✗ (pre e2e fix) | ✓ | ✗ | `5f695c4` |

### e2e (fixed in `a17b660`)
Demo Quotes grid hidden when `libraryRoot` alone forced user chrome. Condition: Filtry when `libraryRoot && (userQuotes>0 || !demo)`.

### Stress failure (poll tips `49d6340` / `b54c4ea`)

Partial metrics (scan too slow; desktop-store write per book + yield-every-book):

| metric | 49d6340 | b54c4ea |
|--------|---------|---------|
| expectedBooks | 1000 | 1000 |
| books after timeout | 331 | 436 |
| quotes | 5000 | 5000 |
| notes | 500 | 500 |
| duplicateSlug/Sha | 0 | 0 |
| T01 | fail — still running after 720s | same |
| T03 | pass | pass |

**Fix now:** batch `pushRecent` (persist once after scan), path fast-path skip re-hash on rescan, yield every 8 books, progress on `libraryScanJob`, harden S43 waits via `browser.execute`.

## Smoke coverage Jan 1–5

| # | Feature | Id |
|---|---------|-----|
| 1 | Chevron | S39 |
| 2 | Backlink | S40 |
| 3 | Dedupe | S41 |
| 4 | Trash+Vrátit | S42 |
| 5 | Filtry | S43 |

## Next

- Push stress speed fix → green smoke + stress metrics table with real ms.
