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
  function formatCaloriesPer100(value: number) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  }

  function buildInstructionLine(foodName: string, caloriesPer100g: number) {
    const calories = formatCaloriesPer100(caloriesPer100g);
    return args.profile.value?.locale === "he"
      ? `${foodName}: ${calories} קלוריות ל-100גרם`
      : `${foodName}: ${calories} calories for 100gr`;
  }

  function foodInstructionKey(line: string) {
    return line.split(":")[0]?.trim().toLowerCase() ?? "";
  }

  function mergeAutomaticInstructions(currentInstructions: string, line: string) {
    const normalized = currentInstructions.replace(/\r\n/g, "\n").trimEnd();
    const lines = normalized ? normalized.split("\n") : [];
    const filtered = lines.filter((item) => item.trim() && foodInstructionKey(item) !== foodInstructionKey(line));
    return [...filtered, line].join("\n");
  }

  async function saveFoodCorrectionInstruction(
    foodId: string,
    foodName: string,
    grams: number | null,
    calories: number | null,
    caloriesPer100g: number | null,
  ) {
    await saveFoodCorrectionInstructionInternal(foodId, foodName, grams, calories, caloriesPer100g, true);
  }

  async function saveFoodCorrectionInstructionOnly(
    foodId: string,
    foodName: string,
    grams: number | null,
    calories: number | null,
    caloriesPer100g: number | null,
  ) {
    await saveFoodCorrectionInstructionInternal(foodId, foodName, grams, calories, caloriesPer100g, false);
  }

  async function saveFoodCorrectionInstructionInternal(
    foodId: string,
    foodName: string,
    grams: number | null,
    calories: number | null,
    caloriesPer100g: number | null,
    markStale: boolean,
  ) {
    if (!args.profile.value || !args.currentEntry.value?.nutritionSnapshot) return;

    const snapshot = args.currentEntry.value.nutritionSnapshot;
    const previousFood = snapshot.foods.find((food) => food.id === foodId);
    const resolved = resolveFoodCorrection(previousFood, grams, calories, caloriesPer100g);

    // Allow saving instructions even if we can't fully resolve grams+calories.
    // We only need a per-gram kcal ratio, which can be derived from per-100g or from an existing snapshot.
    const ratioFromPer100 =
      caloriesPer100g != null && Number.isFinite(caloriesPer100g) ? caloriesPer100g / 100 : null;
    const ratioFromPrevPer100 =
      previousFood?.caloriesPer100g != null && Number.isFinite(previousFood.caloriesPer100g)
        ? previousFood.caloriesPer100g / 100
        : null;
    const ratioFromInputs =
      grams != null && calories != null && grams > 0 && Number.isFinite(grams) && Number.isFinite(calories)
        ? calories / grams
        : null;
    const ratioFromPrev =
      previousFood?.grams && previousFood?.calories ? previousFood.calories / previousFood.grams : null;
    const ratioFromResolved =
      resolved?.grams && resolved.calories ? resolved.calories / resolved.grams : null;

    const caloriesPerGram =
      ratioFromPer100 ?? ratioFromInputs ?? ratioFromResolved ?? ratioFromPrevPer100 ?? ratioFromPrev;
    if (caloriesPerGram == null || !Number.isFinite(caloriesPerGram) || caloriesPerGram <= 0) {
      return;
    }

    const line = buildInstructionLine(foodName, caloriesPerGram * 100);
    const nextInstructions = mergeAutomaticInstructions(args.profile.value.foodInstructions, line);
    args.profile.value = { ...args.profile.value, foodInstructions: nextInstructions };
    await saveProfile(args.profile.value);

    args.setNotice(markStale ? "instruction-pending" : "instruction-saved");

    if (markStale) {
      await saveEntry({
        ...args.currentEntry.value,
        analysisStale: true,
      });
    }

    await args.refreshState();
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
    saveFoodCorrectionInstructionOnly,
    applyFoodCorrectionToCurrentEntry,
  };
}
