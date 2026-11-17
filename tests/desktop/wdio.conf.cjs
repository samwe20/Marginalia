const path = require("node:path");

const appExe = process.env.MARGINALIA_APP_EXE;
if (!appExe) {
  throw new Error("MARGINALIA_APP_EXE must point to installed Marginalia.exe");
}

/** Hard ceiling for the whole installed-app suite. Prefer failing over a hung runner. */
const suiteTimeoutMs = Number(process.env.MARGINALIA_SMOKE_SUITE_TIMEOUT_MS || 35 * 60 * 1000);

/**
 * @wdio/tauri-service auto-focus recovery calls browser.tauri.execute() → window.wdioTauri.
 * Marginalia uses driverProvider: "external" and does not ship @wdio/tauri-plugin, so each
 * $/click otherwise burns ~5s (100×50ms) looking for a bridge that will never appear, and
 * floods CI logs. Inject a tiny stub so the availability check succeeds immediately; the
 * subsequent plugin:wdio IPC calls fail fast and focus recovery no-ops.
 */
async function disarmMissingWdioPluginBridge(browser) {
  if (!browser || typeof browser.execute !== "function") return;
  await browser.execute(function installWdioTauriStub() {
    if (window.wdioTauri && typeof window.wdioTauri.execute === "function") return false;
    window.wdioTauri = {
      execute: function () {
        return Promise.reject(new Error("Marginalia smoke: @wdio/tauri-plugin not installed"));
      },
      waitForInit: function () {
        return Promise.resolve();
      },
    };
    return true;
  });
  try {
    const handles = await browser.getWindowHandles();
    if (handles.length) await browser.switchToWindow(handles[0]);
  } catch {
    /* Focus suppress is best-effort; the stub alone removes the 5s retry tax. */
  }
}

exports.config = {
  runner: "local",
  specs: [path.join(__dirname, "specs/**/*.spec.ts")],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: appExe,
        env: {
          MARGINALIA_SMOKE: "1",
          MARGINALIA_SMOKE_LIBRARY: process.env.MARGINALIA_SMOKE_LIBRARY ?? "",
          MARGINALIA_FIXTURE_PDF: process.env.MARGINALIA_FIXTURE_PDF ?? "",
          MARGINALIA_FIXTURE_EPUB: process.env.MARGINALIA_FIXTURE_EPUB ?? "",
          MARGINALIA_FIXTURE_MOBI: process.env.MARGINALIA_FIXTURE_MOBI ?? "",
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
  // info dumps every executeAsyncScript body (including the wdioTauri probe) and ballooned CI logs to 50–150MB.
  logLevel: "warn",
  waitforTimeout: 15_000,
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 3,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 300_000,
    // Keep going so smoke-results.json records every scenario; the PS1 gate still fails the job.
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
    if (!globalThis.__MARGINALIA_SMOKE_SUITE_TIMER__) {
      const deadline = Date.now() + suiteTimeoutMs;
      const timer = setInterval(() => {
        if (Date.now() < deadline) return;
        clearInterval(timer);
        // eslint-disable-next-line no-console
        console.error(
          `Installed-smoke suite exceeded ${suiteTimeoutMs}ms — aborting to avoid a hung runner`,
        );
        process.exit(2);
      }, 5_000);
      timer.unref?.();
      globalThis.__MARGINALIA_SMOKE_SUITE_TIMER__ = timer;
    }
    await disarmMissingWdioPluginBridge(browser);
  },
  beforeTest: async () => {
    const browser = globalThis.browser;
    await disarmMissingWdioPluginBridge(browser);
  },
  after: async () => {
    const timer = globalThis.__MARGINALIA_SMOKE_SUITE_TIMER__;
    if (timer) clearInterval(timer);
  },
};

exports.disarmMissingWdioPluginBridge = disarmMissingWdioPluginBridge;
