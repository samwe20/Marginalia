/// <reference types="vitest/config" />
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  base: "./",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || true,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
  build: { target: "es2020" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));