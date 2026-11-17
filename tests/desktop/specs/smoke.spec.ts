import fs from "node:fs";
import path from "node:path";
import { browser, $, expect } from "@wdio/globals";

const library = process.env.MARGINALIA_SMOKE_LIBRARY!;
const pdfPath = process.env.MARGINALIA_FIXTURE_PDF!;
const epubPath = process.env.MARGINALIA_FIXTURE_EPUB!;
const mobiPath = process.env.MARGINALIA_FIXTURE_MOBI ?? "";
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

async function quoteFilesOnDisk(slug: string): Promise<string[]> {
  return (await invoke("smoke_list_quote_files", {
    libraryRoot: library,
    bookSlug: slug,
  })) as string[];
}

async function readLibraryText(relativePath: string): Promise<string> {
  return (await invoke("smoke_read_library_text", {
    libraryRoot: library,
    relativePath: relativePath,
  })) as string;
}

async function ensureInspectorOpen() {
  await browser.waitUntil(
    async () => (await $("#btn-backlinks").getAttribute("hidden")) == null,
    { timeout: 20_000, timeoutMsg: "reader Citace control not visible" },
  );
  if ((await $("#app").getAttribute("class"))?.includes("backlinks-hidden")) {
    await $("#btn-backlinks").click();
    await browser.pause(400);
  }
}

function clampTopViewport(
  rect: { x: number; y: number; x2: number; y2: number },
  inner: { width: number; height: number },
): { x: number; y: number; x2: number; y2: number } {
  const cap = (v: number, max: number) => Math.max(2, Math.min(Math.floor(v), Math.max(3, max) - 2));
  const y = cap(rect.y, inner.height);
  let x1 = cap(rect.x, inner.width);
  let x2 = cap(rect.x2, inner.width);
  if (x2 <= x1 + 3) x2 = Math.min(inner.width - 2, x1 + Math.max(8, Math.floor((inner.width - x1) * 0.6)));
  return { x: x1, y, x2, y2: y };
}

async function pointerDragViewport(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  moveMs = 280,
) {
  await browser.performActions([
    {
      type: "pointer",
      id: "finger1",
      parameters: { pointerType: "mouse" },
      actions: [
        { type: "pointerMove", duration: 0, x: fromX, y: fromY, origin: "viewport" },
        { type: "pointerDown", button: 0 },
        { type: "pointerMove", duration: moveMs, x: toX, y: toY, origin: "viewport" },
        { type: "pointerUp", button: 0 },
      ],
    },
  ]);
  await browser.releaseActions();
}

async function pointerDragOnElement(
  element: WebdriverIO.Element,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) {
  await browser.performActions([
    {
      type: "pointer",
      id: "finger1",
      parameters: { pointerType: "mouse" },
      actions: [
        { type: "pointerMove", duration: 0, origin: element as unknown as object, x: fromX, y: fromY },
        { type: "pointerDown", button: 0 },
        { type: "pointerMove", duration: 280, origin: element as unknown as object, x: toX, y: toY },
        { type: "pointerUp", button: 0 },
      ],
    },
  ]);
  await browser.releaseActions();
}

async function pointerSelectPdfText(): Promise<void> {
  const rect = (await browser.execute(function () {
    const span = document.querySelector("#pdf-root .textLayer span");
    if (!span) return null;
    const r = span.getBoundingClientRect();
    if (r.width < 8) return null;
    return {
      x: Math.floor(r.left + 6),
      y: Math.floor(r.top + r.height / 2),
      x2: Math.floor(r.right - 6),
      y2: Math.floor(r.top + r.height / 2),
    };
  })) as { x: number; y: number; x2: number; y2: number } | null;
  if (!rect) throw new Error("PDF text span missing for pointer selection");
  await pointerDragViewport(rect.x, rect.y, rect.x2, rect.y2);
}

async function enterFoliateContentFrame(): Promise<{ iframeCount: number; picked: number } | null> {
  const host = await $("#epub-root foliate-view");
  if (!(await host.isExisting())) return null;
  let iframes: WebdriverIO.Element[] = [];
  try {
    const paginator = await host.shadow$("foliate-paginator");
    if (await paginator.isExisting()) {
      iframes = await paginator.shadow$$("iframe");
    }
  } catch {
    /* foliate closed shadow */
  }
  if (!iframes.length) {
    try {
      const one = await host.shadow$("iframe");
      if (await one.isExisting()) iframes = [one];
    } catch {
      /* */
    }
  }
  if (!iframes.length) return null;
  let bestIdx = 0;
  let bestLen = -1;
  for (let i = 0; i < iframes.length; i++) {
    await browser.switchToFrame(iframes[i]);
    const len = (await browser.execute(function () {
      return document.body?.textContent?.replace(/\s+/g, " ").trim().length ?? 0;
    })) as number;
    await browser.switchToParentFrame();
    if (len > bestLen) {
      bestLen = len;
      bestIdx = i;
    }
  }
  await browser.switchToFrame(iframes[bestIdx]);
  return { iframeCount: iframes.length, picked: bestIdx };
}

function safeDiagStage(stage: string): string {
  return stage
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

async function dumpEpubPointerFailure(stage: string, extra?: Record<string, unknown>): Promise<never> {
  try {
    await browser.switchToFrame(null);
  } catch {
    /* */
  }
  const tag = safeDiagStage(stage);
  try {
    await saveScreenshot(`smoke-epub-fail-${tag}.png`);
  } catch {
    /* WebView screenshot path can fail on Windows */
  }
  const diag = await callSmokeApi<Record<string, unknown>>("epubSelectionDiagnostics");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactDir, `smoke-epub-diag-${tag}.json`),
    JSON.stringify({ stage, extra, diag }, null, 2),
  );
  throw new Error(`EPUB/MOBI pointer/H (${stage}): ${JSON.stringify({ extra, diag })}`);
}

async function dragSelectInCurrentFrame(): Promise<Record<string, unknown>> {
  await browser.execute(function () {
    const block = document.querySelector("p, span") ?? document.body;
    block?.scrollIntoView({ block: "center", inline: "nearest" });
  });
  await browser.pause(250);
  const block = (await $("p, span")) as WebdriverIO.Element;
  await block.waitForExist({ timeout: 8_000 });
  const preview = (await browser.execute(function () {
    const p = document.querySelector("p, span");
    return p?.textContent?.trim().slice(0, 80) ?? "";
  })) as string;
  let last: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 4; attempt++) {
    const size = await block.getSize();
    const w = size.width;
    const h = size.height;
    if (w < 8 || h < 4) throw new Error(`foliate text block too small: ${w}x${h}`);
    const y = Math.max(1, Math.floor(h / 2));
    const x1 = 2;
    const x2 = Math.min(w - 2, Math.max(x1 + 6, w - 2));
    try {
      await pointerDragOnElement(block, x1, y, x2, y);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("out of bounds") && attempt < 3) {
        await browser.pause(250);
        continue;
      }
      throw e;
    }
    const inFrameSelection = (await browser.execute(function () {
      const t = window.getSelection()?.toString().trim() ?? "";
      const api = (window.top ?? window).__MARGINALIA_SMOKE_API__ as
        | { epubSelectionDiagnostics?: () => { highlighterPending?: boolean } }
        | undefined;
      const highlighterPending = api?.epubSelectionDiagnostics?.()?.highlighterPending === true;
      return { length: t.length, preview: t.slice(0, 160), highlighterPending };
    })) as { length: number; preview: string; highlighterPending?: boolean };
    last = { attempt, preview, drag: { x1, y1: y, x2, y2: y, w, h }, inFrameSelection };
    if (inFrameSelection.length >= 3 || inFrameSelection.highlighterPending) {
      return last;
    }
    await browser.pause(300);
  }
  return last;
}

