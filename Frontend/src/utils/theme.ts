export type ThemeMode = "light";

const THEME_STORAGE_KEY = "gleenc-theme";
const LEGACY_THEME_STORAGE_KEY = "gleank-theme";

export function resolveTheme(theme: ThemeMode): "light" {
  void theme;
  return "light";
}

export function getSavedTheme(): ThemeMode {
  localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  localStorage.setItem(THEME_STORAGE_KEY, "light");
  return "light";
}

export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  const resolvedTheme = resolveTheme(theme);

  root.setAttribute("data-theme", resolvedTheme);
  root.setAttribute("data-theme-preference", "light");
  root.classList.remove("dark");
  root.style.colorScheme = "light";
  localStorage.setItem(THEME_STORAGE_KEY, "light");
}

export function watchSystemTheme() {
  applyTheme("light");
  return () => undefined;
}
