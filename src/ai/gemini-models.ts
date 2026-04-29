import { translations } from "../i18n/translations";
import { formatGeminiModelLabel } from "./gemini-config";
import type { AiProviderOption, AppLocale } from "../types";

type GeminiModel = {
  name?: string; // "models/gemini-2.5-flash"
  displayName?: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
};

type GeminiModelsListResponse = {
  models?: GeminiModel[];
  nextPageToken?: string;
};

export async function fetchGeminiModelOptions(apiKey: string, locale: AppLocale): Promise<AiProviderOption[]> {
  const baseUrl =
    import.meta.env.VITE_GEMINI_API_BASE_URL?.replace(/\/$/, "") ??
    "https://generativelanguage.googleapis.com/v1beta";
  const url = `${baseUrl}/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gemini models.list failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as GeminiModelsListResponse;
  const models = payload.models ?? [];

  // Only keep models that can run generateContent (the API method used by our provider).
  const usable = models
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => normalizeModelId(m.name ?? ""))
    .filter((id) => Boolean(id) && id.startsWith("gemini-"));

  // Prefer "latest" models in sorting, but keep the full detected set so users can pick older/stable ids too.
  const unique = Array.from(new Set(usable.filter(isRelevantGeminiModelId)));
  unique.sort((a, b) => {
    return compareModelPreference(a, b);
  });

  return unique.map((id) => ({
    id,
    label: formatGeminiModelLabel(id),
    helper: translations[locale].analysisModelDetectedHelper,
    experimental: id.includes("preview") || id.includes("experimental"),
    source: "detected",
  }));
}

function normalizeModelId(name: string) {
  // The API returns "models/<id>".
  return name.startsWith("models/") ? name.slice("models/".length) : name;
}

function compareModelPreference(a: string, b: string) {
  const rank = (id: string) => {
    const isLatest = id.includes("latest") ? 0 : 1;
    const isFlash = id.includes("-flash") ? 0 : 1;
    const isLite = id.includes("lite") ? 0 : 1;
    const isPreview = id.includes("preview") || id.includes("experimental") ? 1 : 0;
    return [isLatest, isFlash, isLite, isPreview, id];
  };

  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length - 1; i += 1) {
    if (ra[i] !== rb[i]) {
      return Number(ra[i]) - Number(rb[i]);
    }
  }
  return String(ra[ra.length - 1]).localeCompare(String(rb[rb.length - 1]));
}

function isRelevantGeminiModelId(id: string) {
  const lowered = id.toLowerCase();
  // Keep text/chat models; exclude non-chat modalities that still show up under gemini-*.
  const blocked = ["embedding", "embed", "imagen", "image", "tts", "speech", "audio", "transcribe"];
  return !blocked.some((part) => lowered.includes(part));
}
