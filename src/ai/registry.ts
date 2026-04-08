import { GeminiProvider } from "./gemini-provider";
import { readApiKeyForProvider } from "./credentials";
import { translations } from "../i18n/translations";
import type { AIProvider } from "./provider";
import type { AiProviderOption, AppLocale } from "../types";

const providers = new Map<string, AIProvider>([
  ["gemini-2.5-flash", new GeminiProvider("gemini-2.5-flash", "Gemini 2.5 Flash")],
  ["gemini-2.5-flash-latest", new GeminiProvider("gemini-2.5-flash-latest", "Gemini 2.5 Flash (Latest)")],
  ["gemini-2.5-flash-lite", new GeminiProvider("gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite")],
  [
    "gemini-3-flash-preview",
    new GeminiProvider("gemini-3-flash-preview", "Gemini 3 Flash Preview"),
  ],
]);

let providerOptions: AiProviderOption[] = buildBuiltinProviderOptions("en");

export function getProvider(id: string): AIProvider {
  if (!providers.has(id) && id.startsWith("gemini-")) {
    const label = friendlyGeminiLabel(id);
    providers.set(id, new GeminiProvider(id, label));
  }
  return providers.get(id) ?? providers.get("gemini-2.5-flash")!;
}

export function listProviders(): AIProvider[] {
  return Array.from(providers.values());
}

export function listProviderOptions(_locale?: AppLocale): AiProviderOption[] {
  return providerOptions;
}

export function isSupportedProviderOption(id: string): boolean {
  return providerOptions.some((option) => option.id === id);
}

export function providerHasKey(id: string): boolean {
  return Boolean(readApiKeyForProvider(id));
}

export function syncGeminiProviderOptions(models: AiProviderOption[]) {
  // When Gemini models are detected from the API, only expose that detected set.
  const byId = new Map<string, AiProviderOption>();
  for (const option of models) {
    if (!option.id.startsWith("gemini-")) continue;
    byId.set(option.id, option);
    if (!providers.has(option.id)) {
      providers.set(option.id, new GeminiProvider(option.id, option.label));
    }
  }

  providerOptions = Array.from(byId.values());
  // Keep a stable sort: non-experimental first, then label.
  providerOptions.sort((a, b) => {
    const ea = a.experimental ? 1 : 0;
    const eb = b.experimental ? 1 : 0;
    if (ea !== eb) return ea - eb;
    return a.label.localeCompare(b.label);
  });
}

export function ensureProviderOption(id: string, locale: AppLocale = "en") {
  if (!id) return;
  if (providerOptions.some((o) => o.id === id)) {
    return;
  }
  if (id.startsWith("gemini-") && id.includes("latest")) {
    const label = friendlyGeminiLabel(id);
    providerOptions = [
      ...providerOptions,
      {
        id,
        label,
        helper: translations[locale].providerHelperSaved,
        experimental: true,
        source: "saved",
      },
    ];
    // Keep it usable for analysis even before models.list runs.
    if (!providers.has(id)) {
      providers.set(id, new GeminiProvider(id, label));
    }
    providerOptions.sort((a, b) => a.label.localeCompare(b.label));
  }
}

export function localizeBuiltinProviderOptions(locale: AppLocale) {
  const localizedBuiltin = buildBuiltinProviderOptions(locale);
  const byId = new Map(providerOptions.map((option) => [option.id, option]));
  for (const builtin of localizedBuiltin) {
    const existing = byId.get(builtin.id);
    if (!existing || existing.source === "builtin") {
      byId.set(builtin.id, builtin);
    }
  }
  providerOptions = Array.from(byId.values());
}

function friendlyGeminiLabel(id: string) {
  const normalized = id.replace(/^gemini-/, "");
  const parts = normalized.split("-");
  const version = parts.shift();
  const rest = parts.join("-");
  const suffix = rest
    .split("-")
    .map((p) => (p.length ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
  return `Gemini ${version} ${suffix}`.trim();
}

function buildBuiltinProviderOptions(locale: AppLocale): AiProviderOption[] {
  return [
    {
      id: "gemini-2.5-flash-latest",
      label: "Gemini 2.5 Flash (Latest)",
      helper: translations[locale].providerHelperDefaultFlash,
      experimental: false,
      source: "builtin",
    },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      helper: translations[locale].providerHelperDefaultFlash,
      experimental: false,
      source: "builtin",
    },
    {
      id: "gemini-2.5-flash-lite",
      label: "Gemini 2.5 Flash-Lite",
      helper: translations[locale].providerHelperDefaultFlashLite,
      experimental: false,
      source: "builtin",
    },
    {
      id: "gemini-3-flash-preview",
      label: "Gemini 3 Flash Preview",
      helper: translations[locale].providerHelperDetected,
      experimental: true,
      source: "builtin",
    },
  ];
}
