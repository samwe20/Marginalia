import fs from "node:fs";
import path from "node:path";
import { browser, $, expect } from "@wdio/globals";

const library = process.env.MARGINALIA_SMOKE_LIBRARY!;
const artifactDir =
  process.env.SMOKE_ARTIFACTS_DIR ?? path.join(process.cwd(), "test-results", "desktop-stress");
const manifestPath = process.env.MARGINALIA_STRESS_MANIFEST || path.join(library, "manifest.json");

type Row = { id: string; name: string; ok: boolean; detail?: string; ms?: number };
type Manifest = {
  books: { total: number };
  quotes: { total: number };
  notes: { total: number };
  thresholds: {
    expectedBooks: number;
    expectedQuotes: number;
    expectedNotes: number;
    initialScanMsMax: number;
    rescanMsMax: number;
  };
};
type ScanJob = {
  kind: "idle" | "setup" | "rescan";
  running: boolean;
  books: number;
  imported: number;
  error: string | null;
};

const results: Row[] = [];
const metrics: Record<string, number | string | boolean | null> = {};

function record(id: string, name: string, ok: boolean, detail?: string, ms?: number) {
  results.push({ id, name, ok, detail, ms });
}

function loadManifest(): Manifest {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`stress manifest missing: ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
}

async function invoke(cmd: string, args: Record<string, unknown> = {}) {
  return browser.execute(
    ({ command, payload }) => {
      const tauri = (
        window as unknown as { __TAURI__: { core: { invoke: (c: string, a: object) => Promise<unknown> } } }
      ).__TAURI__;
      return tauri.core.invoke(command, payload);
    },
    { command: cmd, payload: args },
  );
}

async function callSmokeApi<T>(method: string, ...args: unknown[]): Promise<T> {
  return browser.execute(
    function callMarginaliaSmokeApi(payload) {
      var m = payload.m;
      var a = payload.a;
      var api = window.__MARGINALIA_SMOKE_API__;
      if (!api) throw new Error("__MARGINALIA_SMOKE_API__ missing (MARGINALIA_SMOKE=1?)");
      var fn = (api as unknown as Record<string, unknown>)[m];
      if (typeof fn !== "function") throw new Error("smoke API missing method: " + m);
      return (fn as (...x: unknown[]) => unknown).apply(api, a);
    },
    { m: method, a: args },
  ) as Promise<T>;
}

async function disarmMissingWdioPluginBridge() {
  await browser.execute(`
    if (window.wdioTauri && typeof window.wdioTauri.execute === "function") return false;
    window.wdioTauri = {
      execute: function () { return Promise.reject(new Error("Marginalia stress: @wdio/tauri-plugin not installed")); },
      waitForInit: function () { return Promise.resolve(); }
    };
    return true;
  `);
}

async function goLibrary() {
  await $('[data-route="library"]').click();
  await browser.pause(400);
}

async function sampleMemory(label: string) {
  try {
    const mem = await callSmokeApi<{ usedJsHeapMb: number | null; totalJsHeapMb: number | null }>(
      "libraryMemoryMb",
    );
    metrics[`${label}UsedJsHeapMb`] = mem.usedJsHeapMb;
    metrics[`${label}TotalJsHeapMb`] = mem.totalJsHeapMb;
    return mem;
  } catch {
    metrics[`${label}UsedJsHeapMb`] = null;
    return null;
  }
}

function writeArtifacts() {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "stress-results.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(artifactDir, "stress-metrics.json"), JSON.stringify(metrics, null, 2));

  const threshInitial = metrics.initialScanMsMax ?? "";
  const threshRescan = metrics.rescanMsMax ?? "";
  const summaryLines = [
    "| metric | value | threshold |",
    "|--------|-------|-----------|",
    `| initialScanMs | ${metrics.initialScanMs ?? ""} | ${threshInitial} |`,
    `| rescanMs | ${metrics.rescanMs ?? ""} | ${threshRescan} |`,
    `| secondRescanMs | ${metrics.secondRescanMs ?? ""} | ${threshRescan} |`,
    `| books | ${metrics.books ?? metrics.initialBookCount ?? ""} | ${metrics.expectedBooks ?? ""} |`,
    `| quotes | ${metrics.quotes ?? ""} | ${metrics.expectedQuotes ?? ""} |`,
    `| notes | ${metrics.notes ?? ""} | ${metrics.expectedNotes ?? ""} |`,
    `| afterImportUsedJsHeapMb | ${metrics.afterImportUsedJsHeapMb ?? ""} | — |`,
    `| afterRescanUsedJsHeapMb | ${metrics.afterRescanUsedJsHeapMb ?? ""} | — |`,
    `| duplicateSlugCount | ${metrics.duplicateSlugCount ?? ""} | 0 |`,
    `| duplicateShaCount | ${metrics.duplicateShaCount ?? ""} | 0 |`,
  ];

  const caseLines = [
    "| id | name | ok | ms | detail |",
    "|----|------|----|----|--------|",
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.name} | ${r.ok ? "✓" : "✗"} | ${r.ms ?? ""} | ${(r.detail ?? "").replace(/\|/g, "/")} |`,
    ),
  ];

  // eslint-disable-next-line no-console
  console.log("\n=== stress metrics table ===\n" + summaryLines.join("\n") + "\n");
  // eslint-disable-next-line no-console
  console.log("=== stress cases ===\n" + caseLines.join("\n") + "\n");
  // eslint-disable-next-line no-console
  console.log("stress-metrics.json:", JSON.stringify(metrics, null, 2));
}

