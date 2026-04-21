import { formatGeminiModelLabel } from "../ai/gemini-config";
import type { AiProviderOption, AppLocale } from "../types";

type ErrorKind = "model-missing" | "temporarily-unavailable" | "generic";

export function buildAnalysisErrorPresentation(
  rawError: string | null | undefined,
  locale: AppLocale,
  currentProvider: string,
  providerOptions: AiProviderOption[],
) {
  if (!rawError?.trim()) {
    return {
      message: null,
      retryModelId: null,
      retryModelLabel: null,
    };
  }

  const kind = classifyError(rawError);
  const retryModelId = pickRetryModelId(kind, currentProvider, providerOptions);

  return {
    message: localizedErrorMessage(kind, locale),
    retryModelId,
    retryModelLabel: retryModelId ? formatGeminiModelLabel(retryModelId) : null,
  };
}

function classifyError(rawError: string): ErrorKind {
  const normalized = rawError.toLowerCase();

  if (
    normalized.includes("not found") ||
    normalized.includes("unknown model") ||
    normalized.includes("unsupported model") ||
    normalized.includes("does not exist") ||
    normalized.includes("404")
  ) {
    return "model-missing";
  }

  if (
    normalized.includes("429") ||
    normalized.includes("503") ||
    normalized.includes("rate limit") ||
    normalized.includes("high demand") ||
    normalized.includes("overloaded") ||
    normalized.includes("temporarily unavailable") ||
    normalized.includes("timeout")
  ) {
    return "temporarily-unavailable";
  }

  return "generic";
}

function localizedErrorMessage(kind: ErrorKind, locale: AppLocale) {
  if (locale === "he") {
    if (kind === "model-missing") {
      return "המודל שנבחר לא זמין כרגע. אפשר לנסות מודל Gemini אחר מהרשימה הזמינה.";
    }
    if (kind === "temporarily-unavailable") {
      return "מודל ה-AI לא זמין כרגע או עמוס. אפשר לנסות שוב או לעבור למודל Gemini זמין אחר.";
    }
    return "בקשת הניתוח נכשלה. אפשר לנסות שוב או לעבור למודל Gemini זמין אחר.";
  }

  if (kind === "model-missing") {
    return "The selected model is not currently available. Try another Gemini model from the available list.";
  }
  if (kind === "temporarily-unavailable") {
    return "The AI model is temporarily unavailable or overloaded. Try again or switch to another available Gemini model.";
  }
  return "The analysis request failed. Try again or switch to another available Gemini model.";
}

function pickRetryModelId(
  kind: ErrorKind,
  currentProvider: string,
  providerOptions: AiProviderOption[],
) {
  const availableIds = Array.from(
    new Set(providerOptions.map((option) => option.id).filter((id) => id && id !== currentProvider)),
  );

  if (!availableIds.length) {
    return null;
  }

  const ranked = [...availableIds].sort((left, right) =>
    rankRetryCandidate(left, kind, currentProvider) - rankRetryCandidate(right, kind, currentProvider),
  );

  return ranked[0] ?? null;
}

function rankRetryCandidate(id: string, kind: ErrorKind, currentProvider: string) {
  const lowered = id.toLowerCase();
  const currentLowered = currentProvider.toLowerCase();
  const isLatest = lowered.includes("latest") ? 0 : 1;
  const isPreview = lowered.includes("preview") || lowered.includes("experimental") ? 1 : 0;
  const isLite = lowered.includes("lite") ? 1 : 0;
  const currentIsLite = currentLowered.includes("lite");

  let familyPenalty = 0;
  if (kind === "temporarily-unavailable") {
    familyPenalty = currentIsLite === Boolean(isLite) ? 1 : 0;
  } else if (kind === "model-missing") {
    familyPenalty = lowered.includes("flash") ? 0 : 1;
  }

  return familyPenalty * 100 + isLatest * 10 + isPreview * 5 + isLite;
}