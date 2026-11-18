import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepareWebLibrary } from "./helpers";

const fixtures = join(process.cwd(), "tests", "fixtures");

test.describe("highlight persistence", () => {
  test("PDF quote restore via harness API", async ({ page }) => {
    const pdf = readFileSync(join(fixtures, "sample.pdf"));
    await page.route("**/fixtures/sample.pdf", (route) =>
      route.fulfill({ body: pdf, contentType: "application/pdf" }),
    );
    await page.goto("/?e2e=1");
    const result = await page.evaluate(() =>
      window.__marginaliaE2E!.runPdfHighlightRestoreTest("/fixtures/sample.pdf"),
    );
    expect(result.saved).toBe(true);
    expect(result.painted).toBeGreaterThan(0);
    expect(result.paintedVisible, JSON.stringify(result)).toBe(true);
    expect(result.restoredCount).toBeGreaterThan(0);
    expect(result.restoredVisible).toBe(true);
  });

  test("EPUB opens in app without error", async ({ page }) => {
    await prepareWebLibrary(page);
    await page.locator("#file-open").setInputFiles(join(fixtures, "sample.epub"));
    await expect(page.locator("#epub-root foliate-view")).toHaveCount(1, { timeout: 60_000 });
    const status = await page.locator("#status").textContent();
    expect(status ?? "").not.toMatch(/error/i);
  });

  for (const [kind, fixture, contentType] of [
    ["EPUB", "sample.epub", "application/epub+zip"],
    ["MOBI", "hamlet-pg1524.mobi", "application/x-mobipocket-ebook"],
  ] as const) {
    test(`${kind} paints in the foliate overlay and restores after reopen`, async ({ page }) => {
      const body = readFileSync(join(fixtures, fixture));
      const url = `/fixtures/highlight-${fixture}`;
      await page.route(`**${url}`, (route) => route.fulfill({ body, contentType }));
      await page.goto("/?e2e=1");
      const result = await page.evaluate(
        ([bookUrl, fileName]) =>
          window.__marginaliaE2E!.runEpubHighlightRestoreTest(bookUrl, fileName),
        [url, fixture] as const,
      );
      expect(result.cfi).toMatch(/^epubcfi\(/);
      expect(result.painted).toBeGreaterThan(0);
      expect(result.restored).toBeGreaterThan(0);
    });
  }

  for (const [kind, fixture, cardKind] of [
    ["PDF", "sample.pdf", "pdf"],
    ["EPUB", "sample.epub", "epub"],
    ["MOBI", "hamlet-pg1524.mobi", "mobi"],
  ] as const) {
    test(`${kind} app wiring paints a saved quote and restores it from storage`, async ({ page }) => {
      await prepareWebLibrary(page);
      await page.locator("#file-open").setInputFiles(join(fixtures, fixture));
      if (kind === "PDF") {
        await expect(page.locator('#pdf-root[data-pdf-text-ready="1"]')).toBeAttached({ timeout: 60_000 });
        await page.evaluate(() => window.__MARGINALIA_SMOKE_API__!.createPdfQuoteFromSelection());
      } else {
        await expect
          .poll(() => page.evaluate(() => window.__MARGINALIA_SMOKE_API__!.epubViewportVisibleTextLength()))
          .toBeGreaterThan(3);
        await page.evaluate(() => window.__MARGINALIA_SMOKE_API__!.createEpubQuoteFromSelection());
      }
      await expect
        .poll(() => page.evaluate(() => window.__MARGINALIA_SMOKE_API__!.readerHighlightPaintCount()))
        .toBeGreaterThan(0);

      await page.locator("#btn-back-library").click();
      await expect(page.locator("[data-library-ready='1']")).toBeVisible({ timeout: 15_000 });
      const card = page.locator(`.book-card[data-kind="${cardKind}"]`).first();
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.click();
      await expect
        .poll(() => page.evaluate(() => window.__MARGINALIA_SMOKE_API__!.readerHighlightPaintCount()), {
          timeout: 60_000,
        })
        .toBeGreaterThan(0);
    });
  }
});