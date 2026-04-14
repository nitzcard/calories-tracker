export interface StoredAiKeys {
  gemini: string;
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
    };
  } catch {
    return emptyKeys();
  }
}

export function saveStoredAiKeys(nextKeys: StoredAiKeys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextKeys));
}

export function readGeminiApiKey() {
  const stored = getStoredAiKeys();
  const env = import.meta.env as Record<string, string | undefined>;
  return stored.gemini || env.VITE_GEMINI_API_KEY || "";
}

function emptyKeys(): StoredAiKeys {
  return {
    gemini: "",
  };
}
