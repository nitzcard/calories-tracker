import type { AiProviderOption } from "../types";

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

export async function fetchGeminiModelOptions(apiKey: string): Promise<AiProviderOption[]> {
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

  // Keep a small, stable set first for UX; then add the rest.
  const preferredOrder = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
  ];

  const unique = Array.from(new Set(usable));
  unique.sort((a, b) => {
    const ia = preferredOrder.indexOf(a);
    const ib = preferredOrder.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });

  return unique.map((id) => ({
    id,
    label: friendlyGeminiLabel(id),
    helper: "Gemini model detected from your API key (models.list).",
    experimental: id.includes("preview") || id.includes("experimental"),
  }));
}

function normalizeModelId(name: string) {
  // The API returns "models/<id>".
  return name.startsWith("models/") ? name.slice("models/".length) : name;
}

function friendlyGeminiLabel(id: string) {
  // gemini-2.5-flash -> Gemini 2.5 Flash
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

