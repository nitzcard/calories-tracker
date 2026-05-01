import { normalizeCloudAppState, type CloudAppState } from "./app-state";
import type { AppLocale } from "../types";

export const BACKUP_FILE_KIND = "calorie-tracker-backup-v1";

export interface BackupFileV1 {
  kind: typeof BACKUP_FILE_KIND;
  exportedAt: string;
  appState: CloudAppState;
}

function toRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function createBackupDocument(state: CloudAppState): BackupFileV1 {
  return {
    kind: BACKUP_FILE_KIND,
    exportedAt: new Date().toISOString(),
    appState: JSON.parse(JSON.stringify(state)) as CloudAppState,
  };
}

export function parseBackupDocument(raw: unknown, fallbackLocale: AppLocale = "en"): CloudAppState {
  const record = toRecord(raw);
  if (!record) {
    throw new Error("Backup file is not valid JSON.");
  }

  if (record.kind === BACKUP_FILE_KIND) {
    if ("appState" in record) {
      return normalizeCloudAppState(record.appState, fallbackLocale);
    }
    if ("state" in record) {
      return normalizeCloudAppState(record.state, fallbackLocale);
    }
    throw new Error("Backup file is missing app state.");
  }

  if ("schemaVersion" in record || "profile" in record || "dailyEntries" in record || "entries" in record || "payload" in record) {
    return normalizeCloudAppState(raw, fallbackLocale);
  }

  throw new Error("Backup file format is not supported.");
}
