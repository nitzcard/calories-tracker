import type { ExportedAppData } from "../storage/repository";
import type { DailyEntry, FoodRule, Profile, SyncQueueItem } from "../types";

export function mergeExportedAppData(local: ExportedAppData, remote: ExportedAppData | null) {
  if (!remote) {
    return local;
  }

  // `exportedAt` reflects when a blob was exported, not when the underlying data changed.
  // When syncing a fresh device, local can look "newer" while being empty. Prefer the
  // side that contains more useful data in that case.
  const preferRemoteOverall = isBaselineBlob(local) && !isBaselineBlob(remote);

  return {
    schemaVersion: "1" as const,
    exportedAt: new Date().toISOString(),
    profile: mergeProfile(local.profile, remote.profile, preferRemoteOverall),
    dailyEntries: mergeDailyEntries(local.dailyEntries, remote.dailyEntries),
    foodRules: mergeFoodRules(local.foodRules, remote.foodRules, preferRemoteOverall),
    // Queue is local-only operational state; don't risk pulling old queue items over.
    syncQueue: local.syncQueue as SyncQueueItem[],
    encryptedSecrets: mergeEncryptedSecrets(local, remote),
  };
}

function mergeProfile(local: Profile[], remote: Profile[], preferRemoteOverall: boolean): Profile[] {
  const l = local[0];
  const r = remote[0];
  if (!l && !r) return [];
  if (!l) return [r];
  if (!r) return [l];
  if (preferRemoteOverall) {
    return [mergeProfilePreservingData(l, r, { prefer: "remote" })];
  }

  const prefer: "local" | "remote" = maxIso(l.updatedAt, r.updatedAt) === (l.updatedAt ?? "") ? "local" : "remote";
  return [mergeProfilePreservingData(l, r, { prefer })];
}

function mergeProfilePreservingData(
  local: Profile,
  remote: Profile,
  options: { prefer: "local" | "remote" },
): Profile {
  // Defaults/baselines should be "weak", especially on a fresh device right after login.
  const DEFAULT = {
    sex: "male" as const,
    tdeeEquation: "mifflinStJeor" as const,
    aiModel: "gemini-2.5-flash",
    locale: "en" as const,
    themeMode: "system" as const,
  };

  const preferred = options.prefer === "remote" ? remote : local;
  const other = preferred === remote ? local : remote;

  const pickNonEmpty = (a: string, b: string) => {
    const aTrim = a.trim();
    const bTrim = b.trim();
    if (!aTrim && !bTrim) return "";
    if (!aTrim) return b;
    if (!bTrim) return a;
    return a; // keep first argument by default
  };

  const pickNullableNumber = (a: number | null, b: number | null) => (a ?? b);

  const pickEnumWithWeakDefault = <T extends string>(a: T, b: T, weak: T): T => {
    if (a !== weak && b === weak) return a;
    if (b !== weak && a === weak) return b;
    return a;
  };

  const pickStringWithWeakDefault = (a: string, b: string, weak: string) => {
    const aTrim = a.trim();
    const bTrim = b.trim();
    if (aTrim && !bTrim) return a;
    if (bTrim && !aTrim) return b;
    if (!aTrim && !bTrim) return "";
    if (aTrim !== weak && bTrim === weak) return a;
    if (bTrim !== weak && aTrim === weak) return b;
    return a;
  };

  // For each field: prefer non-default/non-empty values first; if both are "strong", prefer the chosen side.
  const mergedSex = pickEnumWithWeakDefault(preferred.sex, other.sex, DEFAULT.sex);
  const mergedEquation = pickEnumWithWeakDefault(
    preferred.tdeeEquation,
    other.tdeeEquation,
    DEFAULT.tdeeEquation,
  );
  const mergedLocale = pickEnumWithWeakDefault(preferred.locale, other.locale, DEFAULT.locale);
  const mergedTheme = pickEnumWithWeakDefault(preferred.themeMode, other.themeMode, DEFAULT.themeMode);
  const mergedModel = pickStringWithWeakDefault(preferred.aiModel, other.aiModel, DEFAULT.aiModel);

  return {
    ...other,
    ...preferred,
    id: "default",
    sex: mergedSex,
    tdeeEquation: mergedEquation,
    locale: mergedLocale,
    themeMode: mergedTheme,
    aiModel: mergedModel,
    age: pickNullableNumber(preferred.age, other.age),
    height: pickNullableNumber(preferred.height, other.height),
    estimatedWeight: pickNullableNumber(preferred.estimatedWeight, other.estimatedWeight),
    bodyFat: pickNullableNumber(preferred.bodyFat, other.bodyFat),
    activityPrompt: pickNonEmpty(preferred.activityPrompt ?? "", other.activityPrompt ?? ""),
    foodInstructions: pickNonEmpty(preferred.foodInstructions ?? "", other.foodInstructions ?? ""),
    updatedAt: maxIso(local.updatedAt, remote.updatedAt) || preferred.updatedAt || other.updatedAt,
  };
}

function mergeDailyEntries(local: DailyEntry[], remote: DailyEntry[]): DailyEntry[] {
  const byDate = new Map<string, DailyEntry>();
  for (const entry of remote) {
    byDate.set(entry.date, entry);
  }
  for (const entry of local) {
    const previous = byDate.get(entry.date);
    if (!previous) {
      byDate.set(entry.date, entry);
      continue;
    }
    byDate.set(entry.date, mergeEntryPreservingData(previous, entry));
  }
  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function scoreEntry(entry: DailyEntry) {
  // Prefer entries that preserve more useful data.
  let score = 0;
  if (entry.foodLogText.trim()) score += 2;
  if (entry.nutritionSnapshot) score += 3;
  if (entry.manualCalories != null) score += 1;
  if (entry.weight != null) score += 1;
  return score;
}

function mergeEntryPreservingData(a: DailyEntry, b: DailyEntry): DailyEntry {
  const newer = a.updatedAt >= b.updatedAt ? a : b;
  const older = newer === a ? b : a;

  const mergedFoodLogText = pickTextPreferLonger(a.foodLogText, b.foodLogText, newer);
  const mergedWeight =
    newer.weight != null ? newer.weight : older.weight != null ? older.weight : null;
  const mergedManualCalories =
    newer.manualCalories != null
      ? newer.manualCalories
      : older.manualCalories != null
        ? older.manualCalories
        : null;

  const nutritionSide = pickNutritionSide(a, b, newer);
  const mergedNutritionSnapshot = nutritionSide.nutritionSnapshot;
  const foodLogChangedSinceNutrition =
    Boolean(mergedNutritionSnapshot) &&
    mergedFoodLogText.trim() !== nutritionSide.foodLogText.trim();

  return {
    ...newer,
    foodLogText: mergedFoodLogText,
    weight: mergedWeight,
    manualCalories: mergedManualCalories,
    nutritionSnapshot: mergedNutritionSnapshot,
    aiStatus: nutritionSide.aiStatus,
    aiError: nutritionSide.aiError,
    analysisStale: Boolean(nutritionSide.analysisStale) || foodLogChangedSinceNutrition,
    updatedAt: maxIso(a.updatedAt, b.updatedAt),
    createdAt: minIso(
      a.createdAt || a.updatedAt,
      b.createdAt || b.updatedAt,
    ),
  };
}

function pickTextPreferLonger(a: string, b: string, newer: DailyEntry): string {
  const aTrim = a.trim();
  const bTrim = b.trim();
  if (!aTrim && !bTrim) return "";
  if (!aTrim) return b;
  if (!bTrim) return a;
  if (aTrim.length !== bTrim.length) return aTrim.length > bTrim.length ? a : b;
  // Same length: prefer the side that is newer overall for determinism.
  return newer.foodLogText === a ? a : b;
}

function pickNutritionSide(a: DailyEntry, b: DailyEntry, newer: DailyEntry): DailyEntry {
  if (a.nutritionSnapshot && !b.nutritionSnapshot) return a;
  if (b.nutritionSnapshot && !a.nutritionSnapshot) return b;
  if (a.nutritionSnapshot && b.nutritionSnapshot) {
    const aUpdated = a.nutritionSnapshot.updatedAt || a.updatedAt;
    const bUpdated = b.nutritionSnapshot.updatedAt || b.updatedAt;
    return aUpdated >= bUpdated ? a : b;
  }
  return newer;
}

function maxIso(a?: string, b?: string): string {
  const av = a ?? "";
  const bv = b ?? "";
  return av >= bv ? av : bv;
}

function minIso(a?: string, b?: string): string {
  const av = a ?? "";
  const bv = b ?? "";
  return av <= bv ? av : bv;
}

function mergeFoodRules(local: FoodRule[], remote: FoodRule[], preferRemoteOverall: boolean): FoodRule[] {
  if (!local.length && remote.length) return remote.slice();
  if (!remote.length && local.length) return local.slice();

  const byId = new Map<string, FoodRule>();
  for (const rule of remote) byId.set(rule.id, rule);
  for (const rule of local) {
    const previous = byId.get(rule.id);
    if (!previous) {
      byId.set(rule.id, rule);
    } else {
      // Prefer newest by updatedAt when present; otherwise fall back to the overall preference.
      const a = previous;
      const b = rule;
      if (a.updatedAt && b.updatedAt && a.updatedAt !== b.updatedAt) {
        byId.set(rule.id, a.updatedAt > b.updatedAt ? a : b);
      } else {
        byId.set(rule.id, preferRemoteOverall ? a : b);
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function mergeEncryptedSecrets(local: ExportedAppData, remote: ExportedAppData) {
  if (local.encryptedSecrets?.aiKeys) return local.encryptedSecrets;
  if (remote.encryptedSecrets?.aiKeys) return remote.encryptedSecrets;
  return undefined;
}

function isBaselineBlob(blob: ExportedAppData) {
  const p = blob.profile?.[0];
  const profileBaseline =
    !p ||
    (!p.age &&
      !p.height &&
      !p.estimatedWeight &&
      !p.bodyFat &&
      !p.activityPrompt.trim() &&
      !p.foodInstructions.trim());

  const hasMeaningfulEntry = blob.dailyEntries.some((entry) => scoreEntry(entry) >= 2);
  const hasRules = blob.foodRules.length > 0;

  return profileBaseline && !hasMeaningfulEntry && !hasRules;
}
