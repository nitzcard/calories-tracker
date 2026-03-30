import { buildGeminiNutritionPrompt } from "./gemini-prompt";
import { readApiKeyForProvider } from "./credentials";
import {
  GEMINI_RESPONSE_SCHEMA,
  normalizeAiNutritionResponse,
  parseAiNutritionResponse,
} from "./gemini-schema";
import type { AIProvider } from "./provider";
import type { AiAnalysisInput, NormalizedNutritionResult } from "../types";

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

export class GeminiProvider implements AIProvider {
  readonly id: string;

  constructor(
    id: string,
    private readonly modelName: string,
  ) {
    this.id = id;
  }

  async analyzeDailyEntry(input: AiAnalysisInput): Promise<NormalizedNutritionResult> {
    const apiKey = readApiKeyForProvider(this.id) || import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing Gemini API key. Set VITE_GEMINI_API_KEY to enable AI nutrition parsing.",
      );
    }

    const response = await fetch(this.buildEndpoint(apiKey), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildGeminiNutritionPrompt(input) }],
          },
        ],
        generationConfig: {
          temperature: 0.15,
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const text = this.extractText(payload);
    const parsed = parseAiNutritionResponse(JSON.parse(text));
    return normalizeAiNutritionResponse(parsed, this.modelName, input.profile.locale);
  }

  private buildEndpoint(apiKey: string): string {
    const baseUrl =
      import.meta.env.VITE_GEMINI_API_BASE_URL?.replace(/\/$/, "") ??
      "https://generativelanguage.googleapis.com/v1beta";
    return `${baseUrl}/models/${this.id}:generateContent?key=${apiKey}`;
  }

  private extractText(payload: GeminiGenerateContentResponse): string {
    const text = payload.candidates?.[0]?.content?.parts?.find(
      (part) => typeof part.text === "string",
    )?.text;

    if (!text) {
      throw new Error("Gemini returned no structured content.");
    }

    return text;
  }
}
