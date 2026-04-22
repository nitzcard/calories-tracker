import type { DesignMode, ThemeMode } from "../types";

export function detectThemeMode(): ThemeMode {
  return "system";
}

export function resolveTheme(themeMode: ThemeMode): "light" | "dark" {
  if (themeMode !== "system") {
    return themeMode;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(themeMode: ThemeMode, designMode: DesignMode) {
  const resolvedTheme = resolveTheme(themeMode);
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.design = designMode;
  document.documentElement.style.colorScheme = resolvedTheme;
  document.body.dataset.theme = resolvedTheme;
  document.body.dataset.design = designMode;
}
