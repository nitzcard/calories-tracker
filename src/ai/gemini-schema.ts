import type {
  AiFoodResult,
  AiMealResult,
  AiNutritionResponse,
  AppLocale,
  FoodBreakdownItem,
  MealBreakdownItem,
  NormalizedNutritionResult,
  NutrientMap,
  NutritionTotals,
} from "../types";

export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  required: [
    "schemaVersion",
    "locale",
    "date",
    "meals",
    "dailyTotals",
    "micronutrients",
    "unmatchedItems",
    "globalAssumptions",
    "warnings",
  ],
  properties: {
    schemaVersion: { type: "STRING", enum: ["1.0"] },
    locale: { type: "STRING", enum: ["en", "he"] },
    date: { type: "STRING" },
    meals: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["mealKey", "mealLabel", "color", "foods", "totals"],
        properties: {
          mealKey: {
            type: "STRING",
            enum: ["breakfast", "lunch", "dinner", "snack", "other"],
          },
          mealLabel: { type: "STRING" },
          color: { type: "STRING" },
          foods: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              required: [
                "foodName",
                "canonicalName",
                "sourceLabel",
                "sourceUrl",
                "amountText",
                "servings",
                "unit",
                "estimatedGrams",
                "nutrition",
                "confidence",
                "assumptions",
                "needsReview",
              ],
              properties: {
                foodName: { type: "STRING" },
                canonicalName: { type: "STRING", nullable: true },
                sourceLabel: { type: "STRING", nullable: true },
                sourceUrl: { type: "STRING", nullable: true },
                amountText: { type: "STRING" },
                servings: { type: "NUMBER", nullable: true },
                unit: { type: "STRING", nullable: true },
                estimatedGrams: { type: "NUMBER", nullable: true },
                nutrition: nutritionTotalsSchema(),
                confidence: { type: "NUMBER", nullable: true },
                assumptions: stringArraySchema(),
                needsReview: { type: "BOOLEAN" },
              },
            },
          },
          totals: nutritionTotalsSchema(),
        },
      },
    },
    dailyTotals: nutritionTotalsSchema(),
    micronutrients: micronutrientsSchema(),
    unmatchedItems: stringArraySchema(),
    globalAssumptions: stringArraySchema(),
    warnings: stringArraySchema(),
  },
} as const;

function stringArraySchema() {
  return {
    type: "ARRAY",
    items: { type: "STRING" },
  } as const;
}

function nutritionTotalsSchema() {
  return {
    type: "OBJECT",
    required: ["calories", "protein", "carbs", "fat", "fiber"],
    properties: {
      calories: { type: "NUMBER", nullable: true },
      protein: { type: "NUMBER", nullable: true },
      carbs: { type: "NUMBER", nullable: true },
      fat: { type: "NUMBER", nullable: true },
      fiber: { type: "NUMBER", nullable: true },
    },
  } as const;
}

function micronutrientsSchema() {
  return {
    type: "OBJECT",
    required: [
      "fiber",
      "sodiumMg",
      "potassiumMg",
      "calciumMg",
      "ironMg",
      "magnesiumMg",
      "vitaminAIu",
      "vitaminCMg",
      "vitaminDMcg",
      "vitaminB12Mcg",
    ],
    properties: {
      fiber: { type: "NUMBER", nullable: true },
      sodiumMg: { type: "NUMBER", nullable: true },
      potassiumMg: { type: "NUMBER", nullable: true },
      calciumMg: { type: "NUMBER", nullable: true },
      ironMg: { type: "NUMBER", nullable: true },
      magnesiumMg: { type: "NUMBER", nullable: true },
      vitaminAIu: { type: "NUMBER", nullable: true },
      vitaminCMg: { type: "NUMBER", nullable: true },
      vitaminDMcg: { type: "NUMBER", nullable: true },
      vitaminB12Mcg: { type: "NUMBER", nullable: true },
    },
  } as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNutritionTotals(value: unknown): value is NutritionTotals {
  return (
    isRecord(value) &&
    isNumberOrNull(value.calories) &&
    isNumberOrNull(value.protein) &&
    isNumberOrNull(value.carbs) &&
    isNumberOrNull(value.fat) &&
    isNumberOrNull(value.fiber)
  );
}

function isMicronutrients(value: unknown): value is NutrientMap {
  return (
    isRecord(value) &&
    isNumberOrNull(value.fiber) &&
    isNumberOrNull(value.sodiumMg) &&
    isNumberOrNull(value.potassiumMg) &&
    isNumberOrNull(value.calciumMg) &&
    isNumberOrNull(value.ironMg) &&
    isNumberOrNull(value.magnesiumMg) &&
    isNumberOrNull(value.vitaminAIu) &&
    isNumberOrNull(value.vitaminCMg) &&
    isNumberOrNull(value.vitaminDMcg) &&
    isNumberOrNull(value.vitaminB12Mcg)
  );
}

function isAiFood(value: unknown): value is AiFoodResult {
  return (
    isRecord(value) &&
    typeof value.foodName === "string" &&
    isStringOrNull(value.canonicalName) &&
    isStringOrNull(value.sourceLabel) &&
    isStringOrNull(value.sourceUrl) &&
    typeof value.amountText === "string" &&
    isNumberOrNull(value.servings) &&
    isStringOrNull(value.unit) &&
    isNumberOrNull(value.estimatedGrams) &&
    isNutritionTotals(value.nutrition) &&
    isNumberOrNull(value.confidence) &&
    isStringArray(value.assumptions) &&
    typeof value.needsReview === "boolean"
  );
}

function isAiMeal(value: unknown): value is AiMealResult {
  return (
    isRecord(value) &&
    typeof value.mealKey === "string" &&
    ["breakfast", "lunch", "dinner", "snack", "other"].includes(value.mealKey) &&
    typeof value.mealLabel === "string" &&
    typeof value.color === "string" &&
    Array.isArray(value.foods) &&
    value.foods.every(isAiFood) &&
    isNutritionTotals(value.totals)
  );
}

export function parseAiNutritionResponse(value: unknown): AiNutritionResponse {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    (value.locale !== "en" && value.locale !== "he") ||
    typeof value.date !== "string" ||
    !Array.isArray(value.meals) ||
    !value.meals.every(isAiMeal) ||
    !isNutritionTotals(value.dailyTotals) ||
    !isMicronutrients(value.micronutrients) ||
    !isStringArray(value.unmatchedItems) ||
    !isStringArray(value.globalAssumptions) ||
    !isStringArray(value.warnings)
  ) {
    throw new Error("AI response did not match the nutrition schema.");
  }

  return value as unknown as AiNutritionResponse;
}

