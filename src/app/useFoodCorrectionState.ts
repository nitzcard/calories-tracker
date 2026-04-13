import type { ComputedRef, Ref } from "vue";
import { resolveFoodCorrection } from "./dashboard-helpers";
import { saveEntry, saveProfile } from "../storage/repository";
import type { DailyEntry, FoodBreakdownItem, MealBreakdownItem, NutritionTotals, Profile } from "../types";

export function useFoodCorrectionState(args: {
  profile: Ref<Profile | null>;
  currentEntry: ComputedRef<DailyEntry | undefined>;
  refreshState: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  function buildInstructionLine(foodName: string, caloriesPer100g: number) {
    return args.profile.value?.locale === "he"
      ? `${foodName}: השתמש ${caloriesPer100g} קלוריות ל-100 גרם`
      : `${foodName}: use ${caloriesPer100g} kcal per 100g`;
  }

  async function saveFoodCorrectionInstruction(
    foodId: string,
    foodName: string,
    grams: number | null,
    calories: number | null,
    caloriesPer100g: number | null,
  ) {
    if (!args.profile.value || !args.currentEntry.value?.nutritionSnapshot) return;

    const snapshot = args.currentEntry.value.nutritionSnapshot;
    const previousFood = snapshot.foods.find((food) => food.id === foodId);
    const resolved = resolveFoodCorrection(previousFood, grams, calories, caloriesPer100g);
    if (!resolved) {
      return;
    }

    const per100g = Math.round((resolved.calories / resolved.grams) * 100);
    const line = buildInstructionLine(foodName, per100g);
    const currentLines = args.profile.value.foodInstructions
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const filtered = currentLines.filter(
      (item) => item.split(":")[0]?.trim().toLowerCase() !== foodName.toLowerCase(),
    );
    const nextInstructions = [...filtered, line].join("\n");
    args.profile.value = { ...args.profile.value, foodInstructions: nextInstructions };
    await saveProfile(args.profile.value);

    await saveEntry({
      ...args.currentEntry.value,
      analysisStale: true,
    });

    await args.refreshState();
    args.setNotice("instruction-pending");
  }

  function scaleMacro(value: number | null | undefined, ratio: number) {
    if (value == null || !Number.isFinite(value)) {
      return value ?? null;
    }

    return Math.round(value * ratio * 10) / 10;
  }

  function sumNutritionTotals(foods: FoodBreakdownItem[]): NutritionTotals {
    const totals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    };
    const seen = {
      calories: false,
      protein: false,
      carbs: false,
      fat: false,
      fiber: false,
    };

    for (const food of foods) {
      if (food.calories != null) {
        totals.calories += food.calories;
        seen.calories = true;
      }
      if (food.protein != null) {
        totals.protein += food.protein;
        seen.protein = true;
      }
      if (food.carbs != null) {
        totals.carbs += food.carbs;
        seen.carbs = true;
      }
      if (food.fat != null) {
        totals.fat += food.fat;
        seen.fat = true;
      }
      if (food.fiber != null) {
        totals.fiber += food.fiber;
        seen.fiber = true;
      }
    }

    return {
      calories: seen.calories ? Math.round(totals.calories) : null,
      protein: seen.protein ? Math.round(totals.protein * 10) / 10 : null,
      carbs: seen.carbs ? Math.round(totals.carbs * 10) / 10 : null,
      fat: seen.fat ? Math.round(totals.fat * 10) / 10 : null,
      fiber: seen.fiber ? Math.round(totals.fiber * 10) / 10 : null,
    };
  }

  async function applyFoodCorrectionToCurrentEntry(
    foodId: string,
    _foodName: string,
    grams: number | null,
    calories: number | null,
    caloriesPer100g: number | null,
  ) {
    if (!args.currentEntry.value?.nutritionSnapshot) return;

    const snapshot = args.currentEntry.value.nutritionSnapshot;
    const previousFood = snapshot.foods.find((food) => food.id === foodId);
    const resolved = resolveFoodCorrection(previousFood, grams, calories, caloriesPer100g);
    if (!resolved) {
      return;
    }

    const macroRatio =
      previousFood?.grams && resolved.grams
        ? resolved.grams / previousFood.grams
        : previousFood?.calories && resolved.calories
          ? resolved.calories / previousFood.calories
          : 1;

    const nextMeals: MealBreakdownItem[] = snapshot.meals.map((meal) => {
      const nextFoods = meal.foods.map((food) =>
        food.id === foodId
          ? {
              ...food,
              grams: resolved.grams,
              gramsEstimated: resolved.gramsEstimated,
              calories: resolved.calories,
              caloriesEstimated: resolved.caloriesEstimated,
              caloriesPer100g: resolved.caloriesPer100g,
              protein: scaleMacro(food.protein, macroRatio),
              carbs: scaleMacro(food.carbs, macroRatio),
              fat: scaleMacro(food.fat, macroRatio),
              fiber: scaleMacro(food.fiber, macroRatio),
            }
          : food,
      );

      return {
        ...meal,
        foods: nextFoods,
        totals: sumNutritionTotals(nextFoods),
      };
    });

    const nextFoods = nextMeals.flatMap((meal) => meal.foods);
    const nextDailyTotals = sumNutritionTotals(nextFoods);

    await saveEntry({
      ...args.currentEntry.value,
      nutritionSnapshot: {
        ...snapshot,
        calories: nextDailyTotals.calories,
        protein: nextDailyTotals.protein,
        carbs: nextDailyTotals.carbs,
        fat: nextDailyTotals.fat,
        dailyTotals: nextDailyTotals,
        meals: nextMeals,
        foods: nextFoods,
      },
    });

    await args.refreshState();
    args.setNotice("correction");
  }

  return {
    saveFoodCorrectionInstruction,
    applyFoodCorrectionToCurrentEntry,
  };
}
