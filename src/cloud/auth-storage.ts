export interface SavedCloudAuth {
  username: string;
  password: string;
}

export const CLOUD_AUTH_STORAGE_KEY = "calorie-tracker.cloud-auth";

function canUseStorage() {
  return typeof localStorage !== "undefined";
}

export function readSavedCloudAuth(): SavedCloudAuth | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = localStorage.getItem(CLOUD_AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SavedCloudAuth> | null;
    const username = parsed?.username?.trim().toLowerCase() ?? "";
    const password = parsed?.password?.trim() ?? "";
    if (!username || !password) {
      return null;
    }
    return { username, password };
  } catch {
    return null;
  }
}

export function saveCloudAuth(auth: SavedCloudAuth) {
  if (!canUseStorage()) {
    return;
  }

  const username = auth.username.trim().toLowerCase();
  const password = auth.password.trim();
  if (!username || !password) {
    return;
  }

  localStorage.setItem(
    CLOUD_AUTH_STORAGE_KEY,
    JSON.stringify({
      username,
      password,
    } satisfies SavedCloudAuth),
  );
}

export function clearSavedCloudAuth() {
  if (!canUseStorage()) {
    return;
  }

  localStorage.removeItem(CLOUD_AUTH_STORAGE_KEY);
}
