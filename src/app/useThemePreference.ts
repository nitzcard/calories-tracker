import { computed, watch, type ComputedRef, type Ref } from "vue";
import type { ThemePreference } from "../types";

export function useThemePreference(
  themePreference: Ref<ThemePreference | undefined> | ComputedRef<ThemePreference | undefined>,
) {
  const resolvedTheme = computed<"light" | "dark">(() => {
    if (themePreference.value === "light" || themePreference.value === "dark") {
      return themePreference.value;
    }

    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }

    return "light";
  });

  watch(
    [themePreference, resolvedTheme],
    ([preference, theme]) => {
      const root = document.documentElement;
      root.dataset.themePreference = preference ?? "system";
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
    },
    { immediate: true },
  );

  return { resolvedTheme };
}
