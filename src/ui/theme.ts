/** Sync Folio-style `data-theme` with OS light/dark preference. */
export function bindSystemTheme(app: HTMLElement): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  const apply = () => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    app.dataset.theme = dark ? "dark" : "light";
    meta?.setAttribute("content", dark ? "#000000" : "#f3efe4");
  };
  apply();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
}