import { test, type Page } from "@playwright/test";
import { CLOUD_AUTH_STORAGE_KEY } from "../../../../src/cloud/auth-storage";
import { decryptJsonWithPassphrase, encryptJsonWithPassphrase, type EncryptedSecretBoxV1 } from "../../../../src/cloud/crypto";
import { createDefaultProfile, normalizeCloudAppState, type CloudAppState } from "../../../../src/cloud/app-state";
import { getSupabaseConfig, type SupabaseConfig } from "../supabase";
import { cleanupTestSupabaseRows } from "../supabase-cleanup";

type SeedEntry = {
  date: string;
  foodLogText: string;
  weight: number | null;
  manualCalories: number | null;
  nutritionSnapshot?: any;
  aiStatus?: "idle" | "pending" | "processing" | "done" | "failed";
};

type FoodSeedOptions = {
  id: string;
  mealKey?: string;
  mealLabel?: string;
  name: string;
  canonicalName?: string;
  amountText?: string;
  grams: number | null;
  calories: number | null;
  caloriesPer100g?: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  solubleFiber?: number | null;
  insolubleFiber?: number | null;
};

type SavedCloudAuth = {
  username: string;
  password: string;
};

export type SeededCloudAuth = SavedCloudAuth;
export const TEST_USERNAME_PREFIX = "test_";

type UserBlobRow = {
  data: unknown;
  updated_at: string;
};

type CloudEncryptedEnvelopeV1 = {
  kind: "encrypted-v1";
  box: EncryptedSecretBoxV1;
  email?: string;
};

let cachedSupabaseConfig: SupabaseConfig | null = null;

test.afterEach(async () => {
  if (!getSupabaseConfig()) {
    return;
  }

  await cleanupTestSupabaseRows();
});

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTestUsername(value: string) {
  const normalized = normalizeUsername(value);
  if (!normalized) {
    return normalized;
  }
  return normalized.startsWith(TEST_USERNAME_PREFIX) ? normalized : `${TEST_USERNAME_PREFIX}${normalized}`;
}

function cloudSecret(username: string, password: string) {
  return `${normalizeUsername(username)}::${password.trim()}`;
}

function loadSupabaseConfig(): SupabaseConfig {
  if (cachedSupabaseConfig) {
    return cachedSupabaseConfig;
  }

  const config = getSupabaseConfig();
  const url = config?.url;
  const anonKey = config?.anonKey;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase config for Playwright. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  cachedSupabaseConfig = { url, anonKey };
  return cachedSupabaseConfig;
}

async function supabaseRestFetch<T>(query: string, init?: RequestInit): Promise<T> {
  const { url, anonKey } = loadSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${query}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

function makeCloudEnvelope(payload: CloudAppState, email?: string) {
  return async (username: string, password: string): Promise<CloudEncryptedEnvelopeV1> => {
    const profile = {
      ...payload.profile,
      email: "",
    };
    const box = await encryptJsonWithPassphrase(
      {
        payload: {
          ...payload,
          profile,
        },
      },
      cloudSecret(username, password),
    );
    return {
      kind: "encrypted-v1",
      box,
      email: email?.trim() || undefined,
    };
  };
}

export async function readRemoteUserBlob(username: string) {
  const normalizedUsername = normalizeTestUsername(username);
  const rows = await supabaseRestFetch<UserBlobRow[]>(
    `user_blobs?select=data,updated_at&username=eq.${encodeURIComponent(normalizedUsername)}`,
    { method: "GET" },
  );
  return rows[0] ?? null;
}

export async function readRemoteUserState(username: string, password: string) {
  const row = await readRemoteUserBlob(username);
  if (!row) {
    return null;
  }

  const raw = row.data;
  if (raw && typeof raw === "object" && (raw as { kind?: string }).kind === "encrypted-v1") {
    const envelope = raw as CloudEncryptedEnvelopeV1;
    const decrypted = await decryptJsonWithPassphrase<{ payload: unknown }>(
      envelope.box,
      cloudSecret(username, password),
    );
    return normalizeCloudAppState(
      {
        ...(decrypted.payload as Record<string, unknown>),
        profile: {
          ...((decrypted.payload as Record<string, any>).profile ?? {}),
          email: envelope.email ?? "",
        },
      },
      "en",
    );
  }

  return normalizeCloudAppState(raw, "en");
}

async function upsertRemoteUserState(username: string, password: string, state: CloudAppState) {
  const normalizedUsername = normalizeTestUsername(username);
  const envelope = await makeCloudEnvelope(state, state.profile.email)(normalizedUsername, password);
  await supabaseRestFetch(
    "user_blobs",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify([
        {
          username: normalizedUsername,
          data: envelope,
          updated_at: new Date().toISOString(),
        },
      ]),
    },
  );
}

export async function writeRemoteUserState(username: string, password: string, state: CloudAppState) {
  await upsertRemoteUserState(username, password, state);
}

export async function resetRemoteUser(username: string) {
  const normalizedUsername = normalizeTestUsername(username);
  await supabaseRestFetch(
    `user_blobs?username=eq.${encodeURIComponent(normalizedUsername)}`,
    {
      method: "DELETE",
    },
  );
}

async function setSavedCloudAuth(page: Page, auth: SavedCloudAuth | null) {
  const currentUrl = page.url();
  const shouldRestorePage = currentUrl && currentUrl !== "about:blank";
  await page.goto("/test-empty.html", { waitUntil: "networkidle" });
  await page.evaluate(
    ({ storageKey, nextAuth }) => {
      if (nextAuth) {
        localStorage.setItem(storageKey, JSON.stringify(nextAuth));
      } else {
        localStorage.removeItem(storageKey);
      }
    },
    {
      storageKey: CLOUD_AUTH_STORAGE_KEY,
      nextAuth: auth,
    },
  );
  if (shouldRestorePage) {
    await page.goto(currentUrl, { waitUntil: "networkidle" });
    if (auth) {
      const loginCard = page.locator(".login-card");
      try {
        await loginCard.waitFor({ state: "visible", timeout: 3_000 });
        await loginCard.locator('input[autocomplete="username"]').fill(auth.username);
        await loginCard.locator('input[autocomplete="current-password"]').fill(auth.password);
        await loginCard.getByRole("button", { name: "Login" }).click();
        await page.waitForSelector(".login-card", { state: "detached", timeout: 20_000 });
      } catch {
        // Leave page as-is when login UI is not available.
      }
    }
  }
}

function buildSeedProfileState(entries: SeedEntry[]): CloudAppState {
  return {
    schemaVersion: "2",
    updatedAt: new Date().toISOString(),
    profile: {
      ...createDefaultProfile("en"),
      age: 34,
      height: 180,
      estimatedWeight: 80,
      targetWeight: 78,
      bodyFat: 18,
      activityFactor: "light",
      aiModel: "gemini-2.5-flash",
      updatedAt: new Date().toISOString(),
    },
    dailyEntries: entries.map((entry) => ({
      date: entry.date,
      foodLogText: entry.foodLogText,
      weight: entry.weight,
      manualCalories: entry.manualCalories,
      analysisStale: false,
      nutritionSnapshot: entry.nutritionSnapshot ?? null,
      aiStatus: entry.aiStatus ?? "idle",
      aiError: null,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })),
    foodRules: [],
    aiKeys: {
      gemini: "",
    },
  };
}

export function isoDate(offsetDays: number) {
  const zone = "Asia/Jerusalem";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "01");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "01");
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "12");
  const now = new Date(Date.UTC(year, month - 1, day));
  if (hour < 6) {
    now.setUTCDate(now.getUTCDate() - 1);
  }
  now.setUTCDate(now.getUTCDate() + offsetDays);
  const monthText = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dayText = String(now.getUTCDate()).padStart(2, "0");
  const yearText = String(now.getUTCFullYear());
  return `${yearText}-${monthText}-${dayText}`;
}

export function todayIso() {
  return isoDate(0);
}

export function makeFoodSeed(options: FoodSeedOptions) {
  return {
    id: options.id,
    mealKey: options.mealKey ?? "breakfast",
    mealLabel: options.mealLabel ?? "Breakfast",
    name: options.name,
    canonicalName: options.canonicalName ?? options.name,
    amountText: options.amountText ?? "1 serving",
    grams: options.grams,
    gramsEstimated: false,
    calories: options.calories,
    caloriesEstimated: false,
    caloriesPer100g: options.caloriesPer100g ?? null,
    protein: options.protein,
    carbs: options.carbs,
    fat: options.fat,
    fiber: options.fiber ?? null,
    solubleFiber: options.solubleFiber ?? null,
    insolubleFiber: options.insolubleFiber ?? null,
    confidence: 0.95,
    assumptions: [],
    needsReview: false,
  };
}

