import { describe, expect, it } from "vitest";
import { buildGeminiNutritionPrompt } from "./gemini-prompt";
import type { AiAnalysisInput } from "../types";

const baseInput: AiAnalysisInput = {
  date: "2026-04-22",
  foodLogText: "סלט גזר",
  profile: {
    id: "default",
    sex: "male",
    age: 30,
    height: 180,
    estimatedWeight: 80,
    targetWeight: null,
    bodyFat: null,
    goalMode: "cut",
    tdeeEquation: "mifflinStJeor",
    activityFactor: "moderate",
    aiModel: "gemini-2.5-flash",
    locale: "he",
    foodInstructions: "",
  },
  foodRules: [],
};

describe("buildGeminiNutritionPrompt", () => {
  it("requires best-effort analysis for recognizable foods", () => {
    const prompt = buildGeminiNutritionPrompt(baseInput);

    expect(prompt).toContain("Analyze every recognizable food item in the log");
    expect(prompt).toContain("Use `unmatchedItems` only for text that is truly unreadable or not food-related.");
    expect(prompt).toContain("Simple foods and dishes such as salads");
  });
});
