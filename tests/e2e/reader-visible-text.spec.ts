import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";
import { prepareWebLibrary } from "./helpers";

const fixtures = join(process.cwd(), "tests", "fixtures");

async function viewportVisibleChars(page: Page, minChars: number): Promise<number> {
  await expect
    .poll(
      () => page.evaluate(() => window.__MARGINALIA_SMOKE_API__?.epubViewportVisibleTextLength() ?? 0),
      { timeout: 60_000, message: "reader text visible in viewport" },
    )
    .toBeGreaterThan(minChars);
  return page.evaluate(() => window.__MARGINALIA_SMOKE_API__!.epubViewportVisibleTextLength());
}

/** The foliate renderer itself must paint the text; the plain-text fallback is only a safety net. */
async function expectFoliatePaints(page: Page) {
  const info = await page.evaluate(() => window.__MARGINALIA_SMOKE_API__!.epubReaderRenderInfo());
  expect(info.mode, JSON.stringify(info)).toBe("iframe");
}

test.describe("foliate reader paints visible text", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`multi-section MOBI (Hamlet) opens at the start with visible text (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("marginalia.themePreference", t), theme);
      await prepareWebLibrary(page);
      await page.locator("#file-open").setInputFiles(join(fixtures, "hamlet-pg1524.mobi"));
      const visible = await viewportVisibleChars(page, 100);
      const section = await page.evaluate(() => window.__MARGINALIA_SMOKE_API__!.epubCurrentSectionIndex());
      expect(section, `visible=${visible}`).toBeLessThanOrEqual(1);
      await expectFoliatePaints(page);
    });
  }

  test("EPUB fixture text is visible in the viewport", async ({ page }) => {
    await prepareWebLibrary(page);
    await page.locator("#file-open").setInputFiles(join(fixtures, "sample.epub"));
    await viewportVisibleChars(page, 3);
    await expectFoliatePaints(page);
  });
});
