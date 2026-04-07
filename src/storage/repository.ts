import { db } from "./db";
import type {
  DailyEntry,
  DailyEntryInput,
  FoodRule,
  NutritionSnapshot,
  Profile,
  SyncQueueItem,
} from "../types";
import type { EncryptedSecretBoxV1 } from "../cloud/crypto";

export interface ExportedAppData {
  schemaVersion: "1";
  exportedAt: string;
  profile: Profile[];
  dailyEntries: DailyEntry[];
  foodRules: FoodRule[];
  syncQueue: SyncQueueItem[];
  encryptedSecrets?: {
    aiKeys?: EncryptedSecretBoxV1;
  };
}

const DEFAULT_PROFILE: Profile = {
  id: "default",
  sex: "male",
  age: null,
  height: null,
  estimatedWeight: null,
  bodyFat: null,
  tdeeEquation: "mifflinStJeor",
  activityPrompt: "",
  foodInstructions: "",
  aiModel: "gemini-2.5-flash",
  locale: "en",
  themeMode: "system",
};

export async function ensureDefaultProfile(
  locale: Profile["locale"],
  themeMode: Profile["themeMode"],
): Promise<Profile> {
  const existing = await db.profile.get("default");
  if (existing) {
    const legacyExisting = existing as Profile & { targetWeight?: number | null };
    const legacyEquation = (existing as Profile & { tdeeEquation?: unknown }).tdeeEquation;
    const normalizedEquation =
      legacyEquation === "mifflinStJeor" ||
      legacyEquation === "harrisBenedict" ||
      legacyEquation === "cunningham" ||
      legacyEquation === "observedTdee"
        ? legacyEquation
        : DEFAULT_PROFILE.tdeeEquation;
    const merged = {
      ...DEFAULT_PROFILE,
      ...existing,
      estimatedWeight:
        existing.estimatedWeight ?? legacyExisting.targetWeight ?? DEFAULT_PROFILE.estimatedWeight,
      bodyFat: existing.bodyFat ?? DEFAULT_PROFILE.bodyFat,
      tdeeEquation: normalizedEquation,
    };
    if (JSON.stringify(merged) !== JSON.stringify(existing)) {
      await db.profile.put(merged);
    }
    return merged;
  }

  const profile = { ...DEFAULT_PROFILE, locale, themeMode };
  await db.profile.put(profile);
  return profile;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put(toPlain(profile));
}

export async function getProfile(): Promise<Profile | undefined> {
  return db.profile.get("default");
}

export async function listEntries(): Promise<DailyEntry[]> {
  const entries = await db.dailyEntries.orderBy("date").reverse().toArray();
  return entries.map(normalizeEntry);
}

export async function getEntry(date: string): Promise<DailyEntry | undefined> {
  const entry = await db.dailyEntries.get(date);
  return entry ? normalizeEntry(entry) : undefined;
}

export async function upsertDailyEntry(input: DailyEntryInput): Promise<DailyEntry> {
  const now = new Date().toISOString();
  const existing = await getEntry(input.date);
  const entry: DailyEntry = existing ?? {
    date: input.date,
    foodLogText: "",
    weight: null,
    manualCalories: null,
    analysisStale: false,
    nutritionSnapshot: null,
    aiStatus: "idle",
    aiError: null,
    updatedAt: now,
    createdAt: now,
  };

  const foodLogChanged =
    input.foodLogText !== undefined && input.foodLogText !== entry.foodLogText;

  const next: DailyEntry = {
    ...entry,
    foodLogText: input.foodLogText ?? entry.foodLogText,
    weight: input.weight === undefined ? entry.weight : input.weight,
    manualCalories:
      input.manualCalories !== undefined
        ? input.manualCalories
        : foodLogChanged
          ? null
          : entry.manualCalories,
    analysisStale: foodLogChanged ? false : entry.analysisStale ?? false,
    nutritionSnapshot: foodLogChanged ? null : entry.nutritionSnapshot,
    aiStatus: foodLogChanged ? "idle" : entry.aiStatus,
    aiError: foodLogChanged ? null : entry.aiError,
    updatedAt: now,
  };

  await db.dailyEntries.put(toPlain(next));
  return next;
}

