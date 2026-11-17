export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "marginalia.themePreference";

export function loadThemePreference(): ThemePreference {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function saveThemePreference(mode: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, mode);
}

export function resolveEffectiveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemeToApp(app: HTMLElement, pref: ThemePreference): "light" | "dark" {
  const effective = resolveEffectiveTheme(pref);
  app.dataset.theme = effective;
  document.documentElement.style.colorScheme = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", effective === "dark" ? "#000000" : "#f3efe4");
  return effective;
}

/** Folio-style: system default, user can override in Nastavení. */
export function initThemePreference(app: HTMLElement): {
  getPreference: () => ThemePreference;
  setPreference: (mode: ThemePreference) => "light" | "dark";
  getEffective: () => "light" | "dark";
} {
  let pref = loadThemePreference();
  applyThemeToApp(app, pref);

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (pref === "system") applyThemeToApp(app, "system");
  };
  mq.addEventListener("change", onSystem);

  return {
    getPreference: () => pref,
    setPreference: (mode) => {
      pref = mode;
      saveThemePreference(mode);
      return applyThemeToApp(app, mode);
    },
    getEffective: () => resolveEffectiveTheme(pref),
  };
}