import { resolvedDailyCalories } from "../domain/entries";
import type { DailyEntry, FormulaTdeeResult, Profile, TdeeSnapshot } from "../types";

const MIN_OBSERVED_TDEE_DAYS = 7;
const MIN_OBSERVED_TDEE_ENTRIES = 4;
const OBSERVED_TDEE_MIN = 800;
const OBSERVED_TDEE_MAX = 6000;

function firstNumberMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const value = Number(match[1].replace(",", "."));
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function parseStepCount(text: string) {
  const thousandSteps = firstNumberMatch(text, [
    /(\d+(?:[.,]\d+)?)\s*k\s*steps?/i,
    /(\d+(?:[.,]\d+)?)\s*אלף\s*צעדים/u,
  ]);
  if (thousandSteps !== null) {
    return Math.round(thousandSteps * 1000);
  }

  const directSteps = firstNumberMatch(text, [
    /(\d{4,5})\s*steps?/i,
    /(\d{4,5})\s*צעדים/u,
  ]);
  if (directSteps !== null) {
    return Math.round(directSteps);
  }

  return null;
}

function parseWeeklyWorkouts(text: string) {
  return firstNumberMatch(text, [
    /(\d+(?:[.,]\d+)?)\s*(?:workouts?|trainings?|sessions?)\b/i,
    /(\d+(?:[.,]\d+)?)\s*(?:x|times?)\s*(?:a\s*)?week/i,
    /(\d+(?:[.,]\d+)?)\s*אימונים?/u,
    /(\d+(?:[.,]\d+)?)\s*פעמים?\s*בשבוע/u,
  ]);
}

function activityMultiplier(prompt: string): number {
  const text = prompt.toLowerCase();

  const veryActiveSignals = [
    "very",
    "hard",
    "intense",
    "athlete",
    "physical job",
    "manual labor",
    "very active",
    "מאוד פעיל",
    "עבודה פיזית",
    "עבודה קשה",
    "אימונים קשים",
    "פעילות גבוהה",
  ];
  const moderateSignals = [
    "moderate",
    "training",
    "workout",
    "gym",
    "exercise",
    "active job",
    "8k",
    "10k",
    "moderately active",
    "פעיל",
    "מתאמן",
    "אימון",
    "חדר כושר",
    "עבודה פעילה",
    "הליכה",
    "צעדים",
  ];
  const lightSignals = [
    "light",
    "walk",
    "walking",
    "standing",
    "commute",
    "some steps",
    "desk job with walking",
    "קל",
    "קלילה",
    "הליכות",
    "עומד",
    "עומדת",
    "קצת צעדים",
    "משרד",
  ];

  if (veryActiveSignals.some((signal) => text.includes(signal))) return 1.725;

  let multiplier = 1.2;
  const weeklyWorkouts = parseWeeklyWorkouts(text);
  const stepCount = parseStepCount(text);

  if (weeklyWorkouts !== null) {
    multiplier += Math.min(0.24, weeklyWorkouts * 0.035);
  }

  if (stepCount !== null) {
    multiplier += Math.min(0.22, Math.max(0, stepCount - 2000) / 1000 * 0.018);
  }

  if (moderateSignals.some((signal) => text.includes(signal))) {
    multiplier = Math.max(multiplier, 1.55);
  }

  if (lightSignals.some((signal) => text.includes(signal))) {
    multiplier = Math.max(multiplier, 1.375);
  }

  if (multiplier > 1.2) {
    return Math.min(1.8, Number(multiplier.toFixed(3)));
  }

  return 1.2;
}

export function calculateFormulaTdee(
  profile: Profile,
  latestWeight: number | null,
): FormulaTdeeResult {
  if (!profile.age || !profile.height || !latestWeight) {
    return { average: null, breakdown: {} };
  }

  const kg = latestWeight;
  const cm = profile.height;
  const activity = activityMultiplier(profile.activityPrompt);
  const sexOffset = profile.sex === "female" ? -161 : 5;
  const normalizedBodyFat =
    profile.bodyFat !== null &&
    profile.bodyFat !== undefined &&
    Number.isFinite(profile.bodyFat) &&
    profile.bodyFat >= 0 &&
    profile.bodyFat <= 60
      ? profile.bodyFat
      : null;
  const leanMassKg =
    normalizedBodyFat !== null
      ? kg * (1 - normalizedBodyFat / 100)
      : kg;

  const mifflin = (10 * kg + 6.25 * cm - 5 * profile.age + sexOffset) * activity;
  const harris =
    (profile.sex === "female"
      ? 655.0955 + 9.5634 * kg + 1.8496 * cm - 4.6756 * profile.age
      : 66.473 + 13.7516 * kg + 5.0033 * cm - 6.755 * profile.age) * activity;
  const cunningham = (500 + 22 * leanMassKg) * activity;
  const breakdown = {
    mifflinStJeor: Math.round(mifflin),
    harrisBenedict: Math.round(harris),
    cunningham: Math.round(cunningham),
  };
  const average = Math.round(
    (breakdown.mifflinStJeor + breakdown.harrisBenedict + breakdown.cunningham) / 3,
  );
  return { average, breakdown };
}

export function calculateObservedTdee(entries: DailyEntry[]): number | null {
  return calculateObservedTdeeRange(entries).value;
}

function calculateObservedTdeeRange(entries: DailyEntry[]): {
  value: number | null;
  fromDate: string | null;
  toDate: string | null;
} {
  const valid = entries
    .filter((entry) => entry.weight !== null && resolvedDailyCalories(entry) !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (valid.length < MIN_OBSERVED_TDEE_ENTRIES) {
    return { value: null, fromDate: null, toDate: null };
  }

  const first = valid[0];
  const last = valid[valid.length - 1];
  if (first.weight === null || last.weight === null) {
    return { value: null, fromDate: null, toDate: null };
  }

  const daySpan = Math.max(1, (Date.parse(last.date) - Date.parse(first.date)) / 86400000);
  if (daySpan < MIN_OBSERVED_TDEE_DAYS) {
    return { value: null, fromDate: first.date, toDate: last.date };
  }

  const avgCalories =
    valid.reduce((sum, entry) => sum + (resolvedDailyCalories(entry) ?? 0), 0) / valid.length;

  // OLS linear regression on weight over time — more robust than endpoint averages
  const t0 = Date.parse(valid[0].date) / 86400000;
  const xs = valid.map((e) => Date.parse(e.date) / 86400000 - t0);
  const ws = valid.map((e) => e.weight as number);
  const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const wMean = ws.reduce((a, b) => a + b, 0) / ws.length;
  const slopeNumer = xs.reduce((sum, x, i) => sum + (x - xMean) * (ws[i] - wMean), 0);
  const slopeDenom = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
  const weightSlopePerDay = slopeDenom === 0 ? 0 : slopeNumer / slopeDenom; // kg/day
  const dailyWeightEnergy = weightSlopePerDay * 7700;
  const observedTdee = Math.round(avgCalories - dailyWeightEnergy);

  if (observedTdee < OBSERVED_TDEE_MIN || observedTdee > OBSERVED_TDEE_MAX) {
    return { value: null, fromDate: first.date, toDate: last.date };
  }

  return {
    value: observedTdee,
    fromDate: first.date,
    toDate: last.date,
  };
}

function latestLoggedWeight(entries: DailyEntry[]): number | null {
  const withWeight = entries
    .filter((e) => e.weight !== null && e.weight !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  return withWeight.at(-1)?.weight ?? null;
}

export function buildTdeeSnapshot(entries: DailyEntry[], profile: Profile): TdeeSnapshot {
  const formulas = calculateFormulaTdee(
    profile,
    latestLoggedWeight(entries) ?? profile.estimatedWeight,
  );
  const observed = calculateObservedTdeeRange(entries);
  return {
    observedTdee: observed.value,
    observedFromDate: observed.fromDate,
    observedToDate: observed.toDate,
    formulaTdeeAverage: formulas.average,
    formulaBreakdown: formulas.breakdown,
    lastComputedAt: new Date().toISOString(),
  };
}
