import type { Page } from "@playwright/test";

export async function prepareWebLibrary(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector(".sidebar");
  await page.evaluate(() => localStorage.setItem("marginalia.libraryRoot", "/Marginalia"));
}

export async function enableDemoData(page: Page): Promise<void> {
  await page.locator('.nav-item[data-route="settings"]').click();
  const load = page.locator("#btn-demo-load");
  if (await load.isEnabled()) {
    await load.click();
  }
  await page.waitForTimeout(200);
}

export async function disableDemoData(page: Page): Promise<void> {
  await page.locator('.nav-item[data-route="settings"]').click();
  const remove = page.locator("#btn-demo-remove");
  if (await remove.isEnabled()) {
    await remove.click();
  }
  await page.waitForTimeout(200);
}