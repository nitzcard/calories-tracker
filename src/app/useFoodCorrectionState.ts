import type { ComputedRef, Ref } from "vue";
import { queueAnalysis } from "../ai/service";
import { resolveFoodCorrection } from "./dashboard-helpers";
import { saveEntry, saveProfile } from "../storage/repository";
import type { DailyEntry, Profile } from "../types";

export function useFoodCorrectionState(args: {
  profile: Ref<Profile | null>;
  currentEntry: ComputedRef<DailyEntry | undefined>;
  provider: Ref<string>;
  selectedDate: Ref<string>;
  refreshState: () => Promise<void>;
  flushPendingAnalysis: (showBusy?: boolean) => Promise<void>;
  setNotice: (value: string) => void;
}) {
  async function saveFoodCorrection(
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

    const previousCalories = previousFood?.calories ?? 0;
    const calorieDelta = resolved.calories - previousCalories;
    const per100g = Math.round((resolved.calories / resolved.grams) * 100);
    const line =
      args.profile.value.locale === "he"
        ? `${foodName}: השתמש ${per100g} קלוריות ל-100 גרם`
        : `${foodName}: use ${per100g} kcal per 100g`;
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

    const nextFoods = snapshot.foods.map((food) =>
      food.id === foodId
        ? {
            ...food,
            grams: resolved.grams,
            gramsEstimated: resolved.gramsEstimated,
            calories: resolved.calories,
            caloriesEstimated: resolved.caloriesEstimated,
            caloriesPer100g: resolved.caloriesPer100g,
          }
        : food,
    );
    const nextMeals = snapshot.meals.map((meal) => {
      const hasFood = meal.foods.some((food) => food.id === foodId);
      return {
        ...meal,
        foods: meal.foods.map((food) =>
          food.id === foodId
            ? {
                ...food,
                grams: resolved.grams,
                gramsEstimated: resolved.gramsEstimated,
                calories: resolved.calories,
                caloriesEstimated: resolved.caloriesEstimated,
                caloriesPer100g: resolved.caloriesPer100g,
              }
            : food,
        ),
        totals: hasFood
          ? {
              ...meal.totals,
              calories: (meal.totals.calories ?? 0) + calorieDelta,
            }
          : meal.totals,
      };
    });
    const nextDailyTotals = {
      ...snapshot.dailyTotals,
      calories: (snapshot.dailyTotals.calories ?? 0) + calorieDelta,
    };
    await saveEntry({
      ...args.currentEntry.value,
      nutritionSnapshot: {
        ...snapshot,
        calories: nextDailyTotals.calories,
        dailyTotals: nextDailyTotals,
        meals: nextMeals,
        foods: nextFoods,
      },
    });

    await args.refreshState();
    await queueAnalysis(args.selectedDate.value, args.provider.value);
    await args.flushPendingAnalysis(true);
    args.setNotice("correction");
  }

  return { saveFoodCorrection };
}