/**
 * Kick off a long library scan outside a single WebDriver execute, then poll
 * short status calls so connectionRetryTimeout cannot abort mid-scan.
 */
async function awaitScanJob(
  startMethod: "startLibrarySetupScan" | "startRescanBooks",
  startArgs: unknown[],
  timeoutMs: number,
): Promise<ScanJob> {
  const started = await callSmokeApi<{ started: boolean }>(startMethod, ...startArgs);
  if (!started?.started) throw new Error(`${startMethod} did not start`);

  const deadline = Date.now() + timeoutMs;
  let last: ScanJob = { kind: "idle", running: true, books: 0, imported: 0, error: null };
  while (Date.now() < deadline) {
    last = await callSmokeApi<ScanJob>("libraryScanJob");
    if (!last.running) {
      if (last.error && last.error !== "cancelled") {
        throw new Error(`${startMethod} failed: ${last.error}`);
      }
      return last;
    }
    await browser.pause(1_500);
  }
  try {
    await callSmokeApi("cancelLibraryScan");
  } catch {
    /* best-effort — stop ghost scan before the next test */
  }
  throw new Error(`${startMethod} still running after ${timeoutMs}ms (last books=${last.books})`);
}

describe("Marginalia installed-app stress", () => {
  const manifest = loadManifest();
  const expectedBooks = manifest.thresholds.expectedBooks;
  const expectedQuotes = manifest.thresholds.expectedQuotes;
  const expectedNotes = manifest.thresholds.expectedNotes;
  const initialScanMsMax = Number(
    process.env.MARGINALIA_STRESS_INITIAL_MS_MAX || manifest.thresholds.initialScanMsMax,
  );
  const rescanMsMax = Number(
    process.env.MARGINALIA_STRESS_RESCAN_MS_MAX || manifest.thresholds.rescanMsMax,
  );

  afterEach(() => {
    try {
      writeArtifacts();
    } catch {
      /* best-effort so hung suite still leaves partial metrics */
    }
  });

  after(() => {
    writeArtifacts();
  });

  it("T00 shell + smoke API", async () => {
    await browser.pause(2500);
    await disarmMissingWdioPluginBridge();
    try {
      await expect($('[data-route="library"]')).toBeDisplayed();
      const apiOk = await browser.execute(() => Boolean(window.__MARGINALIA_SMOKE_API__));
      if (!apiOk) throw new Error("__MARGINALIA_SMOKE_API__ missing");
      metrics.libraryRoot = library;
      metrics.expectedBooks = expectedBooks;
      metrics.expectedQuotes = expectedQuotes;
      metrics.expectedNotes = expectedNotes;
      metrics.initialScanMsMax = initialScanMsMax;
      metrics.rescanMsMax = rescanMsMax;
      await sampleMemory("baseline");
      record("T00", "Shell + smoke API", true, library);
    } catch (e) {
      record("T00", "Shell + smoke API", false, String(e));
      throw e;
    }
  });

  it("T01 initial library setup scan (~1000 books)", async () => {
    try {
      await invoke("smoke_reset_first_run");
      await callSmokeApi("resetFirstRunClientState");
      await browser.pause(800);

      const t0 = Date.now();
      const job = await awaitScanJob("startLibrarySetupScan", [library], initialScanMsMax + 120_000);
      const initialScanMs = Date.now() - t0;
      const loaded = job.books;
      metrics.initialScanMs = initialScanMs;
      metrics.initialBookCount = loaded;
      await sampleMemory("afterImport");

      if (loaded !== expectedBooks) {
        throw new Error(`expected ${expectedBooks} books after setup scan, got ${loaded}`);
      }
      if (initialScanMs > initialScanMsMax) {
        throw new Error(`initial scan ${initialScanMs}ms exceeded max ${initialScanMsMax}ms`);
      }

      await goLibrary();
      record(
        "T01",
        "Initial setup scan reaches expected book count",
        true,
        `books=${loaded}`,
        initialScanMs,
      );
    } catch (e) {
      record("T01", "Initial setup scan reaches expected book count", false, String(e));
      throw e;
    }
  }).timeout(900_000);

  it("T02 no duplicate slugs/shas", async () => {
    try {
      const summary = await callSmokeApi<{
        books: number;
        uniqueSlugs: number;
        uniqueShas: number;
        duplicateSlugCount: number;
        duplicateShaCount: number;
      }>("libraryStressSummary");

      metrics.books = summary.books;
      metrics.uniqueSlugs = summary.uniqueSlugs;
      metrics.uniqueShas = summary.uniqueShas;
      metrics.duplicateSlugCount = summary.duplicateSlugCount;
      metrics.duplicateShaCount = summary.duplicateShaCount;

      if (summary.books !== expectedBooks) {
        throw new Error(`book count ${summary.books} ≠ expected ${expectedBooks}`);
      }
      if (summary.uniqueSlugs !== summary.books || summary.duplicateSlugCount > 0) {
        throw new Error(
          `duplicate slugs: unique=${summary.uniqueSlugs} books=${summary.books} dupes=${summary.duplicateSlugCount}`,
        );
      }
      if (summary.uniqueShas !== summary.books || summary.duplicateShaCount > 0) {
        throw new Error(
          `duplicate shas: unique=${summary.uniqueShas} books=${summary.books} dupes=${summary.duplicateShaCount}`,
        );
      }
      record(
        "T02",
        "No duplicate book cards (slug/sha)",
        true,
        `books=${summary.books} slugs=${summary.uniqueSlugs} shas=${summary.uniqueShas}`,
      );
    } catch (e) {
      record("T02", "No duplicate book cards (slug/sha)", false, String(e));
      throw e;
    }
  }).timeout(300_000);

  it("T03 quotes + notes counts", async () => {
    try {
      const counts = await callSmokeApi<{ quotes: number; notes: number }>("libraryContentCounts");
      metrics.quotes = counts.quotes;
      metrics.notes = counts.notes;

      if (counts.quotes < expectedQuotes) {
        throw new Error(`quotes ${counts.quotes} < expected ${expectedQuotes}`);
      }
      if (counts.notes < expectedNotes) {
        throw new Error(`notes ${counts.notes} < expected ${expectedNotes}`);
      }
      record(
        "T03",
        "Preseeded quotes + notes load",
        true,
        `quotes=${counts.quotes} notes=${counts.notes}`,
      );
    } catch (e) {
      record("T03", "Preseeded quotes + notes load", false, String(e));
      throw e;
    }
  }).timeout(600_000);

  it("T04 rescan unchanged library (threshold + no growth)", async () => {
    try {
      const before = await callSmokeApi<number>("countScannedBookCards");
      const t0 = Date.now();
      const job = await awaitScanJob("startRescanBooks", [], rescanMsMax + 120_000);
      const rescanMs = Date.now() - t0;
      const after = await callSmokeApi<number>("countScannedBookCards");

      metrics.rescanMs = rescanMs;
      metrics.rescanImported = job.imported;
      metrics.rescanTotal = job.books;
      metrics.rescanBookCount = after;
      await sampleMemory("afterRescan");

      if (after !== before || after !== expectedBooks) {
        throw new Error(`rescan grew/shrank books ${before} → ${after} (expected ${expectedBooks})`);
      }
      if (job.books !== expectedBooks) {
        throw new Error(`rescan.total ${job.books} ≠ expected ${expectedBooks}`);
      }
      if (rescanMs > rescanMsMax) {
        throw new Error(`rescan ${rescanMs}ms exceeded max ${rescanMsMax}ms`);
      }
      const initialMs = Number(metrics.initialScanMs || 0);
      if (initialMs > 0 && rescanMs > initialMs * 1.5 + 5_000) {
        throw new Error(
          `rescan ${rescanMs}ms much slower than initial ${initialMs}ms (ratio threshold)`,
        );
      }

      record(
        "T04",
        "Rescan unchanged library within threshold",
        true,
        `total=${job.books} imported=${job.imported}`,
        rescanMs,
      );
    } catch (e) {
      record("T04", "Rescan unchanged library within threshold", false, String(e));
      throw e;
    }
  }).timeout(900_000);

  it("T05 second rescan still stable", async () => {
    try {
      const before = await callSmokeApi<number>("countScannedBookCards");
      const t0 = Date.now();
      const job = await awaitScanJob("startRescanBooks", [], rescanMsMax + 120_000);
      const secondRescanMs = Date.now() - t0;
      const after = await callSmokeApi<number>("countScannedBookCards");
      metrics.secondRescanMs = secondRescanMs;
      metrics.secondRescanTotal = job.books;

      if (after !== before || after !== expectedBooks) {
        throw new Error(`second rescan changed count ${before} → ${after}`);
      }
      if (secondRescanMs > rescanMsMax) {
        throw new Error(`second rescan ${secondRescanMs}ms exceeded max ${rescanMsMax}ms`);
      }
      record("T05", "Second rescan stable", true, `total=${job.books}`, secondRescanMs);
    } catch (e) {
      record("T05", "Second rescan stable", false, String(e));
      throw e;
    }
  }).timeout(900_000);

  it("T06 metrics artifact written", async () => {
    try {
      metrics.ok = results.every((r) => r.ok);
      metrics.failed = results.filter((r) => !r.ok).map((r) => r.id).join(",");
      writeArtifacts();
      if (!fs.existsSync(path.join(artifactDir, "stress-metrics.json"))) {
        throw new Error("stress-metrics.json missing");
      }
      record("T06", "stress-metrics.json written", true, artifactDir);
    } catch (e) {
      record("T06", "stress-metrics.json written", false, String(e));
      throw e;
    }
  });
});
