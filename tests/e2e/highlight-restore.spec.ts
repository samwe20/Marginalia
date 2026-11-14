import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fixtures = join(process.cwd(), "tests", "fixtures");

test.describe("highlight persistence", () => {
  test("PDF quote restore via harness API", async ({ page }) => {
    const pdf = readFileSync(join(fixtures, "sample.pdf"));
    await page.route("**/fixtures/sample.pdf", (route) =>
      route.fulfill({ body: pdf, contentType: "application/pdf" }),
    );
    await page.goto("/?e2e=1");
    await page.evaluate(async () => {
      const result = await window.__marginaliaE2E!.runPdfHighlightRestoreTest("/fixtures/sample.pdf");
      if (!result.saved || !result.restored) throw new Error(JSON.stringify(result));
    });
  });

  test("EPUB opens in app without error", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("marginalia.libraryRoot", "/Marginalia"));
    await page.locator("#file-open").setInputFiles(join(fixtures, "sample.epub"));
    await expect(page.locator("#epub-root foliate-view")).toHaveCount(1, { timeout: 60_000 });
    const status = await page.locator("#status").textContent();
    expect(status ?? "").not.toMatch(/error/i);
  });
});