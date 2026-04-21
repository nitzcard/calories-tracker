import { isSupportedProviderOption } from "../ai/registry";
import { DEFAULT_GEMINI_MODEL, isGeminiModelId } from "../ai/gemini-config";
import type { AppLocale, AiStatus, ThemeMode } from "../types";

export const DASHBOARD_STORAGE_KEYS = {
  locale: "calorie-tracker.locale",
  themeMode: "calorie-tracker.theme-mode",
  aiModel: "calorie-tracker.ai-model",
  aiModelUserSet: "calorie-tracker.ai-model-user-set",
  geminiLatestModel: "calorie-tracker.gemini-latest-model",
  autoBackupAfterAnalyze: "calorie-tracker.auto-backup-after-analyze",
  cloudMode: "calorie-tracker.cloud-mode",
  cloudUsername: "calorie-tracker.cloud-username",
  cloudConfirmedUsername: "calorie-tracker.cloud-confirmed-username",
  dailyDraftPrefix: "calorie-tracker.daily-draft::",
} as const;

export function normalizeProvider(value: string | null): string {
  if (value && (isSupportedProviderOption(value) || isGeminiModelId(value))) {
    return value;
  }

  const suggestedLatest = localStorage.getItem(DASHBOARD_STORAGE_KEYS.geminiLatestModel);
  if (isGeminiModelId(suggestedLatest)) {
    return suggestedLatest;
  }

  return DEFAULT_GEMINI_MODEL;
}

export function buildAnalyzeIssue(
  gate:
    | { ok: true }
    | {
        ok: false;
        reason: "offline" | "missing-key" | "empty-food-log" | "incomplete-profile";
      },
) {
  if (gate.ok) {
    return "";
  }

  switch (gate.reason) {
    case "incomplete-profile":
      return "incomplete-profile";
    case "empty-food-log":
      return "empty-food-log";
    case "offline":
      return "offline";
    case "missing-key":
      return "missing-key";
  }
}

export function statusLabel(labelFor: (key: string) => string, status: AiStatus | "idle") {
  const labels: Record<AiStatus | "idle", string> = {
    idle: labelFor("statusIdle"),
    pending: labelFor("statusPending"),
    processing: labelFor("statusProcessing"),
    done: labelFor("statusDone"),
    failed: labelFor("statusFailed"),
  };
  return labels[status];
}

export function readStoredLocale(): AppLocale | null {
  const value = localStorage.getItem(DASHBOARD_STORAGE_KEYS.locale);
  return value === "he" || value === "en" ? value : null;
}

export function readStoredThemeMode(): ThemeMode | null {
  const value = localStorage.getItem(DASHBOARD_STORAGE_KEYS.themeMode);
  return value === "system" ||
    value === "light" ||
    value === "dark" ||
    value === "purple-dark" ||
    value === "jasmine" ||
    value === "cs16" ||
    value === "steam" ||
    value === "cyberpunk-2077"
    ? value
    : null;
}

export function readStoredProvider(): string | null {
  return localStorage.getItem(DASHBOARD_STORAGE_KEYS.aiModel);
}

export function resolveFoodCorrection(
  previousFood:
    | {
        grams: number | null;
        calories: number | null;
        caloriesPer100g?: number | null;
      }
    | undefined,
  grams: number | null,
  calories: number | null,
  caloriesPer100g: number | null,
) {
  if (grams && caloriesPer100g) {
    return {
      grams,
      calories: Math.round((grams * caloriesPer100g) / 100),
      caloriesPer100g,
      gramsEstimated: false,
      caloriesEstimated: false,
    };
  }

  const ratio =
    caloriesPer100g ??
    previousFood?.caloriesPer100g ??
    (previousFood?.grams && previousFood?.calories
      ? previousFood.calories / previousFood.grams
      : null);

  if (grams && calories) {
    return {
      grams,
      calories,
      caloriesPer100g: Math.round((calories / grams) * 100),
      gramsEstimated: false,
      caloriesEstimated: false,
    };
  }

  if (grams && ratio) {
    return {
      grams,
      calories: Math.round(grams * ratio),
      caloriesPer100g: Math.round(ratio * 100),
      gramsEstimated: false,
      caloriesEstimated: true,
    };
  }

  if (calories && ratio) {
    return {
      grams: Number((calories / ratio).toFixed(1)),
      calories,
      caloriesPer100g: Math.round(ratio * 100),
      gramsEstimated: true,
      caloriesEstimated: false,
    };
  }

  return null;
}
