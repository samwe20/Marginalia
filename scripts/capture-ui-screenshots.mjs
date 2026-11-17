/**
 * Capture UI screenshots (demo library, quotes DB, detail, search; light + dark).
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const artifacts = "/opt/cursor/artifacts";
mkdirSync(artifacts, { recursive: true });

const fixtures = join(process.cwd(), "tests", "fixtures");
const port = 4173;
const base = `http://127.0.0.1:${port}`;

const server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: process.cwd(),
  stdio: "ignore",
});

await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 840 } });

try {
  await page.goto(base);
  await page.waitForSelector(".sidebar");
  await page.locator('.nav-item[data-route="settings"]').click();
  await page.locator("#btn-demo-load").click();
  await page.locator('.nav-item[data-route="library"]').click();
  await page.waitForSelector(".book-grid--demo");

  await page.screenshot({ path: join(artifacts, "demo-library-light.png"), fullPage: false });

  await page.locator('.nav-item[data-route="notes"]').click();
  await page.waitForSelector(".notes-layout");
  await page.screenshot({ path: join(artifacts, "demo-notes-wikilinks-light.png"), fullPage: false });

  await page.locator('.nav-item[data-route="quotes"]').click();
  await page.waitForSelector(".quote-db-grid");
  await page.screenshot({ path: join(artifacts, "demo-quotes-db-light.png"), fullPage: false });

  await page.locator("[data-demo-quote='demo-q007']").click();
  await page.waitForSelector(".quote-detail__note");
  await page.waitForSelector("#detail-backlinks .backlinks-list");
  await page.screenshot({ path: join(artifacts, "demo-quote-note-backlinks-light.png"), fullPage: false });

  await page.locator("#btn-back-quotes").click();
  await page.locator('.nav-item[data-route="library"]').click();
  await page.locator("[data-demo-book='demo-babicka']").click();
  await page.waitForSelector(".book-detail");
  await page.screenshot({ path: join(artifacts, "demo-book-detail-light.png"), fullPage: false });

  await page.locator("#btn-back-library-detail").click();
  await page.locator('.nav-item[data-route="search"]').click();
  const search = page.locator("#search-input");
  await search.fill("Hamlet");
  await search.press("Enter");
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(artifacts, "demo-search-light.png"), fullPage: false });

  await page.evaluate(() => {
    document.querySelector("#app")?.setAttribute("data-theme", "dark");
  });
  await page.locator('.nav-item[data-route="library"]').click();
  await page.waitForSelector(".book-grid--demo");
  await page.screenshot({ path: join(artifacts, "demo-library-dark.png"), fullPage: false });

  await page.evaluate(() => localStorage.setItem("marginalia.libraryRoot", "/Marginalia"));
  await page.locator("#file-open").setInputFiles(join(fixtures, "sample.epub"));
  await page.locator("#epub-root foliate-view").waitFor({ state: "attached", timeout: 60_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(artifacts, "ui-reader-epub-light.png"), fullPage: false });
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

console.log("Wrote UI screenshots to", artifacts);