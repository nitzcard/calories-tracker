import { getGeminiProvider } from "./registry";
import type { DailyEntry, Profile } from "../types";

export async function analyzeEntry(
  entry: DailyEntry,
  profile: Profile,
  provider: string,
  signal?: AbortSignal,
) {
  return getGeminiProvider(provider).analyzeDailyEntry(
    {
      date: entry.date,
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
    },
    signal,
  );
}
