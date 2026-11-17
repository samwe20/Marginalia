const path = require("node:path");

const appExe = process.env.MARGINALIA_APP_EXE;
if (!appExe) {
  throw new Error("MARGINALIA_APP_EXE must point to installed Marginalia.exe");
}

/** Hard ceiling for the whole installed-app suite (install + WDIO). Prefer failing over a hung runner. */
const suiteTimeoutMs = Number(process.env.MARGINALIA_SMOKE_SUITE_TIMEOUT_MS || 35 * 60 * 1000);

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
  logLevel: "info",
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
  /**
   * After browser.reloadSession(), @wdio/tauri-service still tries to recover window focus via
   * browser.tauri.execute() → window.wdioTauri. The external tauri-driver path never injects that
   * bridge, so every $/click after a restart burns ~5s of retries and can flood CI logs. Pinning
   * the current window handle marks the session as "user switched" and disables that loop.
   */
  before: async () => {
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
  },
  after: async () => {
    const timer = globalThis.__MARGINALIA_SMOKE_SUITE_TIMER__;
    if (timer) clearInterval(timer);
  },
};
