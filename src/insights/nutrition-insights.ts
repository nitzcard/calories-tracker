import type {
  AppLocale,
  DailyEntry,
  InsightStatus,
  MacroInsightStat,
  MicronutrientInsightItem,
  MicronutrientInsights,
  NutritionInsights,
  Profile,
  TopFoodInsightItem,
} from "../types";

const DAY_MS = 86400000;
const WINDOWS = {
  short: 7,
  long: 30,
} as const;

const MIN_DAYS = {
  short: 4,
  long: 10,
} as const;

type SupportedNutrientKey = MicronutrientInsightItem["nutrientKey"];

const MICRONUTRIENTS: Array<{
  nutrientKey: SupportedNutrientKey;
  unit: MicronutrientInsightItem["unit"];
  target: (profile: Profile) => number;
}> = [
  { nutrientKey: "calciumMg", unit: "mg", target: () => 1000 },
  { nutrientKey: "ironMg", unit: "mg", target: (profile) => (profile.sex === "female" ? 18 : 8) },
  {
    nutrientKey: "magnesiumMg",
    unit: "mg",
    target: (profile) => (profile.sex === "female" ? 310 : 400),
  },
  { nutrientKey: "potassiumMg", unit: "mg", target: () => 3500 },
  { nutrientKey: "vitaminDMcg", unit: "mcg", target: () => 15 },
  { nutrientKey: "vitaminB12Mcg", unit: "mcg", target: () => 2.4 },
];

const MACROS: Array<{
  key: MacroInsightStat["key"];
  unit: MacroInsightStat["unit"];
}> = [
  { key: "calories", unit: "kcal" },
  { key: "protein", unit: "g" },
  { key: "carbs", unit: "g" },
  { key: "fat", unit: "g" },
  { key: "fiber", unit: "g" },
];

export function buildNutritionInsights(
  entries: DailyEntry[],
  profile: Profile,
  anchorDate: string,
  observedTdee: number | null,
  locale: AppLocale,
): NutritionInsights {
  const anchorTime = Date.parse(anchorDate);
  const analyzed7d = analyzedEntriesWithinWindow(entries, anchorTime, WINDOWS.short);
  const analyzed30d = analyzedEntriesWithinWindow(entries, anchorTime, WINDOWS.long);
  const micronutrients = buildMicronutrientInsightsFromWindows(analyzed7d, analyzed30d, profile, anchorDate);
  const macros = buildMacroStats(analyzed7d, analyzed30d);
  const averageProteinPerKg7d = buildProteinPerKg(analyzed7d);
  const averageProteinPerKg30d = buildProteinPerKg(analyzed30d);

  return {
    micronutrients,
    macros,
    averageProteinPerKg7d,
    averageProteinPerKg30d,
    averageCaloriesVsObservedTdee7d: observedTdee ? caloriesVsTdee(analyzed7d, observedTdee) : null,
    calorieConsistency7d: calorieConsistency(analyzed7d),
    topFoods30d: buildTopFoods(analyzed30d, locale),
  };
}

function buildMicronutrientInsightsFromWindows(
  analyzed7d: DailyEntry[],
  analyzed30d: DailyEntry[],
  profile: Profile,
  anchorDate: string,
): MicronutrientInsights {
  const items = MICRONUTRIENTS.map<MicronutrientInsightItem>((config) => {
    const target = config.target(profile);
    const shortSamples = nutrientSamples(analyzed7d, config.nutrientKey);
    const longSamples = nutrientSamples(analyzed30d, config.nutrientKey);
    const average7d = average(shortSamples);
    const average30d = average(longSamples);

    return {
      nutrientKey: config.nutrientKey,
      target,
      unit: config.unit,
      average7d,
      average30d,
      validDays7d: shortSamples.length,
      validDays30d: longSamples.length,
      status7d: classifyStatus(average7d, target, shortSamples.length, MIN_DAYS.short),
      status30d: classifyStatus(average30d, target, longSamples.length, MIN_DAYS.long),
    };
  });

  return {
    anchorDate,
    analyzedDays7d: analyzed7d.length,
    analyzedDays30d: analyzed30d.length,
    likelyLowCount7d: items.filter((item) => item.status7d === "likely_low").length,
    likelyLowCount30d: items.filter((item) => item.status30d === "likely_low").length,
    items,
  };
}

