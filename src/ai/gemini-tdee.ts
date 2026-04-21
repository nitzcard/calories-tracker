import { readGeminiApiKey } from "./credentials";
import { renderPromptTemplate } from "./prompt-template";
import tdeePromptTemplate from "./prompts/tdee.md?raw";
import type { Profile, TdeeSnapshot } from "../types";

const GEMINI_TDEE_SCHEMA = {
  type: "OBJECT",
  required: ["schemaVersion", "tdeeKcal", "assumptions", "activityMultiplier"],
  properties: {
    schemaVersion: { type: "STRING", enum: ["1.0"] },
    tdeeKcal: { type: "NUMBER" },
    activityMultiplier: { type: "NUMBER", nullable: true },
    assumptions: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    recommendedCaloriesKcal: { type: "NUMBER", nullable: true },
  },
} as const;

const TDEE_MIN_REASONABLE = 800;
const TDEE_MAX_REASONABLE = 6000;

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

export async function estimateTdeeWithGemini(input: {
  providerId: string;
  profile: Profile;
  tdeeSnapshot: TdeeSnapshot;
  historyWindow: Array<{ date: string; weightKg: number; caloriesKcal: number }>;
}): Promise<{
  tdeeKcal: number;
  activityMultiplier: number | null;
  assumptions: string[];
  recommendedCaloriesKcal: number | null;
}> {
  const apiKey = readGeminiApiKey();
  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }

  const endpoint = buildEndpoint(input.providerId, apiKey);
  const prompt = buildTdeePrompt(input.profile, input.tdeeSnapshot, input.historyWindow);

  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.15,
      responseMimeType: "application/json",
      responseSchema: GEMINI_TDEE_SCHEMA,
    },
  });

  const response = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) {
    const errorMessage = await readGeminiErrorMessage(response);
    throw new Error(errorMessage ?? `Gemini request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as GeminiGenerateContentResponse;
  const text = extractText(payload);
  const parsed = parseTdeeResponse(JSON.parse(text));

  return {
    tdeeKcal: parsed.tdeeKcal,
    activityMultiplier: parsed.activityMultiplier,
    assumptions: parsed.assumptions,
    recommendedCaloriesKcal: parsed.recommendedCaloriesKcal ?? null,
  };
}

function buildEndpoint(providerId: string, apiKey: string): string {
  const baseUrl =
    import.meta.env.VITE_GEMINI_API_BASE_URL?.replace(/\/$/, "") ??
    "https://generativelanguage.googleapis.com/v1beta";
  return `${baseUrl}/models/${providerId}:generateContent?key=${apiKey}`;
}

function buildTdeePrompt(
  profile: Profile,
  tdee: TdeeSnapshot,
  historyWindow: Array<{ date: string; weightKg: number; caloriesKcal: number }>,
) {
  const currentWeight = profile.estimatedWeight ?? tdee.formulaWeight ?? null;
  const targetWeight = profile.targetWeight ?? null;
  const activity = (profile.activityPrompt ?? "").trim();
  const goalMode = profile.goalMode ?? "maingain";

  const historyLines = historyWindow.length
    ? historyWindow
        .map((row) => `- ${row.date}: ${row.weightKg} kg, ${Math.round(row.caloriesKcal)} kcal`)
        .join("\n")
    : "- (not enough days with both weight and calories)";

  return renderPromptTemplate(tdeePromptTemplate, {
    tdeeMin: TDEE_MIN_REASONABLE,
    tdeeMax: TDEE_MAX_REASONABLE,
    sex: profile.sex,
    age: profile.age ?? "unknown",
    heightCm: profile.height ?? "unknown",
    currentWeightKg: currentWeight ?? "unknown",
    targetWeightKg: targetWeight ?? "none",
    goalMode,
    activityBlock: activity ? `- ${activity}` : "- (not provided)",
    historyLines,
    formulaTdeeAverage: tdee.formulaTdeeAverage ?? "unknown",
    formulaBreakdown:
      Object.entries(tdee.formulaBreakdown ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join(", ") || "unknown",
    observedTdee: tdee.observedTdee ?? "unknown",
  });
}

function extractText(payload: GeminiGenerateContentResponse): string {
  const text = payload.candidates?.[0]?.content?.parts?.find(
    (part) => typeof part.text === "string",
  )?.text;

  if (!text) {
    throw new Error("Gemini returned no structured content.");
  }

  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseTdeeResponse(value: unknown): {
  tdeeKcal: number;
  activityMultiplier: number | null;
  assumptions: string[];
  recommendedCaloriesKcal?: number | null;
} {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    typeof value.tdeeKcal !== "number" ||
    !Number.isFinite(value.tdeeKcal) ||
    !isStringArray(value.assumptions) ||
    !("activityMultiplier" in value) ||
    !(
      value.activityMultiplier === null ||
      (typeof value.activityMultiplier === "number" && Number.isFinite(value.activityMultiplier))
    )
  ) {
    throw new Error("Gemini returned an invalid TDEE response.");
  }

  const tdeeKcal = Math.max(0, value.tdeeKcal);
  const clampedTdeeKcal = Math.min(TDEE_MAX_REASONABLE, Math.max(TDEE_MIN_REASONABLE, tdeeKcal));
  const recommendedCaloriesKcal =
    value.recommendedCaloriesKcal === null ||
    (typeof value.recommendedCaloriesKcal === "number" && Number.isFinite(value.recommendedCaloriesKcal))
      ? (value.recommendedCaloriesKcal as number | null | undefined)
      : undefined;

  return {
    tdeeKcal: clampedTdeeKcal,
    activityMultiplier: value.activityMultiplier as number | null,
    assumptions: value.assumptions,
    recommendedCaloriesKcal,
  };
}

async function fetchWithRetry(url: string, init: RequestInit) {
  const maxAttempts = 4;
  const retryable = new Set([429, 503, 504]);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, init);
    if (!retryable.has(response.status) || attempt === maxAttempts) {
      return response;
    }

    const base = 450 * Math.pow(2, attempt - 1);
    const jitter = Math.round(Math.random() * 180);
    await new Promise((resolve) => window.setTimeout(resolve, base + jitter));
  }

  return fetch(url, init);
}

async function readGeminiErrorMessage(response: Response) {
  try {
    if (response.status === 503 || response.status === 429) {
      const reason = response.status === 503 ? "under high demand" : "rate limited";
      return `Gemini is ${reason} (${response.status}).`;
    }

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
