import { describe, expect, it } from "vitest";
import { normalizeAiNutritionResponse, parseAiNutritionResponse } from "./gemini-schema";
import type { AiNutritionResponse } from "../types";

const response: AiNutritionResponse = {
  schemaVersion: "1.0",
  locale: "en",
  date: "2026-04-22",
  meals: [
    {
      mealKey: "breakfast",
      mealLabel: "Breakfast",
      color: "#8C6A43",
      foods: [
        {
          foodName: "Greek yogurt",
          canonicalName: "Greek yogurt",
          sourceLabel: "FoodsDictionary",
          sourceUrl: "https://www.foodsdictionary.co.il/Products/12345/greek-yogurt",
          amountText: "1 cup",
          servings: 1,
          unit: "cup",
          estimatedGrams: 170,
          nutrition: {
            calories: 120,
            protein: 20,
            carbs: 8,
            fat: 3,
            fiber: 0,
          },
          confidence: 0.92,
          assumptions: [],
          needsReview: false,
        },
      ],
      totals: {
        calories: 120,
        protein: 20,
        carbs: 8,
        fat: 3,
        fiber: 0,
      },
    },
  ],
  dailyTotals: {
    calories: 120,
    protein: 20,
    carbs: 8,
    fat: 3,
    fiber: 0,
  },
  micronutrients: {
    fiber: 0,
    sodiumMg: null,
    potassiumMg: null,
    calciumMg: null,
    ironMg: null,
    magnesiumMg: null,
    vitaminAIu: null,
    vitaminCMg: null,
    vitaminDMcg: null,
    vitaminB12Mcg: null,
  },
  unmatchedItems: [],
  globalAssumptions: [],
  warnings: [],
};

describe("gemini schema", () => {
  it("preserves provided source urls when they are valid http links", () => {
    const parsed = parseAiNutritionResponse(response);
    const normalized = normalizeAiNutritionResponse(parsed, "gemini-2.5-flash", "en");

    expect(normalized.foods[0].sourceLabel).toBe("FoodsDictionary");
    expect(normalized.foods[0].sourceUrl).toBe("https://www.foodsdictionary.co.il/Products/12345/greek-yogurt");
  });

  it("drops the link when no direct foodsdictionary product url exists", () => {
    const parsed = parseAiNutritionResponse({
      ...response,
      meals: [
        {
          ...response.meals[0],
          foods: [
            {
              ...response.meals[0].foods[0],
              foodName: "Cottage cheese",
              canonicalName: "Cottage cheese",
              sourceLabel: null,
              sourceUrl: null,
            },
          ],
        },
      ],
    });
    const normalized = normalizeAiNutritionResponse(parsed, "gemini-2.5-flash", "en");
    expect(normalized.foods[0].sourceLabel).toBeNull();
    expect(normalized.foods[0].sourceUrl).toBeNull();
  });

  it("drops foodsdictionary search links because they are not direct product sources", () => {
    const parsed = parseAiNutritionResponse({
      ...response,
      meals: [
        {
          ...response.meals[0],
          foods: [
            {
              ...response.meals[0].foods[0],
              sourceLabel: "FoodsDictionary",
              sourceUrl: "https://www.foodsdictionary.co.il/FoodsSearch.php?q=%D7%92%D7%96%D7%A8",
            },
          ],
        },
      ],
    });
    const normalized = normalizeAiNutritionResponse(parsed, "gemini-2.5-flash", "he");
    expect(normalized.foods[0].sourceLabel).toBe("FoodsDictionary");
    expect(normalized.foods[0].sourceUrl).toBeNull();
  });
});
