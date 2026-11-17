import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const fixtures = join(process.cwd(), "tests", "fixtures");

test.describe("open book (web build)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".sidebar");
    await page.evaluate(() => localStorage.setItem("marginalia.libraryRoot", "/Marginalia"));
    await page.locator('.nav-item[data-route="library"]').click();
    await page.waitForSelector("#btn-open-book");
  });

  test("Otevřít knihu spustí výběr souboru", async ({ page }) => {
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator("#btn-open-book").click(),
    ]);
    expect(chooser.isMultiple()).toBe(false);
  });

  test("PDF má interaktivní textLayer po otevření", async ({ page }) => {
    await page.locator("#file-open").setInputFiles(join(fixtures, "sample.pdf"));
    await expect(page.locator("#pdf-root .textLayer")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("#pdf-root .textLayer span")).not.toHaveCount(0);
    const selectable = await page.evaluate(() => {
      const span = document.querySelector("#pdf-root .textLayer span") as HTMLElement | null;
      if (!span?.firstChild) return false;
      const range = document.createRange();
      range.selectNodeContents(span);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      const ok = (sel?.toString().length ?? 0) > 0;
      sel?.removeAllRanges();
      return ok;
    });
    expect(selectable).toBe(true);
  });
});

test.describe("PDF harness (production bundle)", () => {
  test("textLayer spans render in built assets", async ({ page }) => {
    const pdf = readFileSync(join(fixtures, "sample.pdf"));
    await page.route("**/fixtures/sample.pdf", (route) =>
      route.fulfill({ body: pdf, contentType: "application/pdf" }),
    );
    await page.goto("/?e2e=1");
    const result = await page.evaluate(async () => window.__marginaliaE2E!.runPdfTextLayerTest("/fixtures/sample.pdf"));
    expect(result.spanCount).toBeGreaterThan(0);
    expect(result.canSelectText).toBe(true);
    expect(result.sampleText.length).toBeGreaterThan(5);
  });
});