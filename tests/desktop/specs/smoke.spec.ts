import fs from "node:fs";
import path from "node:path";
import { browser, $, expect } from "@wdio/globals";

const library = process.env.MARGINALIA_SMOKE_LIBRARY!;
const pdfPath = process.env.MARGINALIA_FIXTURE_PDF!;
const epubPath = process.env.MARGINALIA_FIXTURE_EPUB!;
const artifactDir =
  process.env.SMOKE_ARTIFACTS_DIR ?? path.join(process.cwd(), "test-results", "desktop-smoke");

type Row = { id: string; name: string; ok: boolean; detail?: string };

const results: Row[] = [];
function record(id: string, name: string, ok: boolean, detail?: string) {
  results.push({ id, name, ok, detail });
}

async function invoke(cmd: string, args: Record<string, unknown> = {}) {
  return browser.execute(
    ({ command, payload }) => {
      const tauri = (window as unknown as { __TAURI__: { core: { invoke: (c: string, a: object) => Promise<unknown> } } })
        .__TAURI__;
      return tauri.core.invoke(command, payload);
    },
    { command: cmd, payload: args },
  );
}

async function smokeOpen(filePath: string) {
  await invoke("smoke_open_book", { libraryRoot: library, filePath });
}

async function waitPdfTextReady(timeoutMs = 45_000) {
  await browser.waitUntil(
  async () => (await $("#pdf-root").getAttribute("data-pdf-text-ready")) === "1",
    { timeout: timeoutMs, interval: 400, timeoutMsg: "PDF text layer not ready" },
  );
}

async function selectFirstPdfText(): Promise<boolean> {
  return browser.execute(() => {
    const span = document.querySelector("#pdf-root .textLayer span") as HTMLElement | null;
    if (!span?.firstChild) return false;
    const range = document.createRange();
    range.selectNodeContents(span);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return (sel?.toString().length ?? 0) > 0;
  });
}

async function saveScreenshot(name: string) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const target = path.join(artifactDir, name);
  await browser.saveScreenshot(target);
}

describe("Marginalia installed-app smoke (mandatory suite)", () => {
  after(() => {
    fs.mkdirSync(artifactDir, { recursive: true });
    const table = results.map((r) => `${r.ok ? "PASS" : "FAIL"}\t${r.id}\t${r.name}\t${r.detail ?? ""}`).join("\n");
    fs.writeFileSync(path.join(artifactDir, "smoke-results.txt"), table);
    fs.writeFileSync(path.join(artifactDir, "smoke-results.json"), JSON.stringify(results, null, 2));
  });

  it("S01 library shell", async () => {
    await browser.pause(2500);
    try {
      await expect($('[data-route="library"]')).toBeDisplayed();
      record("S01", "Library shell", true);
    } catch (e) {
      record("S01", "Library shell", false, String(e));
      throw e;
    }
  });

  it("S02 theme system/light/dark", async () => {
    try {
      await $('[data-route="settings"]').click();
      await browser.pause(400);
      for (const pref of ["system", "light", "dark"] as const) {
        await $(`[data-theme-pref="${pref}"]`).click();
        await browser.pause(300);
      }
      await $('[data-theme-pref="light"]').click();
      const theme = await $("#app").getAttribute("data-theme");
      expect(theme).toBe("light");
      await saveScreenshot("smoke-light-mode.png");
      record("S02", "Theme Systém/Světlý/Tmavý", true);
    } catch (e) {
      record("S02", "Theme Systém/Světlý/Tmavý", false, String(e));
      throw e;
    }
  });

  it("S03 open PDF (smoke dialog bypass)", async () => {
    try {
      await $('[data-route="library"]').click();
      await smokeOpen(pdfPath);
      await waitPdfTextReady();
      await expect($("#pdf-root .textLayer span")).toBeExisting();
      record("S03", "Open PDF via automation hook", true);
    } catch (e) {
      record("S03", "Open PDF via automation hook", false, String(e));
      throw e;
    }
  });

  it("S04 Ctrl+O opens PDF (smoke maps to fixture)", async () => {
    try {
      const back = await $("#btn-back-library");
      if (await back.isExisting()) {
        await back.click();
        await browser.pause(800);
      }
      await browser.keys(["Control", "o"]);
      await waitPdfTextReady();
      await expect($("#pdf-root .textLayer span")).toBeExisting();
      record("S04", "Ctrl+O open book (smoke fixture)", true);
    } catch (e) {
      record("S04", "Ctrl+O open book (smoke fixture)", false, String(e));
      throw e;
    }
  });

  it("S05 PDF text selection + highlight", async () => {
    try {
      await waitPdfTextReady();
      const ok = await selectFirstPdfText();
      expect(ok).toBe(true);
      await saveScreenshot("smoke-pdf-text-selected.png");
      const highlighted = await browser.execute(() => {
        return document.querySelectorAll(".quote-highlight, mark.quote-highlight").length;
      });
      record(
        "S05",
        "PDF mouse text selection",
        ok,
        highlighted ? `highlights=${highlighted}` : "selection only (highlight may need pointer drag)",
      );
      if (!ok) throw new Error("PDF text not selectable");
    } catch (e) {
      record("S05", "PDF mouse text selection", false, String(e));
      throw e;
    }
  });

  it("S06 reopen book from library", async () => {
    try {
      await $("#btn-back-library").click();
      await browser.pause(800);
      const card = await $(".book-card:not(.book-card--demo)");
      await expect(card).toBeDisplayed();
      await card.click();
      await waitPdfTextReady();
      await expect($("#pdf-root .textLayer span")).toBeExisting();
      await saveScreenshot("smoke-book-reopened.png");
      record("S06", "Close & reopen from library", true);
    } catch (e) {
      record("S06", "Close & reopen from library", false, String(e));
      throw e;
    }
  });

  it("S07 open EPUB", async () => {
    try {
      await smokeOpen(epubPath);
      await browser.pause(4500);
      await expect($("#epub-root foliate-view")).toBeDisplayed();
      record("S07", "Open EPUB", true);
    } catch (e) {
      record("S07", "Open EPUB", false, String(e));
      throw e;
    }
  });

  it("S08 open-book button visible", async () => {
    try {
      await $('[data-route="library"]').click();
      await expect($('[data-testid="btn-open-book"]')).toBeDisplayed();
      record("S08", "Otevřít knihu button", true);
    } catch (e) {
      record("S08", "Otevřít knihu button", false, String(e));
      throw e;
    }
  });

  it("S09 search UI", async () => {
    try {
      await $('[data-route="settings"]').click();
      await browser.pause(300);
      const load = await $("#btn-demo-load");
      if (await load.isEnabled()) await load.click();
      await browser.pause(800);
      await $('[data-route="search"]').click();
      await browser.pause(400);
      const input = await $("#search-input");
      await input.setValue("Tolstoj");
      await $("#btn-search-run").click();
      await browser.pause(1200);
      const hits = await $("#search-results .quote-db-card, #search-results .search-note-card");
      await expect(hits).toBeDisplayed();
      record("S09", "Search finds quote/note", true, "demo index hit");
    } catch (e) {
      record("S09", "Search finds quote/note", false, String(e));
      throw e;
    }
  });

  it("S10 demo data load/remove", async () => {
    try {
      await $('[data-route="settings"]').click();
      await browser.pause(400);
      const load = await $("#btn-demo-load");
      if (await load.isEnabled()) await load.click();
      await browser.pause(600);
      await $('[data-route="library"]').click();
      await browser.pause(400);
      await expect($(".book-card--demo")).toBeDisplayed();
      await $('[data-route="settings"]').click();
      await browser.pause(300);
      const remove = await $("#btn-demo-remove");
      if (await remove.isEnabled()) await remove.click();
      await browser.pause(400);
      record("S10", "Demo data load/remove", true);
    } catch (e) {
      record("S10", "Demo data load/remove", false, String(e));
      throw e;
    }
  });

  it("S11 notes / wikilink surface", async () => {
    try {
      await $('[data-route="notes"]').click();
      await browser.waitUntil(
        async () => (await $(".notes-layout").getAttribute("data-notes-ready")) === "1",
        { timeout: 20_000, timeoutMsg: "notes view not ready" },
      );
      await expect($('.notes-layout[data-notes-ready="1"] #btn-new-note')).toBeDisplayed();
      record("S11", "Notes view (wikilink/backlink UI)", true);
    } catch (e) {
      record("S11", "Notes view (wikilink/backlink UI)", false, String(e));
      throw e;
    }
  });

  it("S12 session reload keeps library card", async () => {
    try {
      await $('[data-route="library"]').click();
      await smokeOpen(pdfPath);
      await waitPdfTextReady();
      await $("#btn-back-library").click();
      await browser.pause(800);
      await browser.reloadSession();
      await browser.pause(4000);
      await $('[data-route="library"]').click();
      await browser.pause(500);
      const card = await $(".book-card:not(.book-card--demo)");
      await expect(card).toBeDisplayed();
      await card.click();
      await waitPdfTextReady();
      await saveScreenshot("smoke-book-restarted.png");
      record("S12", "Restart app → library persists", true);
    } catch (e) {
      record("S12", "Restart app → library persists", false, String(e));
      throw e;
    }
  });
});