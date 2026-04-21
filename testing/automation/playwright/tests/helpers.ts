import type { Page } from "@playwright/test";

export function isoDate(offsetDays: number) {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  now.setDate(now.getDate() + offsetDays);
  return now.toISOString().slice(0, 10);
}

export function todayIso() {
  return isoDate(0);
}

type SeedEntry = {
  date: string;
  foodLogText: string;
  weight: number | null;
  manualCalories: number | null;
  nutritionSnapshot?: any;
  aiStatus?: "idle" | "pending" | "processing" | "done" | "failed";
};

type FoodSeedOptions = {
  id: string;
  mealKey?: string;
  mealLabel?: string;
  name: string;
  canonicalName?: string;
  amountText?: string;
  grams: number | null;
  calories: number | null;
  caloriesPer100g?: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  solubleFiber?: number | null;
  insolubleFiber?: number | null;
};

export function makeFoodSeed(options: FoodSeedOptions) {
  return {
    id: options.id,
    mealKey: options.mealKey ?? "breakfast",
    mealLabel: options.mealLabel ?? "Breakfast",
    name: options.name,
    canonicalName: options.canonicalName ?? options.name,
    amountText: options.amountText ?? "1 serving",
    grams: options.grams,
    gramsEstimated: false,
    calories: options.calories,
    caloriesEstimated: false,
    caloriesPer100g: options.caloriesPer100g ?? null,
    protein: options.protein,
    carbs: options.carbs,
    fat: options.fat,
    fiber: options.fiber ?? null,
    solubleFiber: options.solubleFiber ?? null,
    insolubleFiber: options.insolubleFiber ?? null,
    confidence: 0.95,
    assumptions: [],
    needsReview: false,
  };
}

export function makeNutritionSnapshot(foods: Array<ReturnType<typeof makeFoodSeed>>) {
  const grouped = new Map<string, Array<ReturnType<typeof makeFoodSeed>>>();
  for (const food of foods) {
    const key = `${food.mealKey}::${food.mealLabel}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(food);
    grouped.set(key, bucket);
  }

  const meals = Array.from(grouped.entries()).map(([key, mealFoods]) => {
    const [mealKey, mealLabel] = key.split("::");
    const totals = sumFoods(mealFoods);
    return {
      id: `meal-${mealKey}`,
      mealKey,
      mealLabel,
      color: mealKey === "breakfast" ? "#8C6A43" : "#4E6B50",
      foods: mealFoods,
      totals,
    };
  });

  return {
    schemaVersion: "1.0",
    calories: sumFoods(foods).calories,
    protein: sumFoods(foods).protein,
    carbs: sumFoods(foods).carbs,
    fat: sumFoods(foods).fat,
    dailyTotals: sumFoods(foods),
    nutrients: {
      fiber: sumFoods(foods).fiber,
      sodiumMg: 180,
      potassiumMg: 340,
      calciumMg: 220,
      ironMg: 2,
      magnesiumMg: 60,
      vitaminAIu: 0,
      vitaminCMg: 0,
      vitaminDMcg: 0,
      vitaminB12Mcg: 0,
    },
    meals,
    foods,
    unmatchedItems: [],
    assumptions: [],
    warnings: [],
    confidence: 0.95,
    sourceModel: "gemini-2.5-flash",
    updatedAt: new Date().toISOString(),
  };
}

function sumFoods(foods: Array<ReturnType<typeof makeFoodSeed>>) {
  return {
    calories: foods.reduce((sum, food) => sum + (food.calories ?? 0), 0),
    protein: Math.round(foods.reduce((sum, food) => sum + (food.protein ?? 0), 0) * 10) / 10,
    carbs: Math.round(foods.reduce((sum, food) => sum + (food.carbs ?? 0), 0) * 10) / 10,
    fat: Math.round(foods.reduce((sum, food) => sum + (food.fat ?? 0), 0) * 10) / 10,
    fiber: Math.round(foods.reduce((sum, food) => sum + (food.fiber ?? 0), 0) * 10) / 10,
  };
}

export async function seedProfileAndEntries(page: Page, entries: SeedEntry[]) {
  await page.evaluate(async ({ entries }) => {
    function openDb(name: string) {
      return new Promise<IDBDatabase>((resolve, reject) => {
        let upgradeTx: IDBTransaction | null = null;
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          upgradeTx = request.transaction;
        };
        request.onsuccess = () => {
          if (upgradeTx) {
            upgradeTx.oncomplete = () => resolve(request.result);
            upgradeTx.onerror = () => reject(upgradeTx.error || request.error);
            return;
          }
          resolve(request.result);
        };
      });
    }

    const db = await openDb("calorie-tracker");
    const tx = db.transaction(["profile", "dailyEntries"], "readwrite");

    tx.objectStore("profile").put({
      id: "default",
      sex: "male",
      email: "",
      age: 34,
      height: 180,
      estimatedWeight: 80,
      targetWeight: 78,
      bodyFat: 18,
      goalMode: "maingain",
      tdeeEquation: "mifflinStJeor",
      activityFactor: "light",
      activityPrompt: "Office work and walking daily",
      foodInstructions: "",
      aiModel: "gemini-2.5-flash",
      locale: "en",
      themeMode: "light",
      updatedAt: new Date().toISOString(),
    });

    const dailyEntries = tx.objectStore("dailyEntries");
    for (const entry of entries) {
      dailyEntries.put({
        date: entry.date,
        foodLogText: entry.foodLogText,
        weight: entry.weight,
        manualCalories: entry.manualCalories,
        analysisStale: false,
        nutritionSnapshot: entry.nutritionSnapshot ?? null,
        aiStatus: entry.aiStatus ?? "idle",
        aiError: null,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  }, { entries });
}