export function normalizeAiNutritionResponse(
  response: AiNutritionResponse,
  sourceModel: string,
  locale: AppLocale,
): NormalizedNutritionResult {
  const meals: MealBreakdownItem[] = response.meals.map((meal, mealIndex) => {
    const foods: FoodBreakdownItem[] = meal.foods.map((food, foodIndex) => ({
      id: `${meal.mealKey}-${mealIndex}-${foodIndex}`,
      mealKey: meal.mealKey,
      mealLabel: meal.mealLabel,
      name: food.foodName,
      canonicalName: food.canonicalName,
      sourceLabel: food.sourceLabel,
      sourceUrl: food.sourceUrl,
      amountText: food.amountText,
      grams: food.estimatedGrams,
      gramsEstimated: false,
      calories: food.nutrition.calories,
      caloriesEstimated: false,
      caloriesPer100g:
        food.estimatedGrams && food.nutrition.calories
          ? Math.round((food.nutrition.calories / food.estimatedGrams) * 100)
          : null,
      protein: food.nutrition.protein,
      carbs: food.nutrition.carbs,
      fat: food.nutrition.fat,
      fiber: food.nutrition.fiber,
      confidence: food.confidence,
      assumptions: food.assumptions,
      needsReview: food.needsReview,
      notes:
        locale === "he"
          ? "פוענח על ידי AI. רצוי לאמת מול מסד תזונה."
          : "Parsed by AI. Review against a nutrition database when needed.",
    }));

    return {
      id: `${meal.mealKey}-${mealIndex}`,
      mealKey: meal.mealKey,
      mealLabel: meal.mealLabel,
      color: normalizeMealColor(meal.color, meal.mealKey),
      foods,
      totals: meal.totals,
    };
  });

  const foods = meals.flatMap((meal) => meal.foods);

  return {
    schemaVersion: response.schemaVersion,
    calories: response.dailyTotals.calories,
    protein: response.dailyTotals.protein,
    carbs: response.dailyTotals.carbs,
    fat: response.dailyTotals.fat,
    dailyTotals: response.dailyTotals,
    nutrients: response.micronutrients,
    meals,
    foods,
    unmatchedItems: response.unmatchedItems,
    assumptions: response.globalAssumptions,
    warnings: response.warnings,
    confidence: averageConfidence(response.meals),
    sourceModel,
    updatedAt: new Date().toISOString(),
  };
}

function averageConfidence(meals: AiMealResult[]): number | null {
  const scores = meals
    .flatMap((meal) => meal.foods)
    .map((food) => food.confidence)
    .filter((score): score is number => typeof score === "number");

  if (!scores.length) {
    return null;
  }

  return Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2));
}

function normalizeMealColor(color: string, mealKey: AiMealResult["mealKey"]) {
  const normalized = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized;
  }

  return fallbackMealColor(mealKey);
}

function fallbackMealColor(mealKey: AiMealResult["mealKey"]) {
  const colors: Record<AiMealResult["mealKey"], string> = {
    breakfast: "#8C6A43",
    lunch: "#4E6B50",
    dinner: "#556B8D",
    snack: "#7A5C74",
    other: "#6C6A62",
  };

  return colors[mealKey];
}
