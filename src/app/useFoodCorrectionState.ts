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
      ? `${foodName}: ${calories} קלוריות ל-100 גרם`
      : `${foodName}: ${calories} calories for 100 gr`;
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
    _protein?: number | null,
    _carbs?: number | null,
    _fat?: number | null,
    _fiber?: number | null,
  ) {
    await saveFoodCorrectionInstructionInternal(foodId, foodName, grams, calories, caloriesPer100g, true);
  }

  async function saveFoodCorrectionInstructionOnly(
    foodId: string,
    foodName: string,
    grams: number | null,
    calories: number | null,
    caloriesPer100g: number | null,
    _protein?: number | null,
    _carbs?: number | null,
    _fat?: number | null,
    _fiber?: number | null,
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

    const noticeValue = markStale ? "instruction-pending" : "instruction-saved";
    args.setNotice(noticeValue);

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

  function normalizeNutritionValue(value: number | null | undefined) {
    if (value == null || !Number.isFinite(value)) {
      return null;
    }

    return value;
  }

  function sumMealTotals(meals: MealBreakdownItem[]): NutritionTotals {
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

    for (const meal of meals) {
      const mealTotals = meal.totals;
      if (mealTotals.calories != null) {
        totals.calories += mealTotals.calories;
        seen.calories = true;
      }
      if (mealTotals.protein != null) {
        totals.protein += mealTotals.protein;
        seen.protein = true;
      }
      if (mealTotals.carbs != null) {
        totals.carbs += mealTotals.carbs;
        seen.carbs = true;
      }
      if (mealTotals.fat != null) {
        totals.fat += mealTotals.fat;
        seen.fat = true;
      }
      if (mealTotals.fiber != null) {
        totals.fiber += mealTotals.fiber;
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
    protein?: number | null,
    carbs?: number | null,
    fat?: number | null,
    fiber?: number | null,
  ) {
    if (!args.currentEntry.value?.nutritionSnapshot) return;

    const snapshot = args.currentEntry.value.nutritionSnapshot;
    const previousFood = snapshot.foods.find((food) => food.id === foodId);
    const resolved = resolveFoodCorrection(previousFood, grams, calories, caloriesPer100g);
    const snapshotUpdatedAt = new Date().toISOString();

    const nextCalories = resolved?.calories ?? calories ?? null;
    const nextGrams = resolved?.grams ?? grams ?? null;
    const didCaloriesChange =
      previousFood?.calories != null && nextCalories != null && previousFood.calories !== nextCalories;
    const didGramsChange = previousFood?.grams != null && nextGrams != null && previousFood.grams !== nextGrams;

    const macroRatio =
      didCaloriesChange && previousFood?.calories && previousFood.calories > 0
        ? nextCalories! / previousFood.calories
        : didGramsChange && previousFood?.grams && previousFood.grams > 0
          ? nextGrams! / previousFood.grams
          : previousFood?.calories && nextCalories != null && previousFood.calories > 0
            ? nextCalories / previousFood.calories
            : previousFood?.grams && nextGrams != null && previousFood.grams > 0
              ? nextGrams / previousFood.grams
              : 1;

    const nextMeals: MealBreakdownItem[] = snapshot.meals.map((meal) => {
      const nextFoods = meal.foods.map((food) =>
        food.id === foodId
          ? {
              ...food,
              grams: resolved?.grams ?? grams ?? null,
              gramsEstimated: resolved?.gramsEstimated ?? false,
              calories: resolved?.calories ?? calories ?? null,
              caloriesEstimated: resolved?.caloriesEstimated ?? false,
              caloriesPer100g: resolved?.caloriesPer100g ?? caloriesPer100g ?? null,
              protein: protein !== undefined ? protein : scaleMacro(food.protein, macroRatio),
              carbs: carbs !== undefined ? carbs : scaleMacro(food.carbs, macroRatio),
              fat: fat !== undefined ? fat : scaleMacro(food.fat, macroRatio),
              fiber: fiber !== undefined ? fiber : scaleMacro(food.fiber, macroRatio),
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
      analysisStale: false,
      aiError: null,
      nutritionSnapshot: {
        ...snapshot,
        calories: nextDailyTotals.calories,
        protein: nextDailyTotals.protein,
        carbs: nextDailyTotals.carbs,
        fat: nextDailyTotals.fat,
        dailyTotals: nextDailyTotals,
        meals: nextMeals,
        foods: nextFoods,
        updatedAt: snapshotUpdatedAt,
      },
    });

    await args.refreshState();
  }

  async function applyMealTotalCorrectionToCurrentEntry(
    mealId: string,
    totals: NutritionTotals,
  ) {
    if (!args.currentEntry.value?.nutritionSnapshot) return;

    const snapshot = args.currentEntry.value.nutritionSnapshot;
    const snapshotUpdatedAt = new Date().toISOString();
    const nextMeals: MealBreakdownItem[] = snapshot.meals.map((meal) =>
      meal.id === mealId
        ? {
            ...meal,
            totals: {
              calories: normalizeNutritionValue(totals.calories),
              protein: normalizeNutritionValue(totals.protein),
              carbs: normalizeNutritionValue(totals.carbs),
              fat: normalizeNutritionValue(totals.fat),
              fiber: normalizeNutritionValue(totals.fiber),
            },
          }
        : meal,
    );

    const nextDailyTotals = sumMealTotals(nextMeals);

    await saveEntry({
      ...args.currentEntry.value,
      analysisStale: false,
      aiError: null,
      nutritionSnapshot: {
        ...snapshot,
        calories: nextDailyTotals.calories,
        protein: nextDailyTotals.protein,
        carbs: nextDailyTotals.carbs,
        fat: nextDailyTotals.fat,
        dailyTotals: nextDailyTotals,
        meals: nextMeals,
        updatedAt: snapshotUpdatedAt,
      },
    });

    await args.refreshState();
  }

  return {
    saveFoodCorrectionInstruction,
    saveFoodCorrectionInstructionOnly,
    applyFoodCorrectionToCurrentEntry,
    applyMealTotalCorrectionToCurrentEntry,
  };
}
