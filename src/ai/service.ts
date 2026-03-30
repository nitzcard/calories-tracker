import { getProvider } from "./registry";
import {
  enqueueSync,
  getEntry,
  getPendingQueue,
  getProfile,
  listEntries,
  saveNutritionResult,
  updateQueueStatus,
} from "../storage/repository";
import type { NormalizedNutritionResult } from "../types";

export async function queueAnalysis(date: string, provider = "gemini-2.5-flash"): Promise<void> {
  const existing = await getEntry(date);

  await enqueueSync({
    date,
    status: "pending",
    attempts: 0,
    enqueuedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    provider,
  });
  await saveNutritionResult(date, {
    nutritionSnapshot: existing?.nutritionSnapshot ?? null,
    aiStatus: "pending",
    aiError: null,
  });
}

export async function runPendingAnalysis(): Promise<void> {
  const queue = await getPendingQueue();
  const profile = await getProfile();
  if (!profile) {
    return;
  }

  for (const item of queue) {
    const entry = await getEntry(item.date);
    if (!entry || !entry.foodLogText.trim() || item.id === undefined) {
      continue;
    }

    await updateQueueStatus(item.id, "processing", item.attempts + 1);
    await saveNutritionResult(item.date, {
      nutritionSnapshot: entry.nutritionSnapshot,
      aiStatus: "processing",
      aiError: null,
    });

    try {
      const result: NormalizedNutritionResult = await getProvider(item.provider).analyzeDailyEntry({
        date: item.date,
        foodLogText: entry.foodLogText,
        profile,
        foodRules: profile.foodInstructions.trim()
          ? [
              {
                id: "default-food-instructions",
                label: "Saved instructions",
                instructionText: profile.foodInstructions,
                active: true,
                createdAt: new Date().toISOString(),
              },
            ]
          : [],
      });

      await saveNutritionResult(item.date, {
        nutritionSnapshot: result,
        aiStatus: "done",
        aiError: null,
      });
      await updateQueueStatus(item.id, "done", item.attempts + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI error";
      await saveNutritionResult(item.date, {
        nutritionSnapshot: entry.nutritionSnapshot,
        aiStatus: "failed",
        aiError: message,
      });
      await updateQueueStatus(item.id, "failed", item.attempts + 1);
    }
  }
}

export async function getDashboardEntries() {
  return listEntries();
}
