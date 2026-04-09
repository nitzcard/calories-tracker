import { readApiKeyForProvider } from "./credentials";
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
}): Promise<{
  tdeeKcal: number;
  activityMultiplier: number | null;
  assumptions: string[];
  recommendedCaloriesKcal: number | null;
}> {
  const apiKey =
    readApiKeyForProvider(input.providerId) || import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }

  const endpoint = buildEndpoint(input.providerId, apiKey);
  const prompt = buildTdeePrompt(input.profile, input.tdeeSnapshot);

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

function buildTdeePrompt(profile: Profile, tdee: TdeeSnapshot) {
  const currentWeight = profile.estimatedWeight ?? tdee.formulaWeight ?? null;
  const targetWeight = profile.targetWeight ?? null;
  const activity = (profile.activityPrompt ?? "").trim();

  return [
    "Estimate my TDEE from the inputs below.",
    "",
    "Rules:",
    "- Output ONLY valid JSON that matches the given response schema.",
    "- Use metric units.",
    "- Make conservative assumptions if something is unknown; do not ask follow-up questions.",
    "- If you choose an activity multiplier, return it (or null if you avoid a multiplier).",
    "",
    "Inputs (metric):",
    `- Sex: ${profile.sex}`,
    `- Age: ${profile.age ?? "unknown"}`,
    `- Height: ${profile.height ?? "unknown"} cm`,
    `- Current weight: ${currentWeight ?? "unknown"} kg`,
    `- Target weight: ${targetWeight ?? "none"} kg`,
    "",
    "Activity / lifestyle:",
    activity ? `- ${activity}` : "- (not provided)",
    "",
    "What to compute:",
    "- tdeeKcal: one final estimated TDEE number in kcal/day.",
    "- recommendedCaloriesKcal: if a target weight exists, give a conservative daily calorie target; otherwise null.",
    "- assumptions: short bullet-style strings with your key assumptions (e.g. multiplier, rate of change).",
  ].join("\n");
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
  const recommendedCaloriesKcal =
    value.recommendedCaloriesKcal === null ||
    (typeof value.recommendedCaloriesKcal === "number" && Number.isFinite(value.recommendedCaloriesKcal))
      ? (value.recommendedCaloriesKcal as number | null | undefined)
      : undefined;

  return {
    tdeeKcal,
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

