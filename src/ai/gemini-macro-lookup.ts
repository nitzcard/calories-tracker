import { readGeminiApiKey } from "./credentials";
import {
  DEFAULT_GEMINI_MODEL,
  LIGHTWEIGHT_GEMINI_LATEST_MODEL,
  LIGHTWEIGHT_GEMINI_MODEL,
} from "./gemini-config";
import { renderPromptTemplate } from "./prompt-template";
import macroLookupPromptTemplate from "./prompts/macro-lookup.md?raw";
import type { AppLocale } from "../types";

type MacroLookupResult = {
  schemaVersion: "1.0";
  sourceLabel: string | null;
  sourceUrl: string | null;
  per100: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fiber: number | null;
    solubleFiber: number | null;
    insolubleFiber: number | null;
  };
  confidence: number | null;
  notes: string[];
};

const LOOKUP_SCHEMA = {
  type: "OBJECT",
  required: ["schemaVersion", "sourceLabel", "sourceUrl", "per100", "confidence", "notes"],
  properties: {
    schemaVersion: { type: "STRING", enum: ["1.0"] },
    sourceLabel: { type: "STRING", nullable: true },
    sourceUrl: { type: "STRING", nullable: true },
    per100: {
      type: "OBJECT",
      required: ["calories", "protein", "carbs", "fat", "fiber", "solubleFiber", "insolubleFiber"],
      properties: {
        calories: { type: "NUMBER", nullable: true },
        protein: { type: "NUMBER", nullable: true },
        carbs: { type: "NUMBER", nullable: true },
        fat: { type: "NUMBER", nullable: true },
        fiber: { type: "NUMBER", nullable: true },
        solubleFiber: { type: "NUMBER", nullable: true },
        insolubleFiber: { type: "NUMBER", nullable: true },
      },
    },
    confidence: { type: "NUMBER", nullable: true },
    notes: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
} as const;

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

function buildEndpoint(providerId: string, apiKey: string) {
  const baseUrl =
    import.meta.env.VITE_GEMINI_API_BASE_URL?.replace(/\/$/, "") ??
    "https://generativelanguage.googleapis.com/v1beta";
  return `${baseUrl}/models/${providerId || DEFAULT_GEMINI_MODEL}:generateContent?key=${apiKey}`;
}

function pickMacroLookupModel(providerId: string) {
  const requested = providerId.trim();

  // Macro lookup is search-heavy and should stay on the most reliable lightweight model,
  // no matter which chat model user picked elsewhere.
  return LIGHTWEIGHT_GEMINI_LATEST_MODEL || LIGHTWEIGHT_GEMINI_MODEL || requested || DEFAULT_GEMINI_MODEL;
}

function candidateMacroLookupModels(providerId: string) {
  return Array.from(
    new Set([
      pickMacroLookupModel(providerId),
      LIGHTWEIGHT_GEMINI_MODEL,
      DEFAULT_GEMINI_MODEL,
      providerId.trim() || null,
    ].filter((value): value is string => Boolean(value))),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function parseResult(value: unknown): MacroLookupResult {
  if (!isRecord(value)) {
    throw new Error("Invalid AI macro result.");
  }

  const per100 = value.per100;
  if (
    value.schemaVersion !== "1.0" ||
    !isRecord(per100) ||
    !isNumberOrNull(per100.calories) ||
    !isNumberOrNull(per100.protein) ||
    !isNumberOrNull(per100.carbs) ||
    !isNumberOrNull(per100.fat) ||
    !isNumberOrNull(per100.fiber) ||
    !isNumberOrNull(per100.solubleFiber) ||
    !isNumberOrNull(per100.insolubleFiber) ||
    !(value.sourceLabel === null || typeof value.sourceLabel === "string") ||
    !(value.sourceUrl === null || typeof value.sourceUrl === "string") ||
    !(value.confidence === null || (typeof value.confidence === "number" && Number.isFinite(value.confidence))) ||
    !Array.isArray(value.notes) ||
    !value.notes.every((item) => typeof item === "string")
  ) {
    throw new Error("AI macro lookup response schema mismatch.");
  }

  return {
    schemaVersion: "1.0",
    sourceLabel: value.sourceLabel,
    sourceUrl: value.sourceUrl,
    per100: {
      calories: per100.calories,
      protein: per100.protein,
      carbs: per100.carbs,
      fat: per100.fat,
      fiber: per100.fiber,
      solubleFiber: per100.solubleFiber,
      insolubleFiber: per100.insolubleFiber,
    },
    confidence: value.confidence,
    notes: value.notes,
  };
}

function extractText(payload: GeminiGenerateContentResponse): string {
  const text = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!text) {
    throw new Error("Gemini returned no structured content.");
  }
  return text;
}

function buildPrompt(input: { foodName: string; locale: AppLocale; sourceUrl?: string | null }) {
  const localeLabel = input.locale === "he" ? "Hebrew" : "English";
  const explicitUrl = input.sourceUrl?.trim();
  const localeGuidance =
    input.locale === "he"
      ? "Prefer Hebrew or Israeli food databases, manufacturer pages, and nutrition references when they are relevant to the food."
      : "Prefer reliable local nutrition databases and manufacturer pages relevant to the food.";

  return renderPromptTemplate(macroLookupPromptTemplate, {
    localeGuidance,
    sourceGuidance: explicitUrl
      ? `Use this URL as primary evidence and verify it via web search if needed: ${explicitUrl}`
      : "Use web search to find a reliable source for this food.",
    foodName: input.foodName,
    locale: input.locale,
    localeLabel,
  });
}

async function readGeminiErrorMessage(response: Response) {
  try {
    const text = await response.text();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      return parsed.error?.message?.trim() || null;
    } catch {
      return text.slice(0, 240);
    }
  } catch {
    return null;
  }
}

function isMissingModelMessage(message: string | null) {
  if (!message) {
    return false;
  }

  return /not found|unknown model|unsupported model|does not exist|404/i.test(message);
}

export async function lookupFoodMacrosPer100WithGemini(input: {
  providerId: string;
  foodName: string;
  locale: AppLocale;
  sourceUrl?: string | null;
}) {
  const apiKey = readGeminiApiKey();
  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }

  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: LOOKUP_SCHEMA,
    },
  });

  let lastError: Error | null = null;

  for (const selectedModel of candidateMacroLookupModels(input.providerId)) {
    const endpoint = buildEndpoint(selectedModel, apiKey);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!response.ok) {
      const errorMessage = await readGeminiErrorMessage(response);
      lastError = new Error(
        `[${selectedModel}] ${errorMessage ?? `Gemini request failed with status ${response.status}.`}`,
      );

      if (response.status === 404 || isMissingModelMessage(errorMessage)) {
        continue;
      }

      throw lastError;
    }

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const text = extractText(payload);
    return parseResult(JSON.parse(text));
  }

  throw lastError ?? new Error("AI macro lookup failed.");
}
