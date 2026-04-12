import type { AiAnalysisInput, NormalizedNutritionResult } from "../types";

export interface AIProvider {
  readonly id: string;
  analyzeDailyEntry(input: AiAnalysisInput, signal?: AbortSignal): Promise<NormalizedNutritionResult>;
}