export async function saveNutritionResult(
  date: string,
  patch: Pick<DailyEntry, "nutritionSnapshot" | "aiStatus" | "aiError">,
): Promise<void> {
  const existing = await getEntry(date);
  if (!existing) {
    return;
  }

  await db.dailyEntries.put(
    toPlain({
      ...existing,
      ...patch,
      manualCalories: patch.aiStatus === "done" ? null : existing.manualCalories,
      analysisStale: patch.aiStatus === "done" ? false : existing.analysisStale ?? false,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export async function saveEntry(entry: DailyEntry): Promise<void> {
  await db.dailyEntries.put(
    toPlain({
      ...entry,
      updatedAt: new Date().toISOString(),
    }),
  );
}

function normalizeEntry(entry: DailyEntry): DailyEntry {
  return {
    ...entry,
    manualCalories: entry.manualCalories ?? null,
    analysisStale: entry.analysisStale ?? false,
    nutritionSnapshot: entry.nutritionSnapshot ? normalizeNutritionSnapshot(entry.nutritionSnapshot) : null,
  };
}

function normalizeNutritionSnapshot(snapshot: NutritionSnapshot): NutritionSnapshot {
  const mealColors: Record<string, string> = {
    breakfast: "#8C6A43",
    lunch: "#4E6B50",
    dinner: "#556B8D",
    snack: "#7A5C74",
    other: "#6C6A62",
  };

  return {
    schemaVersion: snapshot.schemaVersion ?? "legacy",
    calories: snapshot.calories ?? snapshot.dailyTotals?.calories ?? null,
    protein: snapshot.protein ?? snapshot.dailyTotals?.protein ?? null,
    carbs: snapshot.carbs ?? snapshot.dailyTotals?.carbs ?? null,
    fat: snapshot.fat ?? snapshot.dailyTotals?.fat ?? null,
    dailyTotals: snapshot.dailyTotals ?? {
      calories: snapshot.calories ?? null,
      protein: snapshot.protein ?? null,
      carbs: snapshot.carbs ?? null,
      fat: snapshot.fat ?? null,
      fiber: snapshot.nutrients?.fiber ?? null,
    },
    nutrients: snapshot.nutrients,
    meals: (snapshot.meals ?? []).map((meal) => ({
      ...meal,
      color: meal.color ?? mealColors[meal.mealKey] ?? mealColors.other,
      foods: meal.foods.map((food) => ({
        ...food,
        gramsEstimated: Boolean(food.gramsEstimated),
        caloriesEstimated: Boolean(food.caloriesEstimated),
        fiber: food.fiber ?? null,
      })),
    })),
    foods: (snapshot.foods ?? []).map((food) => ({
      ...food,
      gramsEstimated: Boolean(food.gramsEstimated),
      caloriesEstimated: Boolean(food.caloriesEstimated),
      caloriesPer100g:
        food.caloriesPer100g ??
        (food.grams && food.calories ? Math.round((food.calories / food.grams) * 100) : null),
      fiber: food.fiber ?? null,
    })),
    unmatchedItems: snapshot.unmatchedItems ?? [],
    assumptions: snapshot.assumptions ?? [],
    warnings: snapshot.warnings ?? [],
    confidence: snapshot.confidence ?? null,
    sourceModel: snapshot.sourceModel,
    updatedAt: snapshot.updatedAt,
  };
}

export async function listFoodRules(): Promise<FoodRule[]> {
  return db.foodRules.orderBy("createdAt").reverse().toArray();
}

export async function saveFoodRule(rule: FoodRule): Promise<void> {
  await db.foodRules.put(toPlain(rule));
}

export async function deleteFoodRule(id: string): Promise<void> {
  await db.foodRules.delete(id);
}

export async function enqueueSync(item: Omit<SyncQueueItem, "id">): Promise<number> {
  return db.syncQueue.add(toPlain(item));
}

export async function updateQueueStatus(
  id: number,
  status: SyncQueueItem["status"],
  attempts: number,
): Promise<void> {
  await db.syncQueue.update(id, {
    status,
    attempts,
    updatedAt: new Date().toISOString(),
  });
}

export async function getPendingQueue(): Promise<SyncQueueItem[]> {
  return db.syncQueue.where("status").anyOf("pending", "failed").sortBy("enqueuedAt");
}

export async function exportAppData(): Promise<ExportedAppData> {
  const [profile, dailyEntries, foodRules, syncQueue] = await Promise.all([
    db.profile.toArray(),
    db.dailyEntries.toArray(),
    db.foodRules.toArray(),
    db.syncQueue.toArray(),
  ]);

  return {
    schemaVersion: "1",
    exportedAt: new Date().toISOString(),
    profile: toPlain(profile),
    dailyEntries: toPlain(dailyEntries),
    foodRules: toPlain(foodRules),
    syncQueue: toPlain(syncQueue),
  };
}

export async function importAppData(data: ExportedAppData): Promise<void> {
  if (data.schemaVersion !== "1") {
    throw new Error("Unsupported backup format.");
  }

  await db.transaction("rw", db.profile, db.dailyEntries, db.foodRules, db.syncQueue, async () => {
    await db.profile.clear();
    await db.dailyEntries.clear();
    await db.foodRules.clear();
    await db.syncQueue.clear();

    if (data.profile.length) {
      await db.profile.bulkPut(toPlain(data.profile));
    }
    if (data.dailyEntries.length) {
      await db.dailyEntries.bulkPut(toPlain(data.dailyEntries));
    }
    if (data.foodRules.length) {
      await db.foodRules.bulkPut(toPlain(data.foodRules));
    }
    if (data.syncQueue.length) {
      await db.syncQueue.bulkPut(toPlain(data.syncQueue));
    }
  });
}

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
