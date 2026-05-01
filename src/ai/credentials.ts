export interface StoredAiKeys {
  gemini: string;
}

let inMemoryKeys: StoredAiKeys = emptyKeys();

export function getStoredAiKeys(): StoredAiKeys {
  return { ...inMemoryKeys };
}

export function saveStoredAiKeys(nextKeys: StoredAiKeys) {
  inMemoryKeys = {
    gemini: nextKeys.gemini ?? "",
  };
}

export function resetStoredAiKeys() {
  inMemoryKeys = emptyKeys();
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
