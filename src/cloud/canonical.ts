import type { CloudAppState } from "./app-state";

type CanonicalCloudAppState = Omit<CloudAppState, "updatedAt">;

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

export function toCanonicalCloudPayload(payload: CloudAppState): CanonicalCloudAppState {
  return {
    schemaVersion: payload.schemaVersion,
    profile: payload.profile,
    dailyEntries: payload.dailyEntries,
    foodRules: payload.foodRules,
    aiKeys: payload.aiKeys,
  };
}

export function canonicalCloudFingerprint(payload: CloudAppState): string {
  return JSON.stringify(stableSortObject(toCanonicalCloudPayload(payload)));
}
