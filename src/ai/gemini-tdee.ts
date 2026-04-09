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
  const apiKey =
    readApiKeyForProvider(input.providerId) || import.meta.env.VITE_GEMINI_API_KEY;
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

  return [
    "Estimate my TDEE from the inputs below.",
    "",
    "Rules:",
    "- Output ONLY valid JSON that matches the given response schema.",
    "- Use metric units.",
    "- Make conservative assumptions if something is unknown; do not ask follow-up questions.",
    "- Prefer a data-driven estimate from my history window when possible (weight + calories).",
    "- If the history window is insufficient, fall back to a formula-based estimate (use the app estimates).",
    "- When using history, estimate the TDEE that best explains the weight trend given logged calories (assume ~7700 kcal per 1 kg of body mass change as a rough energy-equivalent).",
    `- Keep tdeeKcal within ${TDEE_MIN_REASONABLE}-${TDEE_MAX_REASONABLE} kcal/day.`,
    "- If you choose an activity multiplier, return it (or null if you avoid a multiplier).",
    "",
    "Inputs (metric):",
    `- Sex: ${profile.sex}`,
    `- Age: ${profile.age ?? "unknown"}`,
    `- Height: ${profile.height ?? "unknown"} cm`,
    `- Current weight: ${currentWeight ?? "unknown"} kg`,
    `- Target weight: ${targetWeight ?? "none"} kg`,
    `- Goal mode: ${goalMode}`,
    "",
    "Activity / lifestyle:",
    activity ? `- ${activity}` : "- (not provided)",
    "",
    "History window (most recent days with BOTH weight and calories):",
    historyLines,
    "",
    "App estimates (for reference):",
    `- Formula TDEE average: ${tdee.formulaTdeeAverage ?? "unknown"} kcal/day`,
    `- Formula breakdown: ${Object.entries(tdee.formulaBreakdown ?? {}).map(([k, v]) => `${k}=${v}`).join(", ") || "unknown"}`,
    `- Observed TDEE: ${tdee.observedTdee ?? "unknown"} kcal/day`,
    "",
    "What to compute:",
    "- tdeeKcal: one final estimated TDEE number in kcal/day (a single number).",
    "- recommendedCaloriesKcal: give a conservative daily calorie target based on goal mode (even if target weight is not set).",
    "- assumptions: short bullet-style strings with your key assumptions.",
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