async function pointerSelectEpubText(): Promise<Record<string, unknown>> {
  await callSmokeApi<number>("ensureEpubReaderReady");
  const renderInfo = await callSmokeApi<{ mode: string }>("epubReaderRenderInfo");
  if (renderInfo.mode === "fallback") {
    const rect = await callSmokeApi<{ x: number; y: number; x2: number; y2: number } | null>(
      "epubPointerSelectionRect",
    );
    if (!rect) return dumpEpubPointerFailure("fallback-no-pointer-rect");
    await pointerDragViewport(rect.x, rect.y, rect.x2, rect.y2);
    const diag = await callSmokeApi<Record<string, unknown>>("epubSelectionDiagnostics");
    return { space: "fallback", rect, selectionAfterDrag: diag.selection };
  }
  const frameMeta = await enterFoliateContentFrame();
  if (!frameMeta) return dumpEpubPointerFailure("foliate-shadow-iframe-missing");
  let frameDrag: Record<string, unknown>;
  try {
    frameDrag = await dragSelectInCurrentFrame();
    frameDrag.iframeMeta = frameMeta;
  } catch (e) {
    await browser.switchToFrame(null);
    const err = e instanceof Error ? e.message : String(e);
    return dumpEpubPointerFailure("shadow-drag-error", { err, frameMeta });
  }
  const inFrame = frameDrag.inFrameSelection as {
    length: number;
    preview: string;
    highlighterPending?: boolean;
  };
  const hasPending = inFrame?.highlighterPending === true;
  if ((inFrame?.length ?? 0) < 3 && !hasPending) {
    await browser.switchToFrame(null);
    const rect = await callSmokeApi<{ x: number; y: number; x2: number; y2: number } | null>(
      "epubPointerSelectionRect",
    );
    if (rect) {
      const inner = (await browser.execute(function () {
        return { width: window.innerWidth, height: window.innerHeight };
      })) as { width: number; height: number };
      const clamped = clampTopViewport(rect, inner);
      await pointerDragViewport(clamped.x, clamped.y, clamped.x2, clamped.y2, 500);
      const diag = await callSmokeApi<Record<string, unknown>>("epubSelectionDiagnostics");
      const sel = diag.selection as { selections: { length: number }[] };
      const contentLen = sel.selections?.reduce((n, s) => n + (s.length ?? 0), 0) ?? 0;
      if (contentLen >= 3 || diag.highlighterPending === true) {
        return {
          space: "foliate-top-viewport-drag",
          stayInFrame: false,
          frameMeta,
          frameDrag,
          topViewportDrag: rect,
          selectionAfterDrag: diag,
          renderInfo,
        };
      }
    }
    const diag = await callSmokeApi<Record<string, unknown>>("epubSelectionDiagnostics");
    return dumpEpubPointerFailure("after-shadow-drag-no-selection", { inFrame, frameDrag, diag });
  }
  const viewport = await callSmokeApi<{ x: number; y: number; x2: number; y2: number } | null>(
    "epubPointerSelectionRect",
  );
  // Stay in content iframe until S15/S19 press H (switchToFrame(null) clears book selection).
  return {
    space: "foliate-shadow-iframe",
    stayInFrame: true,
    frameMeta,
    frameDrag,
    viewport,
    selectionAfterDrag: { inFrame },
    renderInfo,
  };
}

async function pressHighlightSaveKeyForEpub(pointer: Record<string, unknown>) {
  if (pointer.stayInFrame === true) {
    await browser.keys(["H"]);
    await browser.pause(400);
    await browser.switchToFrame(null);
    return;
  }
  await pressHighlightSaveKey();
}

async function pressHighlightSaveKey() {
  await browser.execute(function () {
    const app = document.getElementById("app");
    (app ?? document.body).focus();
    const active = document.activeElement as HTMLElement | null;
    active?.blur?.();
    document.body.focus();
  });
  await browser.keys(["H"]);
  await browser.pause(400);
}

