const path = require("node:path");

const appExe = process.env.MARGINALIA_APP_EXE;
if (!appExe) {
  throw new Error("MARGINALIA_APP_EXE must point to installed Marginalia.exe");
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
        },
      },
    },
  ],
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath: appExe,
        driverProvider: "official",
        autoInstallTauriDriver: false,
        autoDownloadEdgeDriver: true,
        tauriDriverPath: process.env.TAURI_DRIVER_PATH || "tauri-driver",
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
    timeout: 180_000,
  },
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      transpileOnly: true,
      project: path.join(__dirname, "tsconfig.json"),
    },
  },
};