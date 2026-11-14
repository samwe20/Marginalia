import "@fontsource-variable/literata";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import { bootApp } from "./app";
import { exposeE2EHarness } from "./lib/e2e-harness";
import { bindSystemTheme } from "./ui/theme";

window.addEventListener("DOMContentLoaded", () => {
  if (new URLSearchParams(location.search).has("e2e")) {
    exposeE2EHarness();
    return;
  }
  const root = document.querySelector("#app");
  if (!root) throw new Error("Missing app root");
  root.classList.add("app");
  bindSystemTheme(root as HTMLElement);
  void bootApp(root as HTMLElement);
});