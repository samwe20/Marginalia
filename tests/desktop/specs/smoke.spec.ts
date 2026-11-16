import fs from "node:fs";
import path from "node:path";
import { browser, $, expect } from "@wdio/globals";

const library = process.env.MARGINALIA_SMOKE_LIBRARY!;
const pdfPath = process.env.MARGINALIA_FIXTURE_PDF!;
const epubPath = process.env.MARGINALIA_FIXTURE_EPUB!;
const pdfExtraSource = process.env.MARGINALIA_FIXTURE_PDF_EXTRA!;
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

async function callSmokeApi<T>(method: string, ...args: unknown[]): Promise<T> {
  return browser.execute(
    function callMarginaliaSmokeApi(payload) {
      var m = payload.m;
      var a = payload.a;
      var api = window.__MARGINALIA_SMOKE_API__;
      if (!api || typeof api[m] !== "function") throw new Error("Smoke API missing: " + m);
      return api[m].apply(api, a);
    },
    { m: method, a: args },
  ) as Promise<T>;
}

async function waitEpubTextReady(timeoutMs = 120_000) {
  await browser.pause(2000);
  await browser.waitUntil(
    async () => {
      if ((await $("#epub-root").getAttribute("data-epub-text-ready")) !== "1") return false;
      const visible = (await callSmokeApi<number>("epubVisibleTextLength")) ?? 0;
      return visible > 3;
    },
    { timeout: timeoutMs, interval: 800, timeoutMsg: "EPUB visible text not rendered" },
  );
}

async function goLibrary() {
  await $('[data-route="library"]').click();
  await browser.pause(600);
}

async function openPdfFromLibraryCard() {
  await goLibrary();
  const card = await $('.book-card[data-kind="pdf"]:not(.book-card--demo)');
  await expect(card).toBeDisplayed();
  await card.click();
  await waitPdfTextReady();
}

async function openEpubFromLibraryCard() {
  await goLibrary();
  const card = await $('.book-card[data-kind="epub"]:not(.book-card--demo)');
  await expect(card).toBeDisplayed();
  await card.click();
  await waitEpubTextReady(120_000);
}

describe("Marginalia installed-app smoke (mandatory suite)", () => {
  after(() => {
    fs.mkdirSync(artifactDir, { recursive: true });
    const table = results.map((r) => `${r.ok ? "PASS" : "FAIL"}\t${r.id}\t${r.name}\t${r.detail ?? ""}`).join("\n");
    fs.writeFileSync(path.join(artifactDir, "smoke-results.json"), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(artifactDir, "smoke-results.txt"), table);
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

  it("S18 first-run modal, blocked open, folder scan", async () => {
    try {
      await invoke("smoke_reset_first_run");
      await callSmokeApi("resetFirstRunClientState");
      await browser.pause(800);
      if (!(await callSmokeApi<boolean>("isSetupModalVisible"))) {
        throw new Error("setup modal not shown on fresh install");
      }
      let blocked = false;
      try {
        await callSmokeApi("openBookAtPath", pdfPath, "");
      } catch {
        blocked = true;
      }
      if (!blocked) throw new Error("book open before library folder must be blocked");
      let rescanBlocked = false;
      try {
        await callSmokeApi("rescanBooksFromFolder");
      } catch {
        rescanBlocked = true;
      }
      if (!rescanBlocked) throw new Error("rescan before library folder must be blocked");

      const pickersBefore = await callSmokeApi<number>("getFolderPickerInvocationCount");
      const loaded = (await callSmokeApi<number>("finishLibrarySetup", library)) ?? 0;
      if (loaded < 2) throw new Error(`expected PDF+EPUB from folder scan (incl. subfolder), got ${loaded}`);
      if (await callSmokeApi<boolean>("isSetupModalVisible")) {
        throw new Error("setup modal still visible after finishLibrarySetup");
      }
      const pickersAfter = await callSmokeApi<number>("getFolderPickerInvocationCount");
      if (pickersAfter !== pickersBefore) {
        throw new Error(`unexpected folder picker during setup (${pickersBefore} → ${pickersAfter})`);
      }
      await browser.pause(800);
      const pdfCard = await $('.book-card[data-kind="pdf"]:not(.book-card--demo)');
      const epubCard = await $('.book-card[data-kind="epub"]:not(.book-card--demo)');
      await expect(pdfCard).toBeDisplayed();
      await expect(epubCard).toBeDisplayed();
      if (!pdfPath.toLowerCase().includes(`${path.sep}shelf${path.sep}`)) {
        throw new Error(`fixture PDF must live in subfolder for scan test: ${pdfPath}`);
      }
      await saveScreenshot("smoke-first-run.png");
      record("S18", "Modal + blocked open + auto-scan (subfolder PDF + EPUB)", true, `books=${loaded}`);
    } catch (e) {
      record("S18", "Modal + blocked open + auto-scan (subfolder PDF + EPUB)", false, String(e));
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

  it("S03 open PDF from library card", async () => {
    try {
      await openPdfFromLibraryCard();
      await expect($("#pdf-root .textLayer span")).toBeExisting();
      record("S03", "Open PDF from auto-scanned library card", true);
    } catch (e) {
      record("S03", "Open PDF from auto-scanned library card", false, String(e));
      throw e;
    }
  });

  it("S04 library lists subfolder PDF and root EPUB", async () => {
    try {
      const back = await $("#btn-back-library");
      if (await back.isExisting()) {
        await back.click();
        await browser.pause(600);
      }
      await goLibrary();
      await expect($('.book-card[data-kind="pdf"]:not(.book-card--demo)')).toBeDisplayed();
      await expect($('.book-card[data-kind="epub"]:not(.book-card--demo)')).toBeDisplayed();
      const cards = await callSmokeApi<number>("countScannedBookCards");
      if (cards < 2) throw new Error(`expected ≥2 scanned cards, got ${cards}`);
      record("S04", "Auto-list PDF (podsložka) + EPUB", true, `cards=${cards}`);
    } catch (e) {
      record("S04", "Auto-list PDF (podsložka) + EPUB", false, String(e));
      throw e;
    }
  });

  it("S05 PDF text selection + highlight", async () => {
    try {
      await openPdfFromLibraryCard();
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
        highlighted ? `highlights=${highlighted}` : "selection only",
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

  it("S07 open EPUB from library card (visible text)", async () => {
    try {
      await openEpubFromLibraryCard();
      await expect($("#epub-root foliate-view")).toBeDisplayed();
      record("S07", "Open EPUB from library card", true);
    } catch (e) {
      record("S07", "Open EPUB from library card", false, String(e));
      throw e;
    }
  });

  it("S15 EPUB highlight → .md + Citace + panel + reopen", async () => {
    try {
      await openEpubFromLibraryCard();
      const appClass = await $("#app").getAttribute("class");
      if (appClass?.includes("backlinks-hidden")) {
        await $("#btn-backlinks").click();
        await browser.pause(400);
      }
      const created = await callSmokeApi<{ quoteId: string; text: string; slug: string }>(
        "createEpubQuoteFromSelection",
      );
      const files = (await invoke("smoke_list_quote_files", {
        libraryRoot: library,
        bookSlug: created.slug,
      })) as string[];
      if (!files.includes(`${created.quoteId}.md`)) {
        throw new Error(`quote .md missing on disk: ${files.join(",")}`);
      }
      await browser.waitUntil(
        async () => {
          const el = await $("#inspector-body .quote-card__text");
          return (await el.isExisting()) && (await el.isDisplayed());
        },
        { timeout: 15_000, timeoutMsg: "inspector quote card after EPUB highlight" },
      );
      await $('[data-route="quotes"]').click();
      await browser.pause(1200);
      await expect($(`[data-user-quote="${created.quoteId}"]`)).toBeDisplayed();
      await openEpubFromLibraryCard();
      await $('[data-route="quotes"]').click();
      await browser.pause(800);
      await expect($(`[data-user-quote="${created.quoteId}"]`)).toBeDisplayed();
      record("S15", "EPUB quote on disk + Citace + restore", true, created.quoteId);
    } catch (e) {
      record("S15", "EPUB quote on disk + Citace + restore", false, String(e));
      throw e;
    }
  });

  it("S08 Obnovit knihy ze složky visible", async () => {
    try {
      await goLibrary();
      await expect($('[data-testid="btn-rescan-books"]')).toBeDisplayed();
      record("S08", "Obnovit knihy ze složky", true);
    } catch (e) {
      record("S08", "Obnovit knihy ze složky", false, String(e));
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
      await goLibrary();
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

  it("S12 session reload keeps library + books", async () => {
    try {
      await goLibrary();
      await openPdfFromLibraryCard();
      await $("#btn-back-library").click();
      await browser.pause(800);
      await browser.reloadSession();
      await browser.pause(4500);
      const rootAfter = await callSmokeApi<string>("getLibraryRoot");
      if (rootAfter !== library) throw new Error(`library root after restart: ${rootAfter}`);
      await goLibrary();
      const cards = await $$(".book-card:not(.book-card--demo)");
      if ((await cards.length) < 2) throw new Error("library cards missing after restart");
      await cards[0].click();
      await waitPdfTextReady();
      await saveScreenshot("smoke-book-restarted.png");
      record("S12", "Restart app → folder + books persist", true);
    } catch (e) {
      record("S12", "Restart app → folder + books persist", false, String(e));
      throw e;
    }
  });

  it("S13 rescan picks up newly added file", async () => {
    try {
      if (!pdfExtraSource) throw new Error("MARGINALIA_FIXTURE_PDF_EXTRA not set");
      await goLibrary();
      const before = await callSmokeApi<number>("countScannedBookCards");
      await invoke("smoke_stage_file_in_library", {
        libraryRoot: library,
        destFileName: "rescan-extra.pdf",
        sourcePath: pdfExtraSource,
      });
      const rescan = await callSmokeApi<{ imported: number; total: number }>("rescanBooksFromFolder");
      await browser.pause(800);
      await goLibrary();
      const after = await callSmokeApi<number>("countScannedBookCards");
      if (after <= before || rescan.total <= before) {
        throw new Error(`rescan did not add book (${before} → ${after}, total=${rescan.total}, imported=${rescan.imported})`);
      }
      await goLibrary();
      const extraCard = await $('.book-card[data-kind="pdf"]:not(.book-card--demo)');
      const count = (await $$('.book-card[data-kind="pdf"]:not(.book-card--demo)')).length;
      if (count < 2) throw new Error(`expected multiple PDF cards after rescan, got ${count}`);
      await extraCard.click();
      await waitPdfTextReady();
      await saveScreenshot("smoke-rescan-extra.png");
      record("S13", "Obnovit knihy → nový soubor v seznamu", true, `${before}→${after}`);
    } catch (e) {
      record("S13", "Obnovit knihy → nový soubor v seznamu", false, String(e));
      throw e;
    }
  });

  it("S14 PDF highlight → .md + Citace + panel + reopen", async () => {
    try {
      await openPdfFromLibraryCard();
      const created = await callSmokeApi<{ quoteId: string; text: string; slug: string }>(
        "createPdfQuoteFromSelection",
      );
      const files = (await invoke("smoke_list_quote_files", {
        libraryRoot: library,
        bookSlug: created.slug,
      })) as string[];
      if (!files.includes(`${created.quoteId}.md`)) {
        throw new Error(`quote .md missing on disk: ${files.join(",")}`);
      }
      await expect($("#inspector-body .quote-card__text")).toBeDisplayed();
      const panelText = await $("#inspector-body .quote-card__text").getText();
      if (!panelText.includes(created.text.slice(0, 8))) throw new Error("inspector quote mismatch");
      await $('[data-route="quotes"]').click();
      await browser.pause(1200);
      const citace = await $(`[data-user-quote="${created.quoteId}"]`);
      await expect(citace).toBeDisplayed();
      await openPdfFromLibraryCard();
      await expect($("#pdf-root mark.quote-highlight")).toBeExisting();
      await expect($("#inspector-body .quote-card__text")).toBeDisplayed();
      record("S14", "PDF quote on disk + Citace + restore", true, created.quoteId);
    } catch (e) {
      record("S14", "PDF quote on disk + Citace + restore", false, String(e));
      throw e;
    }
  });

  it("S16 wikilink seed → backlink in notes UI", async () => {
    try {
      const seeded = await callSmokeApi<{ targetTitle: string; backlinkCount: number }>("seedWikilinkBacklink");
      if (seeded.backlinkCount < 1) throw new Error(`expected backlink, got ${seeded.backlinkCount}`);
      await $('[data-route="notes"]').click();
      await browser.waitUntil(
        async () => (await $(".notes-layout").getAttribute("data-notes-ready")) === "1",
        { timeout: 20_000, timeoutMsg: "notes view not ready" },
      );
      const targetBtn = await $(`//button[contains(@class,"note-list-item") and contains(., "${seeded.targetTitle}")]`);
      await targetBtn.click();
      await browser.pause(800);
      const bl = await $("#panel-backlinks-list");
      await expect(bl).toBeDisplayed();
      const blText = await bl.getText();
      if (!blText.includes("Smoke zdroj")) throw new Error(`backlink source missing: ${blText}`);
      record("S16", "Wikilink + backlink panel", true, `count=${seeded.backlinkCount}`);
    } catch (e) {
      record("S16", "Wikilink + backlink panel", false, String(e));
      throw e;
    }
  });

  it("S17 native Open dialog capability + plugin", async () => {
    try {
      const dlg = await callSmokeApi<{ ok: boolean; detail: string }>("verifyDialogPlugin");
      if (!dlg.ok) throw new Error(dlg.detail);
      const rustCapable = (await invoke("smoke_dialog_capable")) as boolean;
      if (!rustCapable) throw new Error("smoke_dialog_capable false");
      record("S17", "Open dialog capability + plugin", true, dlg.detail);
    } catch (e) {
      record("S17", "Open dialog capability + plugin", false, String(e));
      throw e;
    }
  });
});