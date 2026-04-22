import { db } from "./db";
import { DEFAULT_GEMINI_MODEL } from "../ai/gemini-config";
import { normalizeStoredActivityFactor } from "../domain/activity-factor";
import type {
  CloudSyncState,
  DailyEntry,
  DailyEntryInput,
  DeletedDailyEntryTombstone,
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
  deletedDailyEntryTombstones: DeletedDailyEntryTombstone[];
  foodRules: FoodRule[];
  syncQueue: SyncQueueItem[];
  encryptedSecrets?: {
    aiKeys?: EncryptedSecretBoxV1;
  };
}

export interface PersistResult<T> {
  changed: boolean;
  value: T;
}

export interface DeleteResult {
  changed: boolean;
}

const DEFAULT_PROFILE: Profile = {
  id: "default",
  sex: "male",
  email: "",
  age: null,
  height: null,
  estimatedWeight: null,
  targetWeight: null,
  bodyFat: null,
  goalMode: "maingain",
  tdeeEquation: "mifflinStJeor",
  activityFactor: "sedentary",
  foodInstructions: "",
  aiModel: DEFAULT_GEMINI_MODEL,
  locale: "en",
  themeMode: "system",
  designMode: "win95",
  updatedAt: new Date().toISOString(),
};

const SETTINGS_ID = {
  aiKeys: "aiKeys",
  deletedDailyEntryTombstones: "deletedDailyEntryTombstones",
  cloudSyncState: "cloudSyncState",
} as const;

const DEFAULT_CLOUD_SYNC_STATE: CloudSyncState = {
  revision: 0,
  lastSyncedRevision: 0,
  pendingScopes: [],
  lastRemoteFingerprint: "",
  updatedAt: "",
};

function serializeForCompare(value: unknown): string {
  return JSON.stringify(toPlain(value));
}

export async function ensureDefaultProfile(
  locale: Profile["locale"],
  themeMode: Profile["themeMode"] = DEFAULT_PROFILE.themeMode,
  designMode: Profile["designMode"] = DEFAULT_PROFILE.designMode,
): Promise<Profile> {
  const existing = await db.profile.get("default");
  if (existing) {
    const legacyExisting = existing as Profile & {
      targetWeight?: number | null;
      activityPrompt?: string | null;
      activityFactor?: unknown;
    };
    const legacyEquation = (existing as Profile & { tdeeEquation?: unknown }).tdeeEquation;
    const normalizedEquation =
      legacyEquation === "mifflinStJeor" ||
      legacyEquation === "harrisBenedict" ||
      legacyEquation === "cunningham" ||
      legacyEquation === "observedTdee"
        ? legacyEquation
        : DEFAULT_PROFILE.tdeeEquation;

    const legacyGoalMode = (existing as any).goalMode as Profile["goalMode"] | undefined;
    const normalizedGoalMode =
      legacyGoalMode === "cut" || legacyGoalMode === "leanMass" || legacyGoalMode === "maingain"
        ? legacyGoalMode
        : DEFAULT_PROFILE.goalMode;
    const merged = {
      ...DEFAULT_PROFILE,
      ...existing,
      estimatedWeight:
        existing.estimatedWeight ?? legacyExisting.targetWeight ?? DEFAULT_PROFILE.estimatedWeight,
      targetWeight: (existing as Profile).targetWeight ?? legacyExisting.targetWeight ?? DEFAULT_PROFILE.targetWeight,
      bodyFat: existing.bodyFat ?? DEFAULT_PROFILE.bodyFat,
      goalMode: normalizedGoalMode,
      tdeeEquation: normalizedEquation,
      activityFactor: normalizeStoredActivityFactor(existing.activityFactor, legacyExisting.activityPrompt),
      themeMode: existing.themeMode ?? DEFAULT_PROFILE.themeMode,
      designMode: existing.designMode ?? DEFAULT_PROFILE.designMode,
      updatedAt: existing.updatedAt ?? DEFAULT_PROFILE.updatedAt,
    };
    if (JSON.stringify(merged) !== JSON.stringify(existing)) {
      await db.profile.put(merged);
    }
    return merged as Profile;
  }

  const profile = { ...DEFAULT_PROFILE, locale, themeMode, designMode, updatedAt: new Date().toISOString() };
  await db.profile.put(profile);
  return profile;
}

