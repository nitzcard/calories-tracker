export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-latest";
export const FALLBACK_GEMINI_MODEL = "gemini-2.5-flash";
export const LIGHTWEIGHT_GEMINI_MODEL = "gemini-2.5-flash-lite";
export const LIGHTWEIGHT_GEMINI_LATEST_MODEL = "gemini-2.5-flash-lite-latest";

export function isGeminiModelId(value: string | null | undefined): value is string {
  return Boolean(value && value.startsWith("gemini-"));
}

export function formatGeminiModelLabel(id: string) {
  const normalized = id.replace(/^gemini-/, "");
  const parts = normalized.split("-");
  const version = parts.shift();
  const suffix = parts
    .join("-")
    .split("-")
    .map((part) => (part.length ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
  return `Gemini ${version} ${suffix}`.trim();
}
