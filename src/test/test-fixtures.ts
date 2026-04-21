import type { ExportedAppData } from "../storage/repository";
import type { DailyEntry, Profile } from "../types";

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
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
    updatedAt: "2026-04-21T10:00:00.000Z",
    ...overrides,
  };
}

export function makeEntry(overrides: Partial<DailyEntry> & Pick<DailyEntry, "date">): DailyEntry {
  const { date, ...rest } = overrides;
  return {
    date,
    foodLogText: "",
    weight: null,
    manualCalories: null,
    analysisStale: false,
    nutritionSnapshot: null,
    aiStatus: "idle",
    aiError: null,
    updatedAt: "2026-04-21T10:00:00.000Z",
    createdAt: "2026-04-21T10:00:00.000Z",
    ...rest,
  };
}

export function makeNutritionSnapshot(overrides: Partial<NonNullable<DailyEntry["nutritionSnapshot"]>> = {}) {
  return {
    schemaVersion: "1.0",
    calories: 320,
    protein: 19,
    carbs: 44,
    fat: 8,
    dailyTotals: { calories: 320, protein: 19, carbs: 44, fat: 8, fiber: 6 },
    nutrients: {
      fiber: 6,
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
    meals: [],
    foods: [],
    unmatchedItems: [],
    assumptions: [],
    warnings: [],
    confidence: 0.95,
    sourceModel: "gemini-2.5-flash",
    updatedAt: "2026-04-21T10:00:00.000Z",
    ...overrides,
  };
}

export function makeExportedData(args: {
  profile?: Profile[];
  dailyEntries?: DailyEntry[];
} = {}): ExportedAppData {
  return {
    schemaVersion: "1",
    exportedAt: "2026-04-21T10:00:00.000Z",
    profile: args.profile ?? [makeProfile()],
    dailyEntries: args.dailyEntries ?? [],
    deletedDailyEntryTombstones: [],
    foodRules: [],
    syncQueue: [],
  };
}

export function makeObservedTdeeEntries() {
  return [
    makeEntry({ date: "2026-04-01", weight: 82, manualCalories: 2400 }),
    makeEntry({ date: "2026-04-03", weight: 81.7, manualCalories: 2380 }),
    makeEntry({ date: "2026-04-05", weight: 81.5, manualCalories: 2360 }),
    makeEntry({ date: "2026-04-08", weight: 81.2, manualCalories: 2350 }),
  ];
}

export function makeInsufficientObservedEntries() {
  return [
    makeEntry({ date: "2026-04-01", weight: 82, manualCalories: 2400 }),
    makeEntry({ date: "2026-04-03", weight: 81.9, manualCalories: 2380 }),
    makeEntry({ date: "2026-04-05", weight: 81.8, manualCalories: 2360 }),
  ];
}