function buildMacroStats(analyzed7d: DailyEntry[], analyzed30d: DailyEntry[]): MacroInsightStat[] {
  return MACROS.map((macro) => ({
    key: macro.key,
    unit: macro.unit,
    average7d: average(dailyMacroSamples(analyzed7d, macro.key)),
    average30d: average(dailyMacroSamples(analyzed30d, macro.key)),
  }));
}

function buildProteinPerKg(entries: DailyEntry[]) {
  const valid = entries.filter(
    (entry) =>
      typeof entry.nutritionSnapshot?.dailyTotals.protein === "number" &&
      typeof entry.weight === "number" &&
      entry.weight > 0,
  );

  if (!valid.length) {
    return null;
  }

  return Number(
    (
      valid.reduce(
        (sum, entry) => sum + (entry.nutritionSnapshot!.dailyTotals.protein ?? 0) / entry.weight!,
        0,
      ) / valid.length
    ).toFixed(2),
  );
}

function caloriesVsTdee(entries: DailyEntry[], observedTdee: number) {
  const calories = dailyMacroSamples(entries, "calories");
  if (!calories.length) {
    return null;
  }

  return Math.round(average(calories)! - observedTdee);
}

function calorieConsistency(entries: DailyEntry[]) {
  const calories = dailyMacroSamples(entries, "calories");
  if (calories.length < 2) {
    return null;
  }

  const avg = average(calories)!;
  const variance = calories.reduce((sum, value) => sum + (value - avg) ** 2, 0) / calories.length;
  return Math.round(Math.sqrt(variance));
}

function buildTopFoods(entries: DailyEntry[], locale: AppLocale): TopFoodInsightItem[] {
  const map = new Map<string, { name: string; dates: Set<string>; calories: number }>();

  for (const entry of entries) {
    for (const food of entry.nutritionSnapshot?.foods ?? []) {
      const preferredName =
        locale === "he" ? food.name || food.canonicalName || "" : food.canonicalName || food.name || "";
      const name = preferredName.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = map.get(key) ?? { name, dates: new Set<string>(), calories: 0 };
      existing.dates.add(entry.date);
      existing.calories += food.calories ?? 0;
      map.set(key, existing);
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      name: item.name,
      daysSeen30d: item.dates.size,
      totalCalories30d: item.calories ? Math.round(item.calories) : null,
    }))
    .sort((a, b) => {
      if (b.daysSeen30d !== a.daysSeen30d) {
        return b.daysSeen30d - a.daysSeen30d;
      }

      return (b.totalCalories30d ?? 0) - (a.totalCalories30d ?? 0);
    })
    .slice(0, 8);
}

function analyzedEntriesWithinWindow(entries: DailyEntry[], anchorTime: number, days: number) {
  const start = anchorTime - (days - 1) * DAY_MS;
  return entries.filter((entry) => {
    if (!entry.nutritionSnapshot) {
      return false;
    }

    const entryTime = Date.parse(entry.date);
    return entryTime >= start && entryTime <= anchorTime;
  });
}

function nutrientSamples(entries: DailyEntry[], nutrientKey: SupportedNutrientKey) {
  return entries
    .map((entry) => entry.nutritionSnapshot?.nutrients?.[nutrientKey] ?? null)
    .filter((value): value is number => typeof value === "number");
}

function dailyMacroSamples(entries: DailyEntry[], key: MacroInsightStat["key"]) {
  if (key === "calories") {
    return entries
      .map((entry) => entry.manualCalories ?? entry.nutritionSnapshot?.dailyTotals?.calories ?? null)
      .filter((value): value is number => typeof value === "number");
  }

  return entries
    .map((entry) => entry.nutritionSnapshot?.dailyTotals?.[key] ?? null)
    .filter((value): value is number => typeof value === "number");
}

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function classifyStatus(
  averageValue: number | null,
  target: number,
  validDays: number,
  minDays: number,
): InsightStatus {
  if (averageValue === null || validDays < minDays) {
    return "insufficient_data";
  }

  const coverage = averageValue / target;
  if (coverage < 0.8) {
    return "likely_low";
  }

  if (coverage < 1) {
    return "borderline";
  }

  return "covered";
}
