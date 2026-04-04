import { createI18n } from "vue-i18n";
import type { AppLocale } from "../types";
import { translations } from "./translations";

export function detectLocale(): AppLocale {
  const language = navigator.language.toLowerCase();
  return language.startsWith("he") ? "he" : "en";
}

export function localeDirection(locale: AppLocale): "rtl" | "ltr" {
  return locale === "he" ? "rtl" : "ltr";
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: "en",
  messages: translations,
});

export function syncI18nLocale(locale: AppLocale) {
  i18n.global.locale.value = locale;
}
