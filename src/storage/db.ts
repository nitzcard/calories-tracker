import Dexie, { type Table } from "dexie";
import type { DailyEntry, FoodRule, Profile, SyncQueueItem } from "../types";

export class CalorieTrackerDb extends Dexie {
  profile!: Table<Profile, string>;
  dailyEntries!: Table<DailyEntry, string>;
  foodRules!: Table<FoodRule, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super("calorie-tracker");

    this.version(1).stores({
      profile: "id",
      dailyEntries: "date, updatedAt",
      foodRules: "id, active, createdAt",
      syncQueue: "++id, status, enqueuedAt, date",
    });
  }
}

export const db = new CalorieTrackerDb();
