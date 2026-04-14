import { db } from "./db";
import { DEFAULT_GEMINI_MODEL } from "../ai/gemini-config";
import type {
  DailyEntry,
  DailyEntryInput,
  FoodRule,
  NutritionSnapshot,
  Profile,
  SyncQueueItem,
} from "../types";
import type { EncryptedSecretBoxV1 } from "../cloud/crypto";
import type { StoredAiKeys } from "../ai/credentials";

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
  email: "",
  age: null,
  height: null,
  estimatedWeight: null,
  targetWeight: null,
  customTdee: null,
  bodyFat: null,
  goalMode: "maingain",
  weightMissingStrategy: "previousDay",
  tdeeEquation: "mifflinStJeor",
  activityPrompt: "",
  foodInstructions: "",
  aiModel: DEFAULT_GEMINI_MODEL,
  locale: "en",
  themeMode: "system",
  updatedAt: new Date().toISOString(),
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
      legacyEquation === "custom" ||
      legacyEquation === "observedTdee"
        ? legacyEquation
        : DEFAULT_PROFILE.tdeeEquation;

    const legacyGoalMode = (existing as any).goalMode as Profile["goalMode"] | undefined;
    const normalizedGoalMode =
      legacyGoalMode === "cut" || legacyGoalMode === "leanMass" || legacyGoalMode === "maingain"
        ? legacyGoalMode
        : DEFAULT_PROFILE.goalMode;
    const legacyWeightMissingStrategy = (existing as any).weightMissingStrategy as
      | Profile["weightMissingStrategy"]
      | undefined;
    const normalizedWeightMissingStrategy =
      legacyWeightMissingStrategy === "previousDay" || legacyWeightMissingStrategy === "deducedWeight"
        ? legacyWeightMissingStrategy
        : legacyWeightMissingStrategy === "carryForward" || legacyWeightMissingStrategy === "loggedOnly"
          ? "previousDay"
          : DEFAULT_PROFILE.weightMissingStrategy;

    let migratedCustomTdee: number | null = null;
    const existingCustomTdee = (existing as any).customTdee as number | null | undefined;
    if (existingCustomTdee != null && Number.isFinite(existingCustomTdee) && existingCustomTdee > 0) {
      migratedCustomTdee = existingCustomTdee;
    } else {
      // One-time compatibility: prior builds stored `customTdee` per-day on daily entries.
      const latestPerDay = await db.dailyEntries
        .orderBy("date")
        .reverse()
        .filter((entry) => (entry as any).customTdee != null)
        .first();
      const fromPerDay = (latestPerDay as any)?.customTdee as number | null | undefined;
      if (fromPerDay != null && Number.isFinite(fromPerDay) && fromPerDay > 0) {
        migratedCustomTdee = fromPerDay;
      }
    }

    const merged = {
      ...DEFAULT_PROFILE,
      ...existing,
      estimatedWeight:
        existing.estimatedWeight ?? legacyExisting.targetWeight ?? DEFAULT_PROFILE.estimatedWeight,
      targetWeight: (existing as Profile).targetWeight ?? legacyExisting.targetWeight ?? DEFAULT_PROFILE.targetWeight,
      customTdee: migratedCustomTdee ?? DEFAULT_PROFILE.customTdee,
      bodyFat: existing.bodyFat ?? DEFAULT_PROFILE.bodyFat,
      goalMode: normalizedGoalMode,
      weightMissingStrategy: normalizedWeightMissingStrategy,
      tdeeEquation: normalizedEquation,
      updatedAt: existing.updatedAt ?? DEFAULT_PROFILE.updatedAt,
    };
    if (JSON.stringify(merged) !== JSON.stringify(existing)) {
      await db.profile.put(merged);
    }
    return merged as Profile;
  }

  const profile = { ...DEFAULT_PROFILE, locale, themeMode, updatedAt: new Date().toISOString() };
  await db.profile.put(profile);
  return profile;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profile.put(
    toPlain({
      ...profile,
      updatedAt: new Date().toISOString(),
    }),
  );
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
    customTdee: null,
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
    customTdee: input.customTdee === undefined ? entry.customTdee : input.customTdee,
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
    customTdee: (entry as any).customTdee ?? null,
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
  await db.foodRules.put(
    toPlain({
      ...rule,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export async function deleteFoodRule(id: string): Promise<void> {
  await db.foodRules.delete(id);
}

export async function enqueueSync(item: Omit<SyncQueueItem, "id">): Promise<number> {
  return db.syncQueue.add(toPlain(item));
}

export async function clearQueueItemsByDate(date: string): Promise<void> {
  await db.syncQueue.where("date").equals(date).delete();
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
      const normalizedProfiles = data.profile.map((p) => ({
        ...DEFAULT_PROFILE,
        ...p,
        customTdee: (p as any).customTdee ?? DEFAULT_PROFILE.customTdee,
        goalMode: (p as any).goalMode ?? DEFAULT_PROFILE.goalMode,
      })) as Profile[];
      await db.profile.bulkPut(toPlain(normalizedProfiles));
    }
    if (data.dailyEntries.length) {
      const normalizedEntries = data.dailyEntries.map((entry) => ({
        ...entry,
        customTdee: (entry as any).customTdee ?? null,
      })) as DailyEntry[];
      await db.dailyEntries.bulkPut(toPlain(normalizedEntries));
    }
    if (data.foodRules.length) {
      await db.foodRules.bulkPut(toPlain(data.foodRules));
    }
    if (data.syncQueue.length) {
      await db.syncQueue.bulkPut(toPlain(data.syncQueue));
    }
  });
}

const SETTINGS_ID = {
  aiKeys: "aiKeys",
} as const;

export async function getStoredAiKeysFromDb(): Promise<StoredAiKeys | null> {
  const row = await db.settings.get(SETTINGS_ID.aiKeys);
  return (row?.aiKeys as StoredAiKeys | undefined) ?? null;
}

export async function saveStoredAiKeysToDb(nextKeys: StoredAiKeys): Promise<void> {
  await db.settings.put({ id: SETTINGS_ID.aiKeys, aiKeys: toPlain(nextKeys) });
}

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
