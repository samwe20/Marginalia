/**
 * Capture Folio-style UI screenshots for review artifacts.
 * Usage: npm run build && npx vite preview --port 4173 &  node scripts/capture-ui-screenshots.mjs
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
  await page.screenshot({ path: join(artifacts, "ui-library-light.png"), fullPage: false });

  await page.locator('.nav-item[data-route="search"]').click();
  await page.waitForSelector("#search-input");
  await page.screenshot({ path: join(artifacts, "ui-search-light.png"), fullPage: false });

  await page.evaluate(() => localStorage.setItem("marginalia.libraryRoot", "/Marginalia"));
  await page.locator('.nav-item[data-route="library"]').click();
  await page.locator("#file-open").setInputFiles(join(fixtures, "sample.epub"));
  await page.locator("#epub-root foliate-view").waitFor({ state: "attached", timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(artifacts, "ui-reader-epub-light.png"), fullPage: false });

  await page.evaluate(() => {
    const app = document.querySelector("#app");
    if (app) app.dataset.theme = "dark";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#000000");
  });
  await page.screenshot({ path: join(artifacts, "ui-reader-epub-dark.png"), fullPage: false });

  await page.locator('.nav-item[data-route="library"]').click();
  await page.waitForSelector(".page h1");
  await page.screenshot({ path: join(artifacts, "ui-library-dark.png"), fullPage: false });
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

console.log("Wrote UI screenshots to", artifacts);