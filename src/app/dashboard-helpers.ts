import { DEFAULT_GEMINI_MODEL } from "../ai/gemini-config";
import type { AiStatus } from "../types";

export function normalizeProvider(value: string | null): string {
  return value?.trim() || DEFAULT_GEMINI_MODEL;
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
