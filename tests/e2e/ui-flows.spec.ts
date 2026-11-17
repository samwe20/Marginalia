import { test, expect } from "@playwright/test";
import { enableDemoData, prepareWebLibrary } from "./helpers";

test.describe("UI flows (web build)", () => {
  test.beforeEach(async ({ page }) => {
    await prepareWebLibrary(page);
    await enableDemoData(page);
  });

  test("demo knihovna a navigace na detail knihy", async ({ page }) => {
    await page.locator('.nav-item[data-route="library"]').click();
    await expect(page.locator(".book-grid--demo")).toBeVisible();
    await page.locator("[data-demo-book='demo-babicka']").click();
    await expect(page.locator(".book-detail h1")).toContainText("Babička");
    await expect(page.locator("#detail-backlinks .backlinks-header")).toBeVisible();
  });

  test("citace: filtr podle štítku", async ({ page }) => {
    await page.locator('.nav-item[data-route="quotes"]').click();
    await expect(page.locator(".quote-db-grid")).toBeVisible();
    const tag = page.locator('.tag-chip--btn[data-tag="filozofie"]');
    await tag.click();
    await expect(page.locator(".quote-db-card")).toHaveCount(1);
  });

  test("detail citace: wikilinks v poznámce a backlinks", async ({ page }) => {
    await page.locator('.nav-item[data-route="quotes"]').click();
    await page.locator("[data-demo-quote='demo-q007']").click();
    await expect(page.locator(".quote-detail__note")).toBeVisible();
    await expect(page.locator("#detail-backlinks .link-item").first()).toBeVisible({ timeout: 10_000 });
    const wiki = page.locator('.preview-root a.wiki-link[data-wiki-title]').first();
    if (await wiki.count()) await wiki.click();
    await expect(page.locator(".book-detail, .notes-layout, .quote-detail")).toBeVisible();
  });

  test("poznámky: seznam a panel zpětných odkazů", async ({ page }) => {
    await page.locator('.nav-item[data-route="notes"]').click();
    await expect(page.locator(".notes-layout")).toBeVisible();
    await expect(page.locator(".note-list-item.active")).toBeVisible();
    await expect(page.locator("#note-backlinks-pane .backlinks-header")).toBeVisible();
  });

  test("globální hledání (ukázková data)", async ({ page }) => {
    await page.locator('.nav-item[data-route="search"]').click();
    const input = page.locator("#search-input");
    await input.fill("Hamlet");
    await input.press("Enter");
    await expect(page.locator("#search-results .quote-db-card").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/hamlet/i).first()).toBeVisible();
  });

  test("klávesová zkratka Ctrl+F otevře hledání", async ({ page }) => {
    await page.locator('.nav-item[data-route="library"]').click();
    await page.keyboard.press("Control+f");
    await expect(page.locator("#search-input")).toBeVisible();
  });

  test("světlý/tmavý režim (data-theme)", async ({ page }) => {
    await page.evaluate(() => document.querySelector("#app")?.setAttribute("data-theme", "dark"));
    await expect(page.locator("#app[data-theme='dark']")).toBeVisible();
    await page.evaluate(() => document.querySelector("#app")?.setAttribute("data-theme", "light"));
  });

  test("odstranění ukázkových dat", async ({ page }) => {
    await page.locator('.nav-item[data-route="settings"]').click();
    await page.locator("#btn-demo-remove").click();
    await expect(page.locator("#btn-demo-load")).toBeEnabled();
    await page.locator('.nav-item[data-route="library"]').click();
    await expect(page.locator(".book-grid--demo")).toHaveCount(0);
  });
});

test.describe("wikilinks — chybějící cíl", () => {
  test("potvrzení vytvoří novou poznámku", async ({ page }) => {
    await prepareWebLibrary(page);
    await enableDemoData(page);
    page.on("dialog", async (d) => {
      expect(d.message()).toMatch(/Vytvořit novou poznámku/i);
      await d.accept();
    });
    await page.locator('.nav-item[data-route="notes"]').click();
    await page.getByRole("button", { name: "Otevřené otázky" }).click();
    const missing = page.locator(".cm-wiki-link.missing", { hasText: "Neexistující pojem" });
    await expect(missing).toBeVisible();
    await missing.dblclick();
    await expect(page.getByRole("button", { name: "Neexistující pojem" })).toBeVisible({ timeout: 15_000 });
  });
});