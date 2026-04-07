import type { ExportedAppData } from "../storage/repository";
import type { DailyEntry, FoodRule, Profile, SyncQueueItem } from "../types";

export function mergeExportedAppData(local: ExportedAppData, remote: ExportedAppData | null) {
  if (!remote) {
    return local;
  }

  const remoteNewer = remote.exportedAt > local.exportedAt;

  return {
    schemaVersion: "1" as const,
    exportedAt: new Date().toISOString(),
    profile: mergeProfile(local.profile, remote.profile, remoteNewer),
    dailyEntries: mergeDailyEntries(local.dailyEntries, remote.dailyEntries),
    foodRules: mergeFoodRules(local.foodRules, remote.foodRules, remoteNewer),
    // Queue is local-only operational state; don't risk pulling old queue items over.
    syncQueue: local.syncQueue as SyncQueueItem[],
    encryptedSecrets: mergeEncryptedSecrets(local, remote),
  };
}

function mergeProfile(local: Profile[], remote: Profile[], remoteNewer: boolean): Profile[] {
  const l = local[0];
  const r = remote[0];
  if (!l && !r) return [];
  if (!l) return [r];
  if (!r) return [l];
  return [remoteNewer ? r : l];
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
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt ? a : b;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt > b.createdAt ? a : b;
  }

  // Deterministic tie-breakers.
  const aScore = scoreEntry(a);
  const bScore = scoreEntry(b);
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

function mergeFoodRules(local: FoodRule[], remote: FoodRule[], remoteNewer: boolean): FoodRule[] {
  const byId = new Map<string, FoodRule>();
  for (const rule of remote) byId.set(rule.id, rule);
  for (const rule of local) {
    const previous = byId.get(rule.id);
    if (!previous) {
      byId.set(rule.id, rule);
    } else {
      byId.set(rule.id, remoteNewer ? previous : rule);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function mergeEncryptedSecrets(local: ExportedAppData, remote: ExportedAppData) {
  if (local.encryptedSecrets?.aiKeys) return local.encryptedSecrets;
  if (remote.encryptedSecrets?.aiKeys) return remote.encryptedSecrets;
  return undefined;
}

