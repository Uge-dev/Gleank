export type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "gleank-theme";

export function getSavedTheme(): ThemeMode {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

  if (
    savedTheme === "light" ||
    savedTheme === "dark" ||
    savedTheme === "system"
  ) {
    return savedTheme;
  }

  return "system";
}

export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;

  root.removeAttribute("data-theme");

  if (theme === "light") {
    root.setAttribute("data-theme", "light");
  }

  if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
  }

  localStorage.setItem(THEME_STORAGE_KEY, theme);
}