import { DEFAULT_GEMINI_MODEL } from "../ai/gemini-config";
import type { StoredAiKeys } from "../ai/credentials";
import { normalizeStoredActivityFactor } from "../domain/activity-factor";
import type { BiologicalSex, DailyEntry, FoodRule, GoalMode, Profile, TdeeEquation } from "../types";

export interface CloudAppState {
  schemaVersion: "2";
  updatedAt: string;
  profile: Profile;
  dailyEntries: DailyEntry[];
  foodRules: FoodRule[];
  aiKeys: StoredAiKeys;
}

export function emptyAiKeys(): StoredAiKeys {
  return {
    gemini: "",
  };
}

export function createDefaultProfile(locale: Profile["locale"] = "en"): Profile {
  return {
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
    locale,
    themePreference: "system",
    historySummaryBaselineDate: null,
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyCloudAppState(locale: Profile["locale"] = "en"): CloudAppState {
  return {
    schemaVersion: "2",
    updatedAt: new Date().toISOString(),
    profile: createDefaultProfile(locale),
    dailyEntries: [],
    foodRules: [],
    aiKeys: emptyAiKeys(),
  };
}

function toRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  const record = toRecord(value);
  return record ? (Object.values(record) as T[]) : [];
}

function normalizeTdeeEquation(value: unknown): TdeeEquation {
  if (value === "observedTdee" || value === "cunningham" || value === "mifflinStJeor") {
    return value;
  }
  return "mifflinStJeor";
}

function normalizeBiologicalSex(value: unknown): BiologicalSex {
  if (value === "female" || value === "male" || value === "other") {
    return value;
  }
  return "male";
}

function normalizeGoalMode(value: unknown): GoalMode {
  if (value === "cut" || value === "leanMass" || value === "maingain") {
    return value;
  }
  return "maingain";
}

function stringOrDefault(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeProfile(raw: unknown, fallbackLocale: Profile["locale"] = "en"): Profile {
  const record = toRecord(raw) ?? {};
  const defaults = createDefaultProfile(fallbackLocale);
  const locale = record.locale === "he" || record.locale === "en" ? record.locale : defaults.locale;

  return {
    ...defaults,
    ...record,
    id: "default",
    sex: normalizeBiologicalSex(record.sex),
    email: stringOrDefault(record.email),
    age: typeof record.age === "number" ? record.age : null,
    height: typeof record.height === "number" ? record.height : null,
    estimatedWeight: typeof record.estimatedWeight === "number" ? record.estimatedWeight : null,
    targetWeight: typeof record.targetWeight === "number" ? record.targetWeight : null,
    bodyFat: typeof record.bodyFat === "number" ? record.bodyFat : null,
    goalMode: normalizeGoalMode(record.goalMode),
    tdeeEquation: normalizeTdeeEquation(record.tdeeEquation),
    activityFactor: normalizeStoredActivityFactor(record.activityFactor),
    foodInstructions: stringOrDefault(record.foodInstructions),
    aiModel: typeof record.aiModel === "string" && record.aiModel.trim() ? record.aiModel : defaults.aiModel,
    locale,
    themePreference:
      record.themePreference === "light" ||
      record.themePreference === "dark" ||
      record.themePreference === "system"
        ? record.themePreference
        : "system",
    historySummaryBaselineDate:
      typeof record.historySummaryBaselineDate === "string" ? record.historySummaryBaselineDate : null,
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : new Date().toISOString(),
  };
}

function normalizeEntry(raw: unknown): DailyEntry | null {
  const record = toRecord(raw);
  if (!record || typeof record.date !== "string" || !record.date) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    date: record.date,
    foodLogText: typeof record.foodLogText === "string" ? record.foodLogText : "",
    weight: typeof record.weight === "number" ? record.weight : null,
    manualCalories: typeof record.manualCalories === "number" ? record.manualCalories : null,
    analysisStale: Boolean(record.analysisStale),
    nutritionSnapshot: (record.nutritionSnapshot as DailyEntry["nutritionSnapshot"]) ?? null,
    aiStatus:
      record.aiStatus === "pending" ||
      record.aiStatus === "processing" ||
      record.aiStatus === "done" ||
      record.aiStatus === "failed"
        ? record.aiStatus
        : "idle",
    aiError: typeof record.aiError === "string" ? record.aiError : null,
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : now,
    createdAt: typeof record.createdAt === "string" && record.createdAt ? record.createdAt : now,
  };
}

function normalizeAiKeys(raw: unknown): StoredAiKeys {
  const record = toRecord(raw) ?? {};
  return {
    gemini: typeof record.gemini === "string" ? record.gemini : "",
  };
}

export function normalizeCloudAppState(raw: unknown, fallbackLocale: Profile["locale"] = "en"): CloudAppState {
  const outer = toRecord(raw) ?? {};
  const payload = "payload" in outer ? toRecord(outer.payload) ?? {} : outer;

  const profileSource = Array.isArray(payload.profile) ? payload.profile[0] : payload.profile;
  const profile = normalizeProfile(profileSource, fallbackLocale);

  const dailyEntries = toArray<unknown>(payload.dailyEntries ?? payload.entries)
    .map(normalizeEntry)
    .filter((entry): entry is DailyEntry => Boolean(entry))
    .sort((a, b) => b.date.localeCompare(a.date));

  const foodRules = toArray<FoodRule>(payload.foodRules);
  const aiKeys = normalizeAiKeys(payload.aiKeys);

  return {
    schemaVersion: "2",
    updatedAt:
      typeof payload.updatedAt === "string" && payload.updatedAt
        ? payload.updatedAt
        : typeof payload.exportedAt === "string" && payload.exportedAt
          ? payload.exportedAt
          : new Date().toISOString(),
    profile,
    dailyEntries,
    foodRules,
    aiKeys,
  };
}

export function cloneCloudAppState(state: CloudAppState): CloudAppState {
  return JSON.parse(JSON.stringify(state)) as CloudAppState;
}
