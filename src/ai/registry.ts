import { GeminiProvider } from "./gemini-provider";
import { readApiKeyForProvider } from "./credentials";
import type { AIProvider } from "./provider";
import type { AiProviderOption } from "../types";

const providers = new Map<string, AIProvider>([
  ["gemini-2.5-flash", new GeminiProvider("gemini-2.5-flash", "Gemini 2.5 Flash")],
  ["gemini-2.5-flash-lite", new GeminiProvider("gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite")],
  [
    "gemini-3-flash-preview",
    new GeminiProvider("gemini-3-flash-preview", "Gemini 3 Flash Preview"),
  ],
]);

let providerOptions: AiProviderOption[] = [
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    helper: "Best stable free default for Hebrew and English food logs.",
    experimental: false,
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    helper: "Faster and lighter fallback for high-volume text parsing.",
    experimental: false,
  },
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    helper: "Experimental benchmark option against the stable Gemini 2.5 models.",
    experimental: true,
  },
];

export function getProvider(id: string): AIProvider {
  return providers.get(id) ?? providers.get("gemini-2.5-flash")!;
}

export function listProviders(): AIProvider[] {
  return Array.from(providers.values());
}

export function listProviderOptions(): AiProviderOption[] {
  return providerOptions;
}

export function isSupportedProviderOption(id: string): boolean {
  return providerOptions.some((option) => option.id === id);
}

export function providerHasKey(id: string): boolean {
  return Boolean(readApiKeyForProvider(id));
}

export function syncGeminiProviderOptions(models: AiProviderOption[]) {
  // Merge dynamic Gemini options (from models.list) into the registry.
  const byId = new Map(providerOptions.map((o) => [o.id, o]));
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
