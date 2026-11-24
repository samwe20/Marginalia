const path = require("node:path");

const appExe = process.env.MARGINALIA_APP_EXE;
if (!appExe) {
  throw new Error("MARGINALIA_APP_EXE must point to installed Marginalia.exe");
}

/** Hard ceiling for the stress suite (scan of ~1000 books + rescan). */
const suiteTimeoutMs = Number(process.env.MARGINALIA_STRESS_SUITE_TIMEOUT_MS || 60 * 60 * 1000);

async function disarmMissingWdioPluginBridge(browser) {
  if (!browser || typeof browser.execute !== "function") return;
  await browser.execute(`
    if (window.wdioTauri && typeof window.wdioTauri.execute === "function") return false;
    window.wdioTauri = {
      execute: function () { return Promise.reject(new Error("Marginalia stress: @wdio/tauri-plugin not installed")); },
      waitForInit: function () { return Promise.resolve(); }
    };
    return true;
  `);
  try {
    const handles = await browser.getWindowHandles();
    if (handles.length) await browser.switchToWindow(handles[0]);
  } catch {
    /* best-effort */
  }
}

exports.config = {
  runner: "local",
  specs: [path.join(__dirname, "specs/stress.spec.ts")],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: appExe,
        env: {
          MARGINALIA_SMOKE: "1",
          MARGINALIA_SMOKE_DEFER_LIBRARY: process.env.MARGINALIA_SMOKE_DEFER_LIBRARY ?? "1",
          MARGINALIA_SMOKE_LIBRARY: process.env.MARGINALIA_SMOKE_LIBRARY ?? "",
        },
      },
    },
  ],
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath: appExe,
        driverProvider: "external",
        autoInstallTauriDriver: false,
        autoDownloadEdgeDriver: true,
        startTimeout: 90_000,
        ...(process.env.TAURI_DRIVER_PATH ? { tauriDriverPath: process.env.TAURI_DRIVER_PATH } : {}),
      },
    ],
  ],
  logLevel: "warn",
  waitforTimeout: 30_000,
  // Short execute/poll calls only — long scans run in-app via startLibrarySetupScan.
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 900_000,
    bail: 0,
  },
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      transpileOnly: true,
      project: path.join(__dirname, "tsconfig.json"),
    },
  },
  before: async (_capabilities, _specs, browser) => {
    if (!globalThis.__MARGINALIA_STRESS_SUITE_TIMER__) {
      const deadline = Date.now() + suiteTimeoutMs;
      const timer = setInterval(() => {
        if (Date.now() < deadline) return;
        clearInterval(timer);
        // eslint-disable-next-line no-console
        console.error(
          `Installed-stress suite exceeded ${suiteTimeoutMs}ms — aborting to avoid a hung runner`,
        );
        process.exit(2);
      }, 5_000);
      timer.unref?.();
      globalThis.__MARGINALIA_STRESS_SUITE_TIMER__ = timer;
    }
    // Scans are started via short smoke API calls and polled; keep script timeout
    // generous for libraryStressSummary / content counts only.
    try {
      await browser.setTimeout({ script: 10 * 60 * 1000 });
    } catch {
      /* older drivers may ignore */
    }
    await disarmMissingWdioPluginBridge(browser);
  },
  beforeTest: async () => {
    const browser = globalThis.browser;
    try {
      await browser.setTimeout({ script: 10 * 60 * 1000 });
    } catch {
      /* ignore */
    }
    await disarmMissingWdioPluginBridge(browser);
  },
  after: async () => {
    const timer = globalThis.__MARGINALIA_STRESS_SUITE_TIMER__;
    if (timer) clearInterval(timer);
  },
};
