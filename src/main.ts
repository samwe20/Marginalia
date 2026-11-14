import { bootApp } from "./app";
import { exposeE2EHarness } from "./lib/e2e-harness";

window.addEventListener("DOMContentLoaded", () => {
  if (new URLSearchParams(location.search).has("e2e")) {
    exposeE2EHarness();
    return;
  }
  const root = document.querySelector("#app");
  if (!root) throw new Error("Missing app root");
  void bootApp(root as HTMLElement);
});