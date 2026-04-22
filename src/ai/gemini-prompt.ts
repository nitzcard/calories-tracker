import type { AiAnalysisInput } from "../types";
import { activityFactorPromptLabel } from "../domain/activity-factor";
import { renderPromptTemplate } from "./prompt-template";
import nutritionAnalysisPromptTemplate from "./prompts/nutrition-analysis.md?raw";

export function buildGeminiNutritionPrompt(input: AiAnalysisInput): string {
  const localeLabel = input.profile.locale === "he" ? "Hebrew" : "English";
  const savedInstructions = input.foodRules
    .filter((rule) => rule.active)
    .map((rule) => `- ${rule.instructionText}`)
    .join("\n");

  return renderPromptTemplate(nutritionAnalysisPromptTemplate, {
    date: input.date,
    locale: input.profile.locale,
    localeLabel,
    sex: input.profile.sex,
    age: input.profile.age ?? "unknown",
    heightCm: input.profile.height ?? "unknown",
    estimatedWeightKg: input.profile.estimatedWeight ?? "unknown",
    bodyFatPercent: input.profile.bodyFat ?? "unknown",
    activityFactor: activityFactorPromptLabel(input.profile.activityFactor ?? "sedentary"),
    savedInstructions: savedInstructions || "- none",
    foodLogText: input.foodLogText,
  });
}
