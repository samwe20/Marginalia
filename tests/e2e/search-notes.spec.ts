import { test, expect } from "@playwright/test";

test.describe("search notes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".sidebar");
    await page.evaluate(() => localStorage.setItem("marginalia.libraryRoot", "/Marginalia"));
    await page.locator('.nav-item[data-route="settings"]').click();
    const load = page.locator("#btn-demo-load");
    if (await load.isEnabled()) await load.click();
  });

  test("demo poznámka v hledání (Folio)", async ({ page }) => {
    await page.locator('.nav-item[data-route="search"]').click();
    const input = page.locator("#search-input");
    await input.fill("esej");
    await input.press("Enter");
    await expect(page.locator(".search-note-list .search-note-card")).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator(".search-note-card__title")).toContainText("Esej");
    await page.locator('[data-demo-note="demo-note-essay"]').click();
    await expect(page.locator(".notes-layout")).toBeVisible();
  });
});