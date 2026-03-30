import { buildGeminiNutritionPrompt } from "./gemini-prompt";
import { readApiKeyForProvider } from "./credentials";
import { normalizeAiNutritionResponse, parseAiNutritionResponse } from "./gemini-schema";
import type { AIProvider } from "./provider";
import type { AiAnalysisInput, NormalizedNutritionResult } from "../types";

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

export class OpenAiCompatibleProvider implements AIProvider {
  readonly id: string;

  constructor(
    id: string,
    private readonly modelId: string,
    private readonly modelName: string,
    private readonly envKeyName: string,
    private readonly envBaseUrlName: string,
    private readonly defaultBaseUrl: string,
  ) {
    this.id = id;
  }

  async analyzeDailyEntry(input: AiAnalysisInput): Promise<NormalizedNutritionResult> {
    const apiKey = readApiKeyForProvider(this.id) || this.readEnv(this.envKeyName);
    if (!apiKey) {
      throw new Error(`Missing ${this.envKeyName}. Set it in .env to enable ${this.modelName}.`);
    }

    const response = await fetch(this.buildEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelId,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a nutrition parsing assistant. Return valid JSON only, with no markdown or extra prose.",
          },
          {
            role: "user",
            content: buildGeminiNutritionPrompt(input),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`${this.modelName} request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as OpenAiChatCompletionResponse;
    const text = this.extractText(payload);
    const parsed = parseAiNutritionResponse(JSON.parse(stripCodeFence(text)));
    return normalizeAiNutritionResponse(parsed, this.modelName, input.profile.locale);
  }

  private buildEndpoint() {
    const baseUrl =
      this.readEnv(this.envBaseUrlName)?.replace(/\/$/, "") ?? this.defaultBaseUrl.replace(/\/$/, "");
    return `${baseUrl}/chat/completions`;
  }

  private readEnv(name: string): string | undefined {
    return (import.meta.env as Record<string, string | undefined>)[name];
  }

  private extractText(payload: OpenAiChatCompletionResponse): string {
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content;
    }

    if (Array.isArray(content)) {
      const combined = content
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("")
        .trim();
      if (combined) {
        return combined;
      }
    }

    throw new Error(`${this.modelName} returned no structured content.`);
  }
}

function stripCodeFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}
