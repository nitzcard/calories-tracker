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

    const endpoint = this.buildEndpoint(apiKey);
    const body = JSON.stringify({
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
    });

    const response = await fetchWithRetry(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });

    if (!response.ok) {
      const errorMessage = await readGeminiErrorMessage(response);
      throw new Error(errorMessage ?? `Gemini request failed with status ${response.status}.`);
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

async function fetchWithRetry(url: string, init: RequestInit) {
  const maxAttempts = 4;
  const retryable = new Set([429, 503, 504]);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, init);
    if (!retryable.has(response.status) || attempt === maxAttempts) {
      return response;
    }

    // Exponential backoff with jitter. 503 (high demand) is usually temporary.
    const base = 450 * Math.pow(2, attempt - 1);
    const jitter = Math.round(Math.random() * 180);
    await new Promise((resolve) => window.setTimeout(resolve, base + jitter));
  }

  // Unreachable due to return in loop, but TS likes a return.
  return fetch(url, init);
}

async function readGeminiErrorMessage(response: Response) {
  try {
    const text = await response.text();
    if (!text) return null;

    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      const msg = parsed.error?.message?.trim();
      if (msg) {
        return `Gemini error (${response.status}): ${msg}`;
      }
    } catch {
      // ignore json parse error
    }

    const clipped = text.length > 240 ? `${text.slice(0, 240)}…` : text;
    return `Gemini error (${response.status}): ${clipped}`;
  } catch {
    return null;
  }
}