async function clickReaderChromeAwayFromText() {
  const pt = (await browser.execute(function () {
    const bar = document.querySelector(".reader-toolbar");
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    return { x: Math.floor(r.left + r.width / 2), y: Math.floor(r.top + r.height / 2) };
  })) as { x: number; y: number } | null;
  if (!pt) throw new Error("reader toolbar missing for dismiss click");
  await pointerDragViewport(pt.x, pt.y, pt.x, pt.y);
  await browser.pause(300);
}

async function cardSlug(kind: "pdf" | "epub" | "mobi"): Promise<string> {
  await goLibrary();
  const card = await $(`.book-card[data-kind="${kind}"]:not(.book-card--demo)`);
  const slug = await card.getAttribute("data-slug");
  if (!slug) throw new Error(`missing data-slug on ${kind} card`);
  return slug;
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
  let nudged = false;
  await browser.waitUntil(
    async () => {
      if ((await $("#epub-root").getAttribute("data-epub-text-ready")) !== "1") {
        if (!nudged) {
          nudged = true;
          try {
            await callSmokeApi<number>("ensureEpubReaderReady");
          } catch {
            /* reader still mounting */
          }
        }
        return false;
      }
      const visible = (await callSmokeApi<number>("epubVisibleTextLength")) ?? 0;
      if (visible <= 3) {
        try {
          await callSmokeApi<number>("ensureEpubReaderReady");
        } catch {
          /* ignore */
        }
      }
      return visible > 3;
    },
    { timeout: timeoutMs, interval: 800, timeoutMsg: "EPUB visible text not rendered" },
  );
}

async function goLibrary() {
  await $('[data-route="library"]').click();
  await browser.pause(600);
}

