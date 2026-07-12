export type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "gleenc-theme";
const LEGACY_THEME_STORAGE_KEY = "gleank-theme";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function systemPrefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function resolveTheme(theme: ThemeMode): "light" | "dark" {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

export function getSavedTheme(): ThemeMode {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

  if (isThemeMode(savedTheme)) {
    return savedTheme;
  }

  const legacyTheme = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);

  if (isThemeMode(legacyTheme)) {
    localStorage.setItem(THEME_STORAGE_KEY, legacyTheme);
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    return legacyTheme;
  }

  return "system";
}

export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  const resolvedTheme = resolveTheme(theme);

  root.setAttribute("data-theme", resolvedTheme);
  root.setAttribute("data-theme-preference", theme);
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function watchSystemTheme() {
  const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!mediaQuery) return () => undefined;

  const handleChange = () => {
    if (getSavedTheme() === "system") {
      applyTheme("system");
    }
  };

  mediaQuery.addEventListener?.("change", handleChange);
  return () => mediaQuery.removeEventListener?.("change", handleChange);
}
