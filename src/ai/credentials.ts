export interface StoredAiKeys {
  gemini: string;
  deepseek: string;
  kimi: string;
  groq: string;
}

const STORAGE_KEY = "calorie-tracker.ai-keys";

export function getStoredAiKeys(): StoredAiKeys {
  if (typeof localStorage === "undefined") {
    return emptyKeys();
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return emptyKeys();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAiKeys>;
    return {
      gemini: parsed.gemini ?? "",
      deepseek: parsed.deepseek ?? "",
      kimi: parsed.kimi ?? "",
      groq: parsed.groq ?? "",
    };
  } catch {
    return emptyKeys();
  }
}

export function saveStoredAiKeys(nextKeys: StoredAiKeys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextKeys));
}

export function readApiKeyForProvider(providerId: string) {
  const stored = getStoredAiKeys();
  const env = import.meta.env as Record<string, string | undefined>;

  if (providerId.startsWith("gemini-")) {
    return stored.gemini || env.VITE_GEMINI_API_KEY || "";
  }

  if (providerId.startsWith("deepseek-")) {
    return stored.deepseek || env.VITE_DEEPSEEK_API_KEY || "";
  }

  if (providerId.startsWith("kimi-")) {
    return stored.kimi || env.VITE_KIMI_API_KEY || "";
  }

  if (providerId.startsWith("groq-")) {
    return stored.groq || env.VITE_GROQ_API_KEY || "";
  }

  return "";
}

function emptyKeys(): StoredAiKeys {
  return {
    gemini: "",
    deepseek: "",
    kimi: "",
    groq: "",
  };
}
