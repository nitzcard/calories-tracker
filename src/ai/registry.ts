import { GeminiProvider } from "./gemini-provider";
import { readGeminiApiKey } from "./credentials";
import { translations } from "../i18n/translations";
import {
  DEFAULT_GEMINI_MODEL,
  formatGeminiModelLabel,
  isGeminiModelId,
} from "./gemini-config";
import type { AIProvider } from "./provider";
import type { AiProviderOption, AppLocale } from "../types";

const providers = new Map<string, AIProvider>();

let providerOptions: AiProviderOption[] = [];

export function getGeminiProvider(id: string): AIProvider {
  const resolvedId = resolveProviderId(id);
  if (!providers.has(resolvedId) && isGeminiModelId(resolvedId)) {
    const label = formatGeminiModelLabel(resolvedId);
    providers.set(resolvedId, new GeminiProvider(resolvedId, label));
  }
  const fallbackId = providerOptions[0]?.id ?? DEFAULT_GEMINI_MODEL;
  return providers.get(resolvedId)
    ?? providers.get(fallbackId)
    ?? new GeminiProvider(fallbackId, formatGeminiModelLabel(fallbackId));
}

export function resolveProviderId(id: string) {
  if (providerOptions.some((option) => option.id === id)) {
    return id;
  }

  return providerOptions[0]?.id ?? id ?? DEFAULT_GEMINI_MODEL;
}

export function listProviderOptions(_locale?: AppLocale): AiProviderOption[] {
  return providerOptions;
}

export function isSupportedProviderOption(id: string): boolean {
  return providerOptions.some((option) => option.id === id);
}

export function hasGeminiApiKey(): boolean {
  return Boolean(readGeminiApiKey());
}

export function syncGeminiProviderOptions(models: AiProviderOption[]) {
  const byId = new Map<string, AiProviderOption>();
  for (const option of models) {
    if (!isGeminiModelId(option.id)) continue;
    byId.set(option.id, option);
    if (!providers.has(option.id)) {
      providers.set(option.id, new GeminiProvider(option.id, option.label));
    }
  }

  providerOptions = Array.from(byId.values());
  providerOptions.sort((a, b) => {
    const ea = a.experimental ? 1 : 0;
    const eb = b.experimental ? 1 : 0;
    if (ea !== eb) return ea - eb;
    return a.label.localeCompare(b.label);
  });
}

export function ensureProviderOption(id: string, _locale: AppLocale = "en") {
  if (!id) return;
  if (providerOptions.some((o) => o.id === id)) {
    return;
  }
  if (isGeminiModelId(id)) {
    const label = formatGeminiModelLabel(id);
    providerOptions = [
      ...providerOptions,
      {
        id,
        label,
        helper: translations[_locale].analysisModelSavedHelper,
        experimental: true,
        source: "saved",
      },
    ];
    if (!providers.has(id)) {
      providers.set(id, new GeminiProvider(id, label));
    }
    providerOptions.sort((a, b) => a.label.localeCompare(b.label));
  }
}
