import type { Page } from "@playwright/test";

export function isoDate(offsetDays: number) {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  now.setDate(now.getDate() + offsetDays);
  return now.toISOString().slice(0, 10);
}

export function todayIso() {
  return isoDate(0);
}

type SeedEntry = {
  date: string;
  foodLogText: string;
  weight: number | null;
  manualCalories: number | null;
  nutritionSnapshot?: any;
  aiStatus?: "idle" | "pending" | "processing" | "done" | "failed";
};

export async function seedProfileAndEntries(page: Page, entries: SeedEntry[]) {
  await page.evaluate(async ({ entries }) => {
    function openDb(name: string) {
      return new Promise<IDBDatabase>((resolve, reject) => {
        let upgradeTx: IDBTransaction | null = null;
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          upgradeTx = request.transaction;
        };
        request.onsuccess = () => {
          if (upgradeTx) {
            upgradeTx.oncomplete = () => resolve(request.result);
            upgradeTx.onerror = () => reject(upgradeTx.error || request.error);
            return;
          }
          resolve(request.result);
        };
      });
    }

    const db = await openDb("calorie-tracker");
    const tx = db.transaction(["profile", "dailyEntries"], "readwrite");

    tx.objectStore("profile").put({
      id: "default",
      sex: "male",
      email: "",
      age: 34,
      height: 180,
      estimatedWeight: 80,
      targetWeight: 78,
      customTdee: null,
      bodyFat: 18,
      goalMode: "maingain",
      tdeeEquation: "mifflinStJeor",
      activityPrompt: "Office work and walking daily",
      foodInstructions: "",
      aiModel: "gemini-2.5-flash",
      locale: "en",
      themeMode: "light",
      updatedAt: new Date().toISOString(),
    });

    const dailyEntries = tx.objectStore("dailyEntries");
    for (const entry of entries) {
      dailyEntries.put({
        date: entry.date,
        foodLogText: entry.foodLogText,
        weight: entry.weight,
        manualCalories: entry.manualCalories,
        customTdee: null,
        analysisStale: false,
        nutritionSnapshot: entry.nutritionSnapshot ?? null,
        aiStatus: entry.aiStatus ?? "idle",
        aiError: null,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  }, { entries });
}
