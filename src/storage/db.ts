import Dexie, { type Table } from "dexie";
import type { DailyEntry, FoodRule, Profile, SyncQueueItem } from "../types";
import type { StoredAiKeys } from "../ai/credentials";

export type SettingRow = {
  id: string;
  aiKeys?: StoredAiKeys;
};

export class CalorieTrackerDb extends Dexie {
  profile!: Table<Profile, string>;
  dailyEntries!: Table<DailyEntry, string>;
  foodRules!: Table<FoodRule, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  settings!: Table<SettingRow, string>;

  constructor() {
    super("calorie-tracker");

    this.version(1).stores({
      profile: "id",
      dailyEntries: "date, updatedAt",
      foodRules: "id, active, createdAt",
      syncQueue: "++id, status, enqueuedAt, date",
    });

    this.version(2).stores({
      profile: "id",
      dailyEntries: "date, updatedAt",
      foodRules: "id, active, createdAt",
      syncQueue: "++id, status, enqueuedAt, date",
      settings: "id",
    });
  }
}

export const db = new CalorieTrackerDb();
