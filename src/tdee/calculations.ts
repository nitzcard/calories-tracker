import { deducedWeightFromEntries, resolvedDailyCalories } from "../domain/entries";
import { localIsoDate } from "../domain/dates";
import type {
  ActivityFactor,
  DailyEntry,
  FormulaTdeeResult,
  Profile,
  TdeeEquation,
  TdeeSnapshot,
} from "../types";

const MIN_OBSERVED_TDEE_DAYS = 7;
const MIN_OBSERVED_TDEE_ENTRIES = 4;
const OBSERVED_TDEE_MIN = 800;
const OBSERVED_TDEE_MAX = 6000;

export function activityMultiplier(activityFactor: ActivityFactor): number {
  if (activityFactor === "inferred") {
    return 1.2;
  }
  if (activityFactor === "veryActive") return 1.725;
  if (activityFactor === "moderate") return 1.55;
  if (activityFactor === "light") return 1.375;
  return 1.2;
}

export function inferActivityFactorFromPrompt(prompt: string): Exclude<ActivityFactor, "inferred"> {
  const text = prompt.toLowerCase();

  if (!text.trim()) {
    return "sedentary";
  }

  if (
    [
      "very active",
      "hard training",
      "intense training",
      "physical job",
      "manual labor",
      "lots of daily movement",
      "very active",
      "מאוד פעיל",
      "פעילות גבוהה",
      "אימונים קשים",
      "אימון קשה",
      "עבודה פיזית",
      "עבודה פיסית",
      "הרבה תנועה",
      "המון תנועה",
      "כל יום מתאמן",
      "אימוני כוח",
      "אימוני כח",
      "רץ הרבה",
      "ריצה קבועה",
      "קרוספיט",
      "עבודה על הרגליים כל היום",
    ].some((signal) => text.includes(signal))
  ) {
    return "veryActive";
  }

  if (
    [
      "moderate",
      "regular workouts",
      "workout",
      "training",
      "exercise",
      "moving job",
      "active routine",
      "בינוני",
      "פעיל",
      "מתאמן",
      "אימונים",
      "אימון",
      "מתאמן קבוע",
      "אימון קבוע",
      "שגרה פעילה",
      "עבודה בתנועה",
      "הולך הרבה",
      "חדר כושר",
      "כוח",
      "ריצה",
      "שוחה",
      "רוכב",
      "מתאמן כמה פעמים בשבוע",
      "כמה פעמים בשבוע",
      "פעילות",
    ].some((signal) => text.includes(signal))
  ) {
    return "moderate";
  }

  if (
    [
      "light",
      "desk work",
      "walking",
      "some walking",
      "light activities",
      "office work",
      "little walking",
      "קל",
      "הליכה",
      "קצת הליכה",
      "יושב רוב היום",
      "עבודה משרדית",
      "משרד",
      "מעט הליכה",
      "פעילות קלה",
      "הליכות",
      "עומד הרבה",
      "עבודה בעמידה",
      "קם הרבה",
    ].some((signal) => text.includes(signal))
  ) {
    return "light";
  }

  if (
    [
      "sedentary",
      "יושבני",
      "יושב רוב היום",
      "כמעט לא זז",
      "מעט מאוד תנועה",
      "בלי פעילות",
      "לא פעיל",
    ].some((signal) => text.includes(signal))
  ) {
    return "sedentary";
  }

  return "sedentary";
}

export function calculateFormulaTdee(
  profile: Profile,
  latestWeight: number | null,
): FormulaTdeeResult {
  if (!profile.age || !profile.height || !latestWeight) {
    return {
      average: null,
      breakdown: {
        mifflinStJeor: null,
        harrisBenedict: null,
        cunningham: null,
      },
      activityMultiplier: null,
    };
  }

  const kg = latestWeight;
  const cm = profile.height;
  const resolvedActivityFactor =
    profile.activityFactor === "inferred"
      ? inferActivityFactorFromPrompt(profile.activityPrompt ?? "")
      : profile.activityFactor;
  const activity = activityMultiplier(resolvedActivityFactor);
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
  return { average, breakdown, activityMultiplier: activity };
}

export function calculateObservedTdee(
  entries: DailyEntry[],
): number | null {
  return calculateObservedTdeeRange(entries).value;
}

function calculateObservedTdeeRange(entries: DailyEntry[]): {
  value: number | null;
  fromDate: string | null;
  toDate: string | null;
  validEntryCount: number;
  daySpanDays: number | null;
  reason: "insufficient_entries" | "insufficient_span" | "out_of_range" | null;
} {
  const temporal = (globalThis as any).Temporal as any;
  if (!temporal?.PlainDate?.from || !temporal?.PlainDate?.compare) {
    throw new Error("Temporal API is required but not available in this browser/runtime.");
  }

  const today = temporal.PlainDate.from(localIsoDate());
  const valid = entries
    .map((entry) => ({
      ...entry,
      effectiveWeight: deducedWeightFromEntries(entries, entry.date),
    }))
    .filter((entry) => {
      if (temporal.PlainDate.compare(temporal.PlainDate.from(entry.date), today) >= 0) {
        return false;
      }
      return entry.effectiveWeight !== null && resolvedDailyCalories(entry) !== null;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (valid.length < MIN_OBSERVED_TDEE_ENTRIES) {
    return {
      value: null,
      fromDate: null,
      toDate: null,
      validEntryCount: valid.length,
      daySpanDays: null,
      reason: "insufficient_entries",
    };
  }

  const first = valid[0];
  const last = valid[valid.length - 1];
  if (first.effectiveWeight === null || last.effectiveWeight === null) {
    return {
      value: null,
      fromDate: null,
      toDate: null,
      validEntryCount: valid.length,
      daySpanDays: null,
      reason: "insufficient_entries",
    };
  }

  const firstDate = temporal.PlainDate.from(first.date);
  const lastDate = temporal.PlainDate.from(last.date);
  const daySpan = Math.max(1, firstDate.until(lastDate).days);
  if (daySpan < MIN_OBSERVED_TDEE_DAYS) {
    return {
      value: null,
      fromDate: first.date,
      toDate: last.date,
      validEntryCount: valid.length,
      daySpanDays: Math.round(daySpan),
      reason: "insufficient_span",
    };
  }

  const avgCalories =
    valid.reduce((sum, entry) => sum + (resolvedDailyCalories(entry) ?? 0), 0) / valid.length;
  const firstWeight = valid[0].effectiveWeight as number;
  const lastWeight = valid[valid.length - 1].effectiveWeight as number;
  const observedTdee = Math.round(
    avgCalories - ((lastWeight - firstWeight) * 7700) / daySpan,
  );

  if (observedTdee < OBSERVED_TDEE_MIN || observedTdee > OBSERVED_TDEE_MAX) {
    return {
      value: null,
      fromDate: first.date,
      toDate: last.date,
      validEntryCount: valid.length,
      daySpanDays: Math.round(daySpan),
      reason: "out_of_range",
    };
  }

  return {
    value: observedTdee,
    fromDate: first.date,
    toDate: last.date,
    validEntryCount: valid.length,
    daySpanDays: Math.round(daySpan),
    reason: null,
  };
}

function latestLoggedWeight(entries: DailyEntry[]): number | null {
  const withWeight = entries
    .filter((e) => e.weight !== null && e.weight !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  return withWeight.at(-1)?.weight ?? null;
}

function resolveFormulaWeight(entries: DailyEntry[], profile: Profile) {
  if (profile.estimatedWeight != null && profile.estimatedWeight > 0) {
    return {
      value: profile.estimatedWeight,
      source: "estimated" as const,
    };
  }

  const deducedWeight = deducedWeightFromEntries(entries);
  if (deducedWeight != null && deducedWeight > 0) {
    return {
      value: deducedWeight,
      source: "deduced" as const,
    };
  }

  const latestWeight = latestLoggedWeight(entries);
  if (latestWeight != null && latestWeight > 0) {
    return {
      value: latestWeight,
      source: "logged" as const,
    };
  }

  return {
    value: null,
    source: null,
  };
}

function selectedTdeeValue(
  selectedEquation: TdeeEquation,
  formulas: FormulaTdeeResult,
  observedTdee: number | null,
) {
  if (selectedEquation === "observedTdee") {
    return observedTdee;
  }

  return formulas.breakdown[selectedEquation] ?? null;
}

export function buildTdeeSnapshot(
  entries: DailyEntry[],
  profile: Profile,
): TdeeSnapshot {
  const formulaWeight = resolveFormulaWeight(entries, profile);
  const formulas = calculateFormulaTdee(profile, formulaWeight.value);
  const normalizedTargetWeight =
    profile.targetWeight !== null &&
    profile.targetWeight !== undefined &&
    Number.isFinite(profile.targetWeight) &&
    profile.targetWeight > 0
      ? profile.targetWeight
      : null;
  const targetFormulas = normalizedTargetWeight !== null
    ? calculateFormulaTdee(profile, normalizedTargetWeight)
    : {
        average: null,
        breakdown: {
          mifflinStJeor: null,
          harrisBenedict: null,
          cunningham: null,
        },
        activityMultiplier: null,
      };
  const targetTdee =
    normalizedTargetWeight !== null
      ? (profile.tdeeEquation === "observedTdee"
          ? targetFormulas.average
          : targetFormulas.breakdown[profile.tdeeEquation] ?? targetFormulas.average)
      : null;
  const observed = calculateObservedTdeeRange(entries);
  return {
    observedTdee: observed.value,
    observedFromDate: observed.fromDate,
    observedToDate: observed.toDate,
    observedValidEntryCount: observed.validEntryCount,
    observedDaySpanDays: observed.daySpanDays,
    observedReason: observed.reason,
    observedMinEntries: MIN_OBSERVED_TDEE_ENTRIES,
    observedMinDays: MIN_OBSERVED_TDEE_DAYS,
    formulaTdeeAverage: formulas.average,
    formulaBreakdown: formulas.breakdown,
    formulaWeight: formulaWeight.value,
    formulaWeightSource: formulaWeight.source,
    activityMultiplier: formulas.activityMultiplier,
    selectedEquation: profile.tdeeEquation,
    selectedValue: selectedTdeeValue(profile.tdeeEquation, formulas, observed.value),
    targetWeight: normalizedTargetWeight,
    targetTdee,
    lastComputedAt: new Date().toISOString(),
  };
}
