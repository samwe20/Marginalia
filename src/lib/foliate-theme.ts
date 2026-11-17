/** CSS injected into foliate iframes so book content follows app theme. */

export function foliateThemeCss(theme: "light" | "dark"): string {
  if (theme === "dark") {
    return `
@namespace epub "http://www.idpf.org/2007/ops";
html {
  color-scheme: dark !important;
  background: #000000 !important;
}
body, body * {
  background-color: transparent !important;
  background-image: none !important;
  color: #e8e8e8 !important;
  border-color: rgba(255,255,255,0.12) !important;
}
a { color: #c5cdd6 !important; }
img, svg, video { background: transparent !important; }
::selection { background: rgba(201, 160, 122, 0.45) !important; }
`;
  }
  return `
@namespace epub "http://www.idpf.org/2007/ops";
html {
  color-scheme: light !important;
  background: #f7f4ea !important;
}
body {
  background: transparent !important;
  color: #2c2a26 !important;
}
::selection { background: rgba(184, 107, 43, 0.28) !important; }
`;
}

export function appThemeIsDark(appRoot: Element | null = document.querySelector("#app")): boolean {
  const t = appRoot?.getAttribute("data-theme");
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}
