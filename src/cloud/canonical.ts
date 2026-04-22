import type { ExportedAppData } from "../storage/repository";

type CanonicalExportedAppData = Omit<ExportedAppData, "exportedAt" | "syncQueue">;

function stableSortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortObject);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableSortObject((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

export function toCanonicalCloudPayload(payload: ExportedAppData): CanonicalExportedAppData {
  return {
    schemaVersion: payload.schemaVersion,
    profile: payload.profile,
    dailyEntries: payload.dailyEntries,
    deletedDailyEntryTombstones: payload.deletedDailyEntryTombstones,
    foodRules: payload.foodRules,
    encryptedSecrets: payload.encryptedSecrets,
  };
}

export function canonicalCloudFingerprint(payload: ExportedAppData): string {
  return JSON.stringify(stableSortObject(toCanonicalCloudPayload(payload)));
}

