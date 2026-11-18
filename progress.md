# PR #21 Jan QA — progress

Branch: `cursor/integration-all-d744` · tip `97270ca` · base: `develop` · **do not merge**

## Status overview

| # | Úprava | App | Smoke | CI |
|---|--------|-----|-------|----|
| 1 | Skrytá metadata citace (chevron) | done | S39 OK | green |
| 2 | Čitelné + klikací backlinky | done | S40 OK | green |
| 3 | Deduplikace knih (sha/path) | done | S41 OK | green |
| 4 | Mazání citací + Vrátit | done | S42 OK | green |
| 5 | Rozbalitelné filtry na Citace | done | S43 OK | green |
| 6 | Zátěžový CI job 1000 knih | done | stress.spec | **in progress** on 44201414247 |

## Latest green smoke (run [44201414247](https://github.com/samwe20/Marginalia/actions/runs/44201414247))

- Commit tip: `97270ca`
- Installer merge short sha: `a4f8124`
- **PASS: 44 / 44** (S13, S27, S39–S43 all OK)
- Exe: https://github.com/samwe20/Marginalia/releases/download/pr-21-test/Marginalia-0.1.0-test-integration-a4f8124-setup.exe

## Root causes fixed along the way

1. **S27 missing `.notes-layout`:** async notes paint after `requireLibraryConfigured` left a WDIO race; sync loading shell + reader teardown.
2. **Book duplicates (Jan):** `ensureBookCard`/`bookSlug(title,sha)` minted a second card after bibliography rename; identity is now sha/path-stable + merge migration.
3. **S13 rescan:** `PDF_EXTRA` was identical `sample.pdf` → same sha; fixed with `sample-extra.pdf` + skip scanning managed `knihy/`.
4. **Stress mid-scan timeout:** default ~30s script timeout + O(n²) card re-reads; 20min timeout + sha index + UI yields.

## Next

- Wait for `windows-installed-stress` on the same run; paste metrics table here.
