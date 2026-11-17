import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";
import { prepareWebLibrary } from "./helpers";

const fixtures = join(process.cwd(), "tests", "fixtures");

type Flow = "scrolled" | "paginated";

async function viewportVisibleChars(page: Page, minChars: number): Promise<number> {
  await expect
    .poll(
      () => page.evaluate(() => window.__MARGINALIA_SMOKE_API__?.epubViewportVisibleTextLength() ?? 0),
      { timeout: 60_000, message: "reader text visible in viewport" },
    )
    .toBeGreaterThan(minChars);
  return page.evaluate(() => window.__MARGINALIA_SMOKE_API__!.epubViewportVisibleTextLength());
}

/** The foliate renderer itself must paint the text, in the chosen flow; the plain-text fallback is only a safety net. */
async function expectFoliatePaints(page: Page, flow: Flow) {
  const info = await page.evaluate(() => window.__MARGINALIA_SMOKE_API__!.epubReaderRenderInfo());
  expect(info.mode, JSON.stringify(info)).toBe("iframe");
  expect(info.flow, JSON.stringify(info)).toBe(flow);
  return info;
}

async function chooseFlow(page: Page, flow: Flow) {
  await page.locator('.nav-item[data-route="settings"]').click();
  await page.locator(`[data-reader-flow="${flow}"]`).click();
  await expect(page.locator(`[data-reader-flow="${flow}"]`)).toHaveClass(/theme-picker__btn--on/);
  await page.locator('.nav-item[data-route="library"]').click();
}

test.describe("foliate reader paints visible text", () => {
  test("scrolled is the default reading mode", async ({ page }) => {
    await prepareWebLibrary(page);
    await page.locator('.nav-item[data-route="settings"]').click();
    await expect(page.locator('[data-reader-flow="scrolled"]')).toHaveClass(/theme-picker__btn--on/);
  });

  for (const flow of ["scrolled", "paginated"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`Hamlet MOBI opens at the start with visible text (${flow}, ${theme})`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem("marginalia.themePreference", t), theme);
        await prepareWebLibrary(page);
        await chooseFlow(page, flow);
        await page.locator("#file-open").setInputFiles(join(fixtures, "hamlet-pg1524.mobi"));
        const visible = await viewportVisibleChars(page, 100);
        const section = await page.evaluate(() => window.__MARGINALIA_SMOKE_API__!.epubCurrentSectionIndex());
        expect(section, `visible=${visible}`).toBeLessThanOrEqual(1);
        const info = await expectFoliatePaints(page, flow);
        expect(info.textWidthRatio, JSON.stringify(info)).toBeGreaterThan(0.6);
        await page.locator("#btn-reader-next").click();
        await viewportVisibleChars(page, 3);
        if (flow === "scrolled") {
          await expect
            .poll(() => page.evaluate(() => window.__MARGINALIA_SMOKE_API__!.epubCurrentSectionIndex()))
            .toBeGreaterThan(section ?? 0);
        }
      });
    }

    test(`EPUB fixture text is visible in the viewport (${flow})`, async ({ page }) => {
      await prepareWebLibrary(page);
      await chooseFlow(page, flow);
      await page.locator("#file-open").setInputFiles(join(fixtures, "sample.epub"));
      await viewportVisibleChars(page, 3);
      await expectFoliatePaints(page, flow);
    });
  }

  test("reading mode choice survives reload", async ({ page }) => {
    await prepareWebLibrary(page);
    await chooseFlow(page, "paginated");
    await page.reload();
    await page.waitForSelector(".sidebar");
    await page.locator('.nav-item[data-route="settings"]').click();
    await expect(page.locator('[data-reader-flow="paginated"]')).toHaveClass(/theme-picker__btn--on/);
    await page.locator('.nav-item[data-route="library"]').click();
    await page.locator("#file-open").setInputFiles(join(fixtures, "hamlet-pg1524.mobi"));
    await viewportVisibleChars(page, 100);
    await expectFoliatePaints(page, "paginated");
  });
});
