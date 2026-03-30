import type { ThemeMode } from "../types";

export function detectThemeMode(): ThemeMode {
  return "system";
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" | "purple-dark" {
  if (mode !== "system") {
    return mode;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved === "light" ? "light" : "dark";
  document.body.dataset.theme = resolved;
}
