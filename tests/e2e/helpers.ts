import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function prepareWebLibrary(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("marginalia.libraryRoot", "/Marginalia");
  });
  await page.goto("/");
  await page.waitForSelector(".sidebar");
  await page.waitForFunction(() => {
    const el = document.getElementById("library-setup-modal");
    return !el || el.hasAttribute("hidden");
  });
  const modal = page.locator("#library-setup-modal:not([hidden])");
  if (await modal.isVisible()) {
    await page.locator("#setup-create-folder").click();
    await page.waitForFunction(() => {
      const el = document.getElementById("library-setup-modal");
      return !el || el.hasAttribute("hidden");
    });
  }
}

export async function enableDemoData(page: Page): Promise<void> {
  await page.locator('.nav-item[data-route="settings"]').click();
  const load = page.locator("#btn-demo-load");
  if (await load.isEnabled()) {
    await load.click();
  }
  await page.waitForTimeout(200);
}

/** PDF fixture má více stránek → jeden `.textLayer` locator je strict-mode nejednoznačný; čekáme na app signál. */
export async function expectPdfReaderTextReady(page: Page): Promise<void> {
  await expect(page.locator('#pdf-root[data-pdf-text-ready="1"]')).toBeAttached({ timeout: 60_000 });
  await expect(page.locator("#pdf-root .textLayer").first()).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("#pdf-root .textLayer span").first()).toBeVisible();
}

export async function disableDemoData(page: Page): Promise<void> {
  await page.locator('.nav-item[data-route="settings"]').click();
  const remove = page.locator("#btn-demo-remove");
  if (await remove.isEnabled()) {
    await remove.click();
  }
  await page.waitForTimeout(200);
}