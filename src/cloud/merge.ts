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
  if (preferRemoteOverall) return [r];
  // Prefer the newest profile by updatedAt when available.
  if (l.updatedAt && r.updatedAt && l.updatedAt !== r.updatedAt) {
    return l.updatedAt > r.updatedAt ? [l] : [r];
  }
  // Otherwise, prefer the profile that has more filled-in fields (common when pulling to a fresh device).
  if (profileCompletenessScore(r) > profileCompletenessScore(l)) return [r];
  return [l];
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
    byDate.set(entry.date, pickNewerEntry(previous, entry));
  }
  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function pickNewerEntry(a: DailyEntry, b: DailyEntry) {
  // If one side preserves meaningfully more data, keep it even if timestamps differ.
  const aScore = scoreEntry(a);
  const bScore = scoreEntry(b);
  if (Math.abs(aScore - bScore) >= 2) {
    return aScore > bScore ? a : b;
  }

  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt ? a : b;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt > b.createdAt ? a : b;
  }

  // Deterministic tie-breakers.
  if (aScore !== bScore) return aScore > bScore ? a : b;
  return b;
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

function profileCompletenessScore(profile: Profile) {
  let score = 0;
  if (profile.age) score += 1;
  if (profile.height) score += 1;
  if (profile.estimatedWeight) score += 1;
  if (profile.bodyFat) score += 1;
  if (profile.activityPrompt.trim()) score += 1;
  if (profile.foodInstructions.trim()) score += 1;
  return score;
}