async function openQuotesTab() {
  await $('[data-route="quotes"]').click();
  await browser.waitUntil(
    async () => (await $('[data-quotes-ready="1"]')).isExisting(),
    { timeout: 20_000, timeoutMsg: "quotes overview not ready" },
  );
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

/** After S07 the suite may already be in the EPUB reader — avoid a redundant library round-trip. */
async function ensureEpubReaderOpen() {
  const onEpub = await browser.execute(() => {
    const app = document.getElementById("app");
    return !!document.querySelector("#epub-root") && !!app?.classList.contains("reading-mode");
  });
  if (onEpub) {
    await waitEpubTextReady(90_000);
    return;
  }
  await openEpubFromLibraryCard();
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
      if (loaded < 3) throw new Error(`expected PDF+EPUB+MOBI from folder scan (incl. subfolder), got ${loaded}`);
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
      const mobiCard = await $('.book-card[data-kind="mobi"]:not(.book-card--demo)');
      await expect(pdfCard).toBeDisplayed();
      await expect(epubCard).toBeDisplayed();
      await expect(mobiCard).toBeDisplayed();
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
      const mobi = await $('.book-card[data-kind="mobi"]:not(.book-card--demo)');
      await expect(mobi).toBeDisplayed();
      if (cards < 3) throw new Error(`expected ≥3 scanned cards (PDF+EPUB+MOBI), got ${cards}`);
      record("S04", "Auto-list PDF (podsložka) + EPUB + MOBI", true, `cards=${cards}`);
    } catch (e) {
      record("S04", "Auto-list PDF (podsložka) + EPUB + MOBI", false, String(e));
      throw e;
    }
  });

  it("S07 open EPUB from library card (visible text)", async () => {
    try {
      await goLibrary();
      await openEpubFromLibraryCard();
      await callSmokeApi<number>("ensureEpubReaderReady");
      const renderInfo = await callSmokeApi<{
        mode: string;
        iframeTextLength: number;
        fallbackTextLength: number;
        visibleTextLength: number;
      }>("epubReaderRenderInfo");
      await expect($("#epub-root foliate-view, #epub-root .epub-fallback-text")).toBeDisplayed();
      record(
        "S07",
        "Open EPUB from library card",
        true,
        JSON.stringify({ renderInfo }),
      );
    } catch (e) {
      record("S07", "Open EPUB from library card", false, String(e));
      throw e;
    }
  });

  it("S15 EPUB: výběr bez H neukládá; H uloží citaci", async function () {
    try {
      await ensureEpubReaderOpen();
      await callSmokeApi<number>("ensureEpubReaderReady");
      await ensureInspectorOpen();
      const slug = (await callSmokeApi<string>("currentBookSlug")) ?? (await cardSlug("epub"));
      const before = (await quoteFilesOnDisk(slug)).length;
      const pointer = await pointerSelectEpubText();
      let afterSelect = before;
      try {
        await browser.pause(500);
        afterSelect = (await quoteFilesOnDisk(slug)).length;
        if (afterSelect !== before) throw new Error(`EPUB selection alone created quote (${before} → ${afterSelect})`);
        await pressHighlightSaveKeyForEpub(pointer);
      } finally {
        if (pointer.stayInFrame === true) {
          try {
            await browser.switchToFrame(null);
          } catch {
            /* */
          }
          pointer.stayInFrame = false;
        }
      }
      try {
        await browser.waitUntil(
          async () => (await quoteFilesOnDisk(slug)).length > before,
          { timeout: 20_000, timeoutMsg: "EPUB quote .md after H" },
        );
      } catch {
        await dumpEpubPointerFailure("s15-after-H-no-quote-md");
      }
      const afterH = (await quoteFilesOnDisk(slug)).length;
      if (afterH !== before + 1) {
        throw new Error(`expected exactly one new quote .md after H (${before} → ${afterH})`);
      }
      const files = await quoteFilesOnDisk(slug);
      const quoteId = files.find((f) => f.endsWith(".md"))?.replace(/\.md$/, "") ?? "";
      if (!quoteId) throw new Error("EPUB quote id missing");
      await expect($("#inspector-body .quote-card__text")).toBeDisplayed();
      await expect($("#epub-root mark.quote-highlight, #epub-root .quote-highlight")).toBeExisting();
      await pointerSelectEpubText();
      await browser.pause(400);
      await clickReaderChromeAwayFromText();
      const afterDismiss = (await quoteFilesOnDisk(slug)).length;
      if (afterDismiss !== files.length) {
        throw new Error(`click away without H created quote (${files.length} → ${afterDismiss})`);
      }
      await openQuotesTab();
      await expect($(`[data-user-quote="${quoteId}"]`)).toBeDisplayed();
      const renderInfo = await callSmokeApi<Record<string, unknown>>("epubReaderRenderInfo");
      const s15Detail = JSON.stringify({
        renderInfo,
        pointer,
        quoteMdBefore: before,
        quoteMdAfterSelection: afterSelect,
        quoteMdAfterH: afterH,
        quoteId,
      });
      record("S15", "EPUB citace pouze po H (UI)", true, s15Detail);
    } catch (e) {
      record("S15", "EPUB citace pouze po H (UI)", false, String(e));
      throw e;
    }
  }).timeout(420_000);

  it("S05 PDF: výběr bez H neuloží .md", async () => {
    try {
      await openPdfFromLibraryCard();
      const slug = (await callSmokeApi<string>("currentBookSlug")) ?? (await cardSlug("pdf"));
      const before = (await quoteFilesOnDisk(slug)).length;
      await pointerSelectPdfText();
      await browser.pause(500);
      const after = (await quoteFilesOnDisk(slug)).length;
      if (after !== before) throw new Error(`PDF selection alone wrote quote (${before} → ${after})`);
      const pending = await browser.execute(() => {
        const sel = window.getSelection();
        return (sel?.toString().trim().length ?? 0) > 0;
      });
      if (!pending) throw new Error("PDF pointer selection did not leave text selected");
      await saveScreenshot("smoke-pdf-text-selected.png");
      record("S05", "PDF výběr bez citace", true, `quotes=${before}`);
    } catch (e) {
      record("S05", "PDF výběr bez citace", false, String(e));
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

  it("S14 PDF: H uloží .md + panel + zvýraznění", async () => {
    try {
      await openPdfFromLibraryCard();
      await ensureInspectorOpen();
      const slug = (await callSmokeApi<string>("currentBookSlug")) ?? (await cardSlug("pdf"));
      const before = (await quoteFilesOnDisk(slug)).length;
      await pointerSelectPdfText();
      await browser.pause(400);
      await pressHighlightSaveKey();
      await browser.waitUntil(
        async () => (await quoteFilesOnDisk(slug)).length > before,
        { timeout: 20_000, timeoutMsg: "PDF quote .md after H" },
      );
      const files = await quoteFilesOnDisk(slug);
      const quoteId = files[files.length - 1].replace(/\.md$/, "");
      await expect($("#inspector-body .quote-card__text")).toBeDisplayed();
      await expect($("#pdf-root mark.quote-highlight")).toBeExisting();
      await openQuotesTab();
      await expect($(`[data-user-quote="${quoteId}"]`)).toBeDisplayed();
      await openPdfFromLibraryCard();
      await ensureInspectorOpen();
      const panelText = await $("#inspector-body .quote-card__text").getText();
      if (!panelText.includes("Marginalia")) throw new Error(`unexpected quote text: ${panelText}`);
      record("S14", "PDF citace po H (UI)", true, quoteId);
    } catch (e) {
      record("S14", "PDF citace po H (UI)", false, String(e));
      throw e;
    }
  });

  it("S19 MOBI otevření — viditelný text + citace po H", async () => {
    try {
      if (!mobiPath) throw new Error("MARGINALIA_FIXTURE_MOBI not set");
      await goLibrary();
      const card = await $('.book-card[data-kind="mobi"]:not(.book-card--demo)');
      await card.click();
      await waitEpubTextReady(120_000);
      await callSmokeApi<number>("ensureEpubReaderReady");
      const renderInfo = await callSmokeApi<Record<string, unknown>>("epubReaderRenderInfo");
      const len = (await callSmokeApi<number>("epubVisibleTextLength")) ?? 0;
      if (len <= 3) throw new Error(`MOBI visible text too short: ${len}`);
      await saveScreenshot("smoke-mobi-visible.png");
      await ensureInspectorOpen();
      const slug = (await callSmokeApi<string>("currentBookSlug")) ?? (await cardSlug("mobi"));
      const before = (await quoteFilesOnDisk(slug)).length;
      const pointer = await pointerSelectEpubText();
      let afterSelect = before;
      try {
        await browser.pause(500);
        afterSelect = (await quoteFilesOnDisk(slug)).length;
        if (afterSelect !== before) throw new Error(`MOBI selection alone created quote (${before} → ${afterSelect})`);
        await pressHighlightSaveKeyForEpub(pointer);
      } finally {
        if (pointer.stayInFrame === true) {
          try {
            await browser.switchToFrame(null);
          } catch {
            /* */
          }
          pointer.stayInFrame = false;
        }
      }
      try {
        await browser.waitUntil(
          async () => (await quoteFilesOnDisk(slug)).length > before,
          { timeout: 20_000, timeoutMsg: "MOBI quote .md after H" },
        );
      } catch {
        await dumpEpubPointerFailure("s19-after-H-no-quote-md");
      }
      const afterH = (await quoteFilesOnDisk(slug)).length;
      if (afterH !== before + 1) {
        throw new Error(`expected exactly one new MOBI quote .md after H (${before} → ${afterH})`);
      }
      await expect($("#epub-root mark.quote-highlight, #epub-root .quote-highlight")).toBeExisting();
      record(
        "S19",
        "MOBI reader visible text + citace po H",
        true,
        JSON.stringify({ renderInfo, pointer, quoteMdBefore: before, quoteMdAfterH: afterH }),
      );
    } catch (e) {
      record("S19", "MOBI reader visible text + citace po H", false, String(e));
      throw e;
    }
  }).timeout(420_000);

  it("S20 citace knihy A ne u knihy B", async () => {
    try {
      const pdfSlug = await cardSlug("pdf");
      const epubSlug = await cardSlug("epub");
      const pdfQuotes = await quoteFilesOnDisk(pdfSlug);
      if (pdfQuotes.length < 1) throw new Error("need PDF quote from S14");
      const pdfText = await readLibraryText(`citace/${pdfSlug}/${pdfQuotes[0]}`);
      await openEpubFromLibraryCard();
      await ensureInspectorOpen();
      const epubFiles = await quoteFilesOnDisk(epubSlug);
      const panelText = await $("#inspector-body").getText();
      if (panelText.includes(pdfText.trim().slice(0, 24))) {
        throw new Error("EPUB panel shows PDF quote text");
      }
      if (epubFiles.length > 0) {
        for (const f of epubFiles) {
          if (!f.endsWith(".md")) continue;
          const body = await readLibraryText(`citace/${epubSlug}/${f}`);
          if (body.includes(pdfText.trim().slice(0, 24))) {
            throw new Error("EPUB slug folder contains PDF quote");
          }
        }
      }
      record("S20", "Per-book quotes in panel", true, `pdf=${pdfQuotes.length} epub=${epubFiles.length}`);
    } catch (e) {
      record("S20", "Per-book quotes in panel", false, String(e));
      throw e;
    }
  });

  it("S21 Autor → knihy/*.md + chipy", async () => {
    try {
      await openPdfFromLibraryCard();
      const slug = (await callSmokeApi<string>("currentBookSlug")) ?? (await cardSlug("pdf"));
      const author = "Smoke Autor Fixture";
      const input = await $("#reader-author");
      await input.waitForDisplayed({ timeout: 15_000 });
      await input.setValue(author);
      await input.click();
      await browser.keys(["Tab"]);
      await browser.pause(800);
      const cardMd = await readLibraryText(`knihy/${slug}.md`);
      if (!cardMd.includes(author)) throw new Error(`author not in knihy/${slug}.md`);
      await ensureInspectorOpen();
      const chip = await $("#inspector-body .tag-chip--meta[title='Autor']");
      await expect(chip).toBeDisplayed();
      const chipText = await chip.getText();
      if (!chipText.includes(author)) throw new Error(`panel author chip: ${chipText}`);
      await goLibrary();
      await openQuotesTab();
      const quoteFiles = await quoteFilesOnDisk(slug);
      if (!quoteFiles.length) throw new Error("expected PDF quote for author chip check");
      const qid = quoteFiles[0].replace(/\.md$/, "");
      const tabChip = await $(`[data-user-quote="${qid}"] .tag-chip--meta[title='Autor']`);
      await expect(tabChip).toBeDisplayed();
      const tabAuthor = await tabChip.getText();
      if (!tabAuthor.includes(author)) throw new Error(`quotes tab author: ${tabAuthor}`);
      record("S21", "Autor field syncs card + chips", true, slug);
    } catch (e) {
      record("S21", "Autor field syncs card + chips", false, String(e));
      throw e;
    }
  });

  it("S22 poznámka k citaci přežije restart", async () => {
    try {
      await openPdfFromLibraryCard();
      await ensureInspectorOpen();
      const slug = (await callSmokeApi<string>("currentBookSlug")) ?? (await cardSlug("pdf"));
      const files = await quoteFilesOnDisk(slug);
      if (!files.length) throw new Error("no PDF quote for note test");
      const quoteId = files[0].replace(/\.md$/, "");
      const note = "Smoke poznámka citace 7391";
      const area = await $(`textarea[data-quote-comment="${quoteId}"]`);
      await area.waitForDisplayed({ timeout: 10_000 });
      await area.setValue(note);
      await area.click();
      await browser.keys(["Tab"]);
      await browser.pause(800);
      let md = await readLibraryText(`citace/${slug}/${quoteId}.md`);
      if (!md.includes(note)) throw new Error("note not in .md before restart");
      await browser.reloadSession();
      await browser.pause(4500);
      await openPdfFromLibraryCard();
      await ensureInspectorOpen();
      md = await readLibraryText(`citace/${slug}/${quoteId}.md`);
      if (!md.includes(note)) throw new Error("note missing in .md after restart");
      const area2 = await $(`textarea[data-quote-comment="${quoteId}"]`);
      await area2.waitForDisplayed({ timeout: 15_000 });
      const val = await area2.getValue();
      if (!val.includes(note)) throw new Error(`textarea after restart: ${val}`);
      record("S22", "Quote note persists restart", true, quoteId);
    } catch (e) {
      record("S22", "Quote note persists restart", false, String(e));
      throw e;
    }
  });

  it("S23 PDF stránka citace + counter", async () => {
    try {
      await openPdfFromLibraryCard();
      await ensureInspectorOpen();
      const slug = (await callSmokeApi<string>("currentBookSlug")) ?? (await cardSlug("pdf"));
      const scrollSecond = await browser.execute(function () {
        const surface = document.querySelector(".reader-surface");
        const pages = document.querySelectorAll("#pdf-root .pdf-page");
        if (!surface || pages.length < 2) return false;
        const target = pages[1];
        surface.scrollTop = Math.max(0, target.offsetTop - surface.clientHeight / 2);
        return true;
      });
      if (!scrollSecond) throw new Error("fixture PDF must have ≥2 pages");
      await browser.pause(1200);
      const counter = await $("#reader-page-counter");
      await browser.waitUntil(
        async () => {
          const t = await counter.getText();
          return /2\/2/.test(t);
        },
        { timeout: 15_000, timeoutMsg: "page counter not on 2/2" },
      );
      const before = (await quoteFilesOnDisk(slug)).length;
      const rect = (await browser.execute(function () {
        const layers = document.querySelectorAll("#pdf-root .textLayer");
        if (layers.length < 2) return null;
        const span = layers[1].querySelector("span");
        if (!span) return null;
        const r = span.getBoundingClientRect();
        return {
          x: Math.floor(r.left + 6),
          y: Math.floor(r.top + r.height / 2),
          x2: Math.floor(r.right - 6),
          y2: Math.floor(r.top + r.height / 2),
        };
      })) as { x: number; y: number; x2: number; y2: number } | null;
      if (!rect) throw new Error("page-two text missing");
      await pointerDragViewport(rect.x, rect.y, rect.x2, rect.y2);
      await pressHighlightSaveKey();
      await browser.waitUntil(
        async () => (await quoteFilesOnDisk(slug)).length > before,
        { timeout: 20_000, timeoutMsg: "page-2 quote not saved" },
      );
      const files = await quoteFilesOnDisk(slug);
      const newest = files[files.length - 1];
      const md = await readLibraryText(`citace/${slug}/${newest}`);
      if (!/^page:\s*"?2"?\s*$/m.test(md)) {
        throw new Error(`quote frontmatter page not 2: ${md.slice(0, 400)}`);
      }
      const cards = await $$("#inspector-body .quote-card");
      let labelText = "";
      for (const card of cards) {
        const pageDiv = await card.$(".quote-card__page");
        const t = await pageDiv.getText();
        if (t.includes("2")) {
          labelText = t;
          break;
        }
      }
      if (!labelText.includes("2")) throw new Error(`quote page label expected str. 2, got ${labelText}`);
      record("S23", "PDF page label + counter", true, labelText);
    } catch (e) {
      record("S23", "PDF page label + counter", false, String(e));
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