import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { expectPdfReaderTextReady, prepareWebLibrary } from "./helpers";

test.describe("theme preference", () => {
  test("světlý motiv v Nastavení", async ({ page }) => {
    await prepareWebLibrary(page);
    await page.locator('.nav-item[data-route="settings"]').click();
    await page.locator('[data-theme-pref="dark"]').click();
    await expect(page.locator("#app[data-theme='dark']")).toBeVisible();
    await page.locator('[data-theme-pref="light"]').click();
    await expect(page.locator("#app[data-theme='light']")).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem("marginalia.themePreference"));
    expect(stored).toBe("light");
  });
});

test.describe("reopen recent book", () => {
  test.beforeEach(async ({ page }) => {
    await prepareWebLibrary(page);
  });

  test("kniha zůstane v knihovně po zavření readeru", async ({ page }) => {
    await page.locator("#file-open").setInputFiles(join(process.cwd(), "tests", "fixtures", "sample.pdf"));
    await expectPdfReaderTextReady(page);
    await page.locator("#btn-back-library").click();
    await expect(page.locator('.book-card:not(.book-card--demo)')).toHaveCount(1, { timeout: 15_000 });
    await page.locator(".book-card:not(.book-card--demo)").click();
    await expectPdfReaderTextReady(page);
  });
});