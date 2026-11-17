import { test, expect } from "@playwright/test";
import { prepareWebLibrary } from "./helpers";

test.describe("search notes", () => {
  test.beforeEach(async ({ page }) => {
    await prepareWebLibrary(page);
    await page.locator('.nav-item[data-route="settings"]').click();
    const load = page.locator("#btn-demo-load");
    if (await load.isEnabled()) await load.click();
  });

  test("demo poznámka ve filtru Poznámek (Folio)", async ({ page }) => {
    await page.locator('.nav-item[data-route="notes"]').click();
    await expect(page.locator(".notes-layout")).toBeVisible();
    const input = page.locator("#notes-filter");
    await input.fill("esej");
    await expect(page.locator(".note-list-item")).toContainText(/Esej/i, { timeout: 10_000 });
  });
});
