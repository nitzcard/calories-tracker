import type { ActivityFactor } from "../types";

export function normalizeStoredActivityFactor(value: unknown, legacyPrompt?: string | null): ActivityFactor {
  if (value === "sedentary" || value === "light" || value === "moderate" || value === "veryActive" || value === "extraActive") {
    return value;
  }

  if (value === "inferred") {
    return legacyPrompt?.trim() ? "light" : "sedentary";
  }

  return "sedentary";
}

export function activityFactorPromptLabel(activityFactor: ActivityFactor) {
  if (activityFactor === "extraActive") return "Athlete / two-a-day training";
  if (activityFactor === "veryActive") return "Heavy exercise 6-7 days/week";
  if (activityFactor === "moderate") return "Moderate exercise 3-5 days/week";
  if (activityFactor === "light") return "Light exercise 1-2 days/week";
  return "Sedentary";
}
