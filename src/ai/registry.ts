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

const providerOptions: AiProviderOption[] = [
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