export function makeNutritionSnapshot(foods: Array<ReturnType<typeof makeFoodSeed>>) {
  const grouped = new Map<string, Array<ReturnType<typeof makeFoodSeed>>>();
  for (const food of foods) {
    const key = `${food.mealKey}::${food.mealLabel}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(food);
    grouped.set(key, bucket);
  }

  const meals = Array.from(grouped.entries()).map(([key, mealFoods]) => {
    const [mealKey, mealLabel] = key.split("::");
    const totals = sumFoods(mealFoods);
    return {
      id: `meal-${mealKey}`,
      mealKey,
      mealLabel,
      color: mealKey === "breakfast" ? "#8C6A43" : "#4E6B50",
      foods: mealFoods,
      totals,
    };
  });

  return {
    schemaVersion: "1.0",
    calories: sumFoods(foods).calories,
    protein: sumFoods(foods).protein,
    carbs: sumFoods(foods).carbs,
    fat: sumFoods(foods).fat,
    dailyTotals: sumFoods(foods),
    nutrients: {
      fiber: sumFoods(foods).fiber,
      sodiumMg: 180,
      potassiumMg: 340,
      calciumMg: 220,
      ironMg: 2,
      magnesiumMg: 60,
      vitaminAIu: 0,
      vitaminCMg: 0,
      vitaminDMcg: 0,
      vitaminB12Mcg: 0,
    },
    meals,
    foods,
    unmatchedItems: [],
    assumptions: [],
    warnings: [],
    confidence: 0.95,
    sourceModel: "gemini-2.5-flash",
    updatedAt: new Date().toISOString(),
  };
}

function sumFoods(foods: Array<ReturnType<typeof makeFoodSeed>>) {
  return {
    calories: foods.reduce((sum, food) => sum + (food.calories ?? 0), 0),
    protein: Math.round(foods.reduce((sum, food) => sum + (food.protein ?? 0), 0) * 10) / 10,
    carbs: Math.round(foods.reduce((sum, food) => sum + (food.carbs ?? 0), 0) * 10) / 10,
    fat: Math.round(foods.reduce((sum, food) => sum + (food.fat ?? 0), 0) * 10) / 10,
    fiber: Math.round(foods.reduce((sum, food) => sum + (food.fiber ?? 0), 0) * 10) / 10,
  };
}

export async function seedProfileAndEntries(
  page: Page,
  entries: SeedEntry[],
  options?: { signedInUsername?: string | null; seedUsername?: string; password?: string },
): Promise<SeededCloudAuth> {
  const seedPassword = options?.password ?? "secret-pass";
  const fallbackUsername = `playwright-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const signedInUsername =
    options?.signedInUsername === undefined ? fallbackUsername : options.signedInUsername;
  const seedUsername = normalizeTestUsername(options?.seedUsername ?? signedInUsername ?? fallbackUsername);
  const persistentAuth =
    signedInUsername === null
      ? null
      : {
          username: seedUsername,
          password: seedPassword,
        } satisfies SeededCloudAuth;

  if (persistentAuth) {
    await page.addInitScript(
      ({ storageKey, auth }) => {
        localStorage.setItem(storageKey, JSON.stringify(auth));
      },
      {
        storageKey: CLOUD_AUTH_STORAGE_KEY,
        auth: persistentAuth,
      },
    );
  }

  await resetRemoteUser(seedUsername);
  await upsertRemoteUserState(seedUsername, seedPassword, buildSeedProfileState(entries));
  await setSavedCloudAuth(
    page,
    persistentAuth,
  );

  return {
    username: seedUsername,
    password: seedPassword,
  };
}

export async function signInToCloud(page: Page, auth: SeededCloudAuth) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const loginCard = page.locator(".login-card");
  if (!(await loginCard.count())) {
    return;
  }
  await loginCard.locator('input[autocomplete="username"]').fill(normalizeTestUsername(auth.username));
  await loginCard.locator('input[autocomplete="current-password"]').fill(auth.password);
  await loginCard.getByRole("button", { name: "Login" }).click();
  await page.waitForSelector(".login-card", { state: "detached", timeout: 20_000 });
}

export async function ensureCloudSession(page: Page, auth: SeededCloudAuth) {
  const loginCard = page.locator(".login-card");
  if (!(await loginCard.count())) {
    return;
  }
  await loginCard.locator('input[autocomplete="username"]').fill(normalizeTestUsername(auth.username));
  await loginCard.locator('input[autocomplete="current-password"]').fill(auth.password);
  await loginCard.getByRole("button", { name: "Login" }).click();
  await page.waitForSelector(".login-card", { state: "detached", timeout: 20_000 });
}

export async function readPersistedAppState(page: Page) {
  const browserState = await page.evaluate((storageKey) => {
    const authRaw = localStorage.getItem(storageKey);
    const debug = (window as any).__APP_DEBUG_STATE__ ?? null;
    return {
      auth: authRaw ? JSON.parse(authRaw) : null,
      debug,
      localStorage: {
        locale: localStorage.getItem("calorie-tracker.locale"),
        aiModel: localStorage.getItem("calorie-tracker.ai-model"),
      },
    };
  }, CLOUD_AUTH_STORAGE_KEY);

  const auth = browserState.auth as SavedCloudAuth | null;
  if (auth?.username && auth?.password) {
    const remote = await readRemoteUserState(auth.username, auth.password);
    if (remote) {
      return {
        profile: remote.profile,
        dailyEntries: remote.dailyEntries,
        aiKeys: remote.aiKeys,
        localStorage: browserState.localStorage,
      };
    }
  }

  const raw = browserState.debug;
  return {
    profile: raw?.profile ?? null,
    dailyEntries: raw?.dailyEntries ?? [],
    aiKeys: raw?.aiKeys ?? null,
    localStorage: browserState.localStorage,
  };
}