export async function saveProfile(profile: Profile): Promise<PersistResult<Profile>> {
  const current = await getProfile();
  const normalized: Profile = {
    ...profile,
    activityFactor: normalizeStoredActivityFactor(profile.activityFactor),
  };

  if (current) {
    const nextWithoutTimestamp = { ...normalized, updatedAt: current.updatedAt };
    if (serializeForCompare(nextWithoutTimestamp) === serializeForCompare(current)) {
      return { changed: false, value: current };
    }
  }

  const next = {
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
  await db.profile.put(toPlain(next));
  return { changed: true, value: next };
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

export async function deleteDailyEntry(date: string): Promise<DeleteResult> {
  const existing = await getEntry(date);
  const tombstones = await getDeletedDailyEntryTombstones();
  const existingTombstone = tombstones.find((item) => item.date === date);
  if (!existing && existingTombstone) {
    return { changed: false };
  }

  await db.dailyEntries.delete(date);
  await db.syncQueue.where("date").equals(date).delete();
  await upsertDeletedDailyEntryTombstone(date);
  return { changed: Boolean(existing) || !existingTombstone };
}

export async function upsertDailyEntry(input: DailyEntryInput): Promise<PersistResult<DailyEntry>> {
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
    // Keep manual calories unless the user explicitly changes that field.
    // Food-log edits should mark analysis stale, not destructively wipe existing values.
    manualCalories:
      input.manualCalories !== undefined
        ? input.manualCalories
        : entry.manualCalories,
    analysisStale: foodLogChanged ? true : entry.analysisStale ?? false,
    nutritionSnapshot: foodLogChanged ? entry.nutritionSnapshot : entry.nutritionSnapshot,
    aiStatus: foodLogChanged ? "idle" : entry.aiStatus,
    aiError: foodLogChanged ? null : entry.aiError,
    updatedAt: now,
  };

  if (existing) {
    const nextWithoutTimestamp = { ...next, updatedAt: existing.updatedAt };
    if (serializeForCompare(nextWithoutTimestamp) === serializeForCompare(existing)) {
      return { changed: false, value: existing };
    }
  }

  await db.dailyEntries.put(toPlain(next));
  await clearDeletedDailyEntryTombstone(input.date);
  return { changed: true, value: next };
}

export async function saveNutritionResult(
  date: string,
  patch: Pick<DailyEntry, "nutritionSnapshot" | "aiStatus" | "aiError">,
): Promise<PersistResult<DailyEntry> | null> {
  const existing = await getEntry(date);
  if (!existing) {
    return null;
  }

  const nextBase: DailyEntry = {
    ...existing,
    ...patch,
    // Re-analysis should not erase manual calories. Users can clear it explicitly.
    manualCalories: existing.manualCalories,
    analysisStale: patch.aiStatus === "done" ? false : existing.analysisStale ?? false,
  };
  const nextWithoutTimestamp = { ...nextBase, updatedAt: existing.updatedAt };
  if (serializeForCompare(nextWithoutTimestamp) === serializeForCompare(existing)) {
    return { changed: false, value: existing };
  }

  const next = {
    ...nextBase,
    updatedAt: new Date().toISOString(),
  };

  await db.dailyEntries.put(toPlain(next));
  await clearDeletedDailyEntryTombstone(date);
  return { changed: true, value: next };
}

export async function saveEntry(entry: DailyEntry): Promise<PersistResult<DailyEntry>> {
  const existing = await getEntry(entry.date);
  if (existing) {
    const nextWithoutTimestamp = { ...entry, updatedAt: existing.updatedAt };
    if (serializeForCompare(nextWithoutTimestamp) === serializeForCompare(existing)) {
      return { changed: false, value: existing };
    }
  }

  const next = {
    ...entry,
    updatedAt: new Date().toISOString(),
  };
  await db.dailyEntries.put(toPlain(next));
  await clearDeletedDailyEntryTombstone(entry.date);
  return { changed: true, value: next };
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
        solubleFiber: food.solubleFiber ?? null,
        insolubleFiber: food.insolubleFiber ?? null,
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
      solubleFiber: food.solubleFiber ?? null,
      insolubleFiber: food.insolubleFiber ?? null,
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
  const existing = await db.foodRules.get(rule.id);
  if (existing) {
    const nextWithoutTimestamp = { ...rule, updatedAt: existing.updatedAt };
    if (serializeForCompare(nextWithoutTimestamp) === serializeForCompare(existing)) {
      return;
    }
  }

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

export async function getDeletedDailyEntryTombstones(): Promise<DeletedDailyEntryTombstone[]> {
  const row = await db.settings.get(SETTINGS_ID.deletedDailyEntryTombstones);
  const value = (row as { tombstones?: DeletedDailyEntryTombstone[] } | undefined)?.tombstones;
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is DeletedDailyEntryTombstone =>
        Boolean(item) && typeof item.date === "string" && typeof item.deletedAt === "string",
    )
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function saveDeletedDailyEntryTombstones(
  tombstones: DeletedDailyEntryTombstone[],
): Promise<void> {
  const normalized = new Map<string, DeletedDailyEntryTombstone>();
  for (const item of tombstones) {
    if (!item?.date || !item?.deletedAt) continue;
    const previous = normalized.get(item.date);
    if (!previous || previous.deletedAt < item.deletedAt) {
      normalized.set(item.date, { date: item.date, deletedAt: item.deletedAt });
    }
  }

  await db.settings.put({
    id: SETTINGS_ID.deletedDailyEntryTombstones,
    tombstones: toPlain(Array.from(normalized.values())),
  } as any);
}

async function upsertDeletedDailyEntryTombstone(date: string): Promise<void> {
  const existing = await getDeletedDailyEntryTombstones();
  const next = existing.filter((item) => item.date !== date);
  next.push({ date, deletedAt: new Date().toISOString() });
  await saveDeletedDailyEntryTombstones(next);
}

async function clearDeletedDailyEntryTombstone(date: string): Promise<void> {
  const existing = await getDeletedDailyEntryTombstones();
  const next = existing.filter((item) => item.date !== date);
  if (next.length === existing.length) {
    return;
  }

  await saveDeletedDailyEntryTombstones(next);
}

export async function exportAppData(): Promise<ExportedAppData> {
  const [profile, dailyEntries, deletedDailyEntryTombstones, foodRules, syncQueue] = await Promise.all([
    db.profile.toArray(),
    db.dailyEntries.toArray(),
    getDeletedDailyEntryTombstones(),
    db.foodRules.toArray(),
    db.syncQueue.toArray(),
  ]);

  return {
    schemaVersion: "1",
    exportedAt: new Date().toISOString(),
    profile: toPlain(profile),
    dailyEntries: toPlain(dailyEntries),
    deletedDailyEntryTombstones: toPlain(deletedDailyEntryTombstones),
    foodRules: toPlain(foodRules),
    syncQueue: toPlain(syncQueue),
  };
}

export async function importAppData(data: ExportedAppData): Promise<void> {
  if (data.schemaVersion !== "1") {
    throw new Error("Unsupported backup format.");
  }

  await db.transaction("rw", [db.profile, db.dailyEntries, db.foodRules, db.syncQueue, db.settings], async () => {
    await db.profile.clear();
    await db.dailyEntries.clear();
    await db.foodRules.clear();
    await db.syncQueue.clear();

    if (data.profile.length) {
      const normalizedProfiles = data.profile.map((p) => ({
        ...DEFAULT_PROFILE,
        ...p,
        goalMode: (p as any).goalMode ?? DEFAULT_PROFILE.goalMode,
        themeMode: p.themeMode ?? DEFAULT_PROFILE.themeMode,
      })) as Profile[];
      await db.profile.bulkPut(toPlain(normalizedProfiles));
    }
    if (data.dailyEntries.length) {
      const normalizedEntries = data.dailyEntries.map((entry) => ({
        ...entry,
      })) as DailyEntry[];
      await db.dailyEntries.bulkPut(toPlain(normalizedEntries));
    }
    await saveDeletedDailyEntryTombstones(data.deletedDailyEntryTombstones ?? []);
    if (data.foodRules.length) {
      await db.foodRules.bulkPut(toPlain(data.foodRules));
    }
    if (data.syncQueue.length) {
      await db.syncQueue.bulkPut(toPlain(data.syncQueue));
    }
  });
}

export async function getStoredAiKeysFromDb(): Promise<StoredAiKeys | null> {
  const row = await db.settings.get(SETTINGS_ID.aiKeys);
  return (row?.aiKeys as StoredAiKeys | undefined) ?? null;
}

export async function saveStoredAiKeysToDb(nextKeys: StoredAiKeys): Promise<PersistResult<StoredAiKeys>> {
  const current = await getStoredAiKeysFromDb();
  if (current && serializeForCompare(current) === serializeForCompare(nextKeys)) {
    return { changed: false, value: current };
  }

  await db.settings.put({ id: SETTINGS_ID.aiKeys, aiKeys: toPlain(nextKeys) });
  return { changed: true, value: nextKeys };
}

export async function getCloudSyncState(): Promise<CloudSyncState> {
  const row = await db.settings.get(SETTINGS_ID.cloudSyncState);
  const raw = (row as { cloudSyncState?: Partial<CloudSyncState> } | undefined)?.cloudSyncState;
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_CLOUD_SYNC_STATE };
  }

  return {
    revision: typeof raw.revision === "number" ? raw.revision : 0,
    lastSyncedRevision: typeof raw.lastSyncedRevision === "number" ? raw.lastSyncedRevision : 0,
    pendingScopes: Array.isArray(raw.pendingScopes) ? raw.pendingScopes.filter((item): item is string => typeof item === "string") : [],
    lastRemoteFingerprint: typeof raw.lastRemoteFingerprint === "string" ? raw.lastRemoteFingerprint : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

export async function saveCloudSyncState(nextState: CloudSyncState): Promise<void> {
  await db.settings.put({
    id: SETTINGS_ID.cloudSyncState,
    cloudSyncState: toPlain(nextState),
  } as any);
}

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
