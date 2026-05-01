import { computed, onMounted, ref, watch } from "vue";
import { type StoredAiKeys, getStoredAiKeys, resetStoredAiKeys, saveStoredAiKeys } from "../ai/credentials";
import { detectLocale, localeDirection, syncI18nLocale } from "../i18n";
import { normalizeProvider, statusLabel } from "./dashboard-helpers";
import { createSerialTaskQueue } from "./serialTaskQueue";
import { useSaveController } from "./useSaveController";
import { useAnalysisFlow } from "./useAnalysisFlow";
import { useFoodCorrectionState } from "./useFoodCorrectionState";
import {
  cloneCloudAppState,
  createDefaultProfile,
  createEmptyCloudAppState,
  normalizeCloudAppState,
  type CloudAppState,
} from "../cloud/app-state";
import {
  chartDayTimestamp,
  dailyEntryDraft,
  deducedWeightFromEntries,
  findEntryByDate,
  resolvedDailyCalories,
} from "../domain/entries";
import { buildTdeeSnapshot, scopeEntries } from "../tdee/calculations";
import type { AiProviderOption, AppLocale, ChartScope, DailyEntry, Profile, TdeeEquation, ThemePreference } from "../types";
import {
  decryptJsonWithPassphrase,
  encryptJsonWithPassphrase,
  type EncryptedSecretBoxV1,
} from "../cloud/crypto";
import {
  ensureProviderOption,
  listProviderOptions,
  syncGeminiProviderOptions,
} from "../ai/registry";
import { isGeminiModelId } from "../ai/gemini-config";
import { fetchGeminiModelOptions } from "../ai/gemini-models";
import { canonicalCloudFingerprint } from "../cloud/canonical";
import { localIsoDate } from "../domain/dates";
import { clearSavedCloudAuth, readSavedCloudAuth, saveCloudAuth, type SavedCloudAuth } from "../cloud/auth-storage";
import { createBackupDocument, parseBackupDocument } from "../cloud/backup";

type CloudPhase = "idle" | "loading" | "saving" | "saved" | "error";

type CloudEncryptedEnvelopeV1 = {
  kind: "encrypted-v1";
  box: EncryptedSecretBoxV1;
  email?: string;
};

function createEntry(date: string): DailyEntry {
  const now = new Date().toISOString();
  return {
    date,
    foodLogText: "",
    weight: null,
    manualCalories: null,
    analysisStale: false,
    nutritionSnapshot: null,
    aiStatus: "idle",
    aiError: null,
    updatedAt: now,
    createdAt: now,
  };
}

function sortEntries(entries: DailyEntry[]) {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function isUsernameValid(value: string) {
  return normalizeUsername(value).length >= 3;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function formatCloudSyncTimestamp(locale: AppLocale) {
  return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function syncChrome(locale: AppLocale) {
  const direction = localeDirection(locale);
  syncI18nLocale(locale);
  document.documentElement.lang = locale;
  document.documentElement.dir = direction;
  document.body.dir = direction;
  document.body.style.direction = direction;
}

function cloudStatusFromPhase(phase: CloudPhase): "idle" | "loading" | "saving" | "saved" | "error" {
  return phase;
}

export function useDashboard() {
  const today = localIsoDate();
  const startupLocale = detectLocale();
  const initialSavedCloudAuth = readSavedCloudAuth();
  const locale = ref<AppLocale>(startupLocale);
  const profile = ref<Profile | null>(createDefaultProfile(startupLocale));
  const entries = ref<DailyEntry[]>([]);
  const selectedDate = ref(today);
  const currentFoodLog = ref("");
  const currentWeight = ref("");
  const hasUserEditedCurrentFoodLog = ref(false);
  const hasUserEditedCurrentWeight = ref(false);
  const provider = ref(normalizeProvider(profile.value?.aiModel ?? null));
  const providerOptions = ref<AiProviderOption[]>([]);
  const aiKeys = ref<StoredAiKeys>(getStoredAiKeys());
  const notice = ref("");
  const savedCloudAuth = ref<SavedCloudAuth | null>(initialSavedCloudAuth);
  const cloudUsername = ref(initialSavedCloudAuth?.username ?? "");
  const cloudConfirmedUsername = ref("");
  const cloudPassword = ref(initialSavedCloudAuth?.password ?? "");
  const cloudPhase = ref<CloudPhase>("idle");
  const cloudLastSyncedAt = ref("");
  const cloudError = ref("");
  const isInitialCloudHydrating = ref(Boolean(initialSavedCloudAuth));
  const supabaseConfigured = computed(() =>
    Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
  );
  const currentLoadedState = ref<CloudAppState>(createEmptyCloudAppState(startupLocale));
  const lastSavedFingerprint = ref(canonicalCloudFingerprint(currentLoadedState.value));
  const cloudWriteQueue = createSerialTaskQueue();
  let cachedCloudBlobModule:
    | Promise<{
        createUserBlob: (username: string, raw: unknown) => Promise<any>;
        fetchUserBlob: (username: string) => Promise<any>;
        upsertUserBlob: (username: string, raw: unknown) => Promise<any>;
      }>
    | null = null;

  function getCloudBlobModule() {
    cachedCloudBlobModule ??= import("../cloud/user-blob");
    return cachedCloudBlobModule;
  }

  function hydrateFromState(next: CloudAppState, options?: { preserveSelectedInputs?: boolean }) {
    const cloned = cloneCloudAppState(next);
    currentLoadedState.value = cloned;
    profile.value = clone(cloned.profile);
    entries.value = sortEntries(clone(cloned.dailyEntries));
    aiKeys.value = { ...cloned.aiKeys };
    saveStoredAiKeys(aiKeys.value);
    locale.value = profile.value.locale;
    provider.value = normalizeProvider(profile.value.aiModel);
    ensureProviderOption(provider.value, locale.value);
    syncChrome(locale.value);
    refreshVisibleProviderOptions(locale.value);
    if (!options?.preserveSelectedInputs) {
      loadSelectedEntry();
    }
    lastSavedFingerprint.value = canonicalCloudFingerprint(buildCloudStateSnapshot());
    (globalThis as any).__APP_DEBUG_STATE__ = buildCloudStateSnapshot();
  }

  function buildCloudStateSnapshot(): CloudAppState {
    return {
      schemaVersion: "2",
      updatedAt: new Date().toISOString(),
      profile: clone(profile.value ?? createDefaultProfile(locale.value)),
      dailyEntries: sortEntries(clone(entries.value)),
      foodRules: clone(currentLoadedState.value.foodRules),
      aiKeys: { ...aiKeys.value },
    };
  }

  function getCloudSecret(username: string, passwordOverride?: string) {
    const password = (passwordOverride ?? cloudPassword.value).trim();
    if (!password) return "";
    return `${normalizeUsername(username)}::${password}`;
  }

  function stripEmailFromPayload(payload: CloudAppState): CloudAppState {
    return {
      ...payload,
      profile: {
        ...payload.profile,
        email: "",
      },
    };
  }

  function applyCloudEmailToPayload(payload: CloudAppState, email?: string): CloudAppState {
    if (!email?.trim()) {
      return payload;
    }
    return {
      ...payload,
      profile: {
        ...payload.profile,
        email,
      },
    };
  }

  function isEncryptedSecretBox(raw: unknown): raw is EncryptedSecretBoxV1 {
    return (
      Boolean(raw) &&
      typeof raw === "object" &&
      (raw as EncryptedSecretBoxV1).v === 1 &&
      (raw as EncryptedSecretBoxV1).alg === "AES-GCM" &&
      (raw as EncryptedSecretBoxV1).kdf === "PBKDF2"
    );
  }

  function isEncryptedEnvelope(raw: unknown): raw is CloudEncryptedEnvelopeV1 {
    return Boolean(raw) && typeof raw === "object" && (raw as CloudEncryptedEnvelopeV1).kind === "encrypted-v1";
  }

  async function decodeCloudBlob(raw: unknown, secret: string): Promise<CloudAppState> {
    if (isEncryptedEnvelope(raw)) {
      const decrypted = await decryptJsonWithPassphrase<{ payload: unknown }>(raw.box, secret);
      return applyCloudEmailToPayload(normalizeCloudAppState(decrypted.payload, locale.value), raw.email);
    }

    if (isEncryptedSecretBox(raw)) {
      const decrypted = await decryptJsonWithPassphrase<unknown>(raw, secret);
      return normalizeCloudAppState(decrypted, locale.value);
    }

    return normalizeCloudAppState(raw, locale.value);
  }

  async function encodeCloudBlob(payload: CloudAppState, secret: string): Promise<CloudEncryptedEnvelopeV1> {
    const publicEmail = payload.profile.email?.trim() || undefined;
    const box = await encryptJsonWithPassphrase({ payload: stripEmailFromPayload(payload) }, secret);
    return { kind: "encrypted-v1", box, email: publicEmail };
  }

  function refreshVisibleProviderOptions(nextLocale = locale.value) {
    providerOptions.value = aiKeys.value.gemini.trim() ? listProviderOptions(nextLocale) : [];
  }

  function setProfileOnly(nextProfile: Profile) {
    const stampedProfile = {
      ...nextProfile,
      updatedAt: new Date().toISOString(),
    };
    profile.value = stampedProfile;
    currentLoadedState.value = {
      ...currentLoadedState.value,
      profile: clone(stampedProfile),
      updatedAt: new Date().toISOString(),
    };
    locale.value = stampedProfile.locale;
    provider.value = normalizeProvider(stampedProfile.aiModel);
    ensureProviderOption(provider.value, locale.value);
    syncChrome(locale.value);
    refreshVisibleProviderOptions(locale.value);
    (globalThis as any).__APP_DEBUG_STATE__ = buildCloudStateSnapshot();
  }

  function upsertEntryLocally(date: string, updater: (entry: DailyEntry) => DailyEntry) {
    const existing = findEntryByDate(entries.value, date) ?? createEntry(date);
    const next = {
      ...updater(clone(existing)),
      date,
      updatedAt: new Date().toISOString(),
      createdAt: existing.createdAt,
    };
    entries.value = sortEntries([
      next,
      ...entries.value.filter((entry) => entry.date !== date),
    ]);
    currentLoadedState.value = {
      ...currentLoadedState.value,
      dailyEntries: clone(entries.value),
      updatedAt: new Date().toISOString(),
    };
    (globalThis as any).__APP_DEBUG_STATE__ = buildCloudStateSnapshot();
    return next;
  }

  function deleteEntryLocally(date: string) {
    const existing = findEntryByDate(entries.value, date);
    if (!existing) {
      return false;
    }
    entries.value = entries.value.filter((entry) => entry.date !== date);
    currentLoadedState.value = {
      ...currentLoadedState.value,
      dailyEntries: clone(entries.value),
      updatedAt: new Date().toISOString(),
    };
    (globalThis as any).__APP_DEBUG_STATE__ = buildCloudStateSnapshot();
    return true;
  }

  async function persistCloudState(force = false) {
    const username = normalizeUsername(cloudConfirmedUsername.value);
    const secret = getCloudSecret(username);
    if (!username || !secret) {
      return false;
    }

    const snapshot = buildCloudStateSnapshot();
    const fingerprint = canonicalCloudFingerprint(snapshot);
    if (!force && fingerprint === lastSavedFingerprint.value) {
      return false;
    }

    await cloudWriteQueue.enqueue(async () => {
      const latest = buildCloudStateSnapshot();
      const latestFingerprint = canonicalCloudFingerprint(latest);
      if (!force && latestFingerprint === lastSavedFingerprint.value) {
        return;
      }

      cloudPhase.value = "saving";
      cloudError.value = "";
      const { upsertUserBlob } = await getCloudBlobModule();
      const pushed = await upsertUserBlob(username, await encodeCloudBlob(latest, secret));
      if (!pushed.ok) {
        cloudPhase.value = "error";
        cloudError.value = pushed.error;
        throw new Error(pushed.error);
      }

      lastSavedFingerprint.value = latestFingerprint;
      cloudLastSyncedAt.value = formatCloudSyncTimestamp(locale.value);
      cloudPhase.value = "saved";
    });

    return true;
  }

  const autoSave = useSaveController({
    debounceMs: 400,
    onChanged: async () => {
      await persistCloudState();
    },
  });

  const savedCurrentEntry = computed(() =>
    findEntryByDate(entries.value, selectedDate.value),
  );
  const isCurrentFoodLogDirty = computed(() => {
    const savedFoodLog = savedCurrentEntry.value?.foodLogText ?? "";
    return currentFoodLog.value.trim() !== savedFoodLog.trim();
  });
  const isCurrentWeightDirty = computed(() => {
    const saved = savedCurrentEntry.value?.weight;
    const savedWeight = saved !== null && saved !== undefined ? String(saved) : "";
    return currentWeight.value.trim() !== savedWeight.trim();
  });

  function loadSelectedEntry(options?: { skipFoodLog?: boolean }) {
    const savedEntry = findEntryByDate(entries.value, selectedDate.value);
    const draft = dailyEntryDraft(savedEntry);

    if (!options?.skipFoodLog) {
      currentFoodLog.value = draft.foodLogText;
      hasUserEditedCurrentFoodLog.value = false;
    }

    currentWeight.value = draft.weight;
    hasUserEditedCurrentWeight.value = false;
  }

  function updateCurrentFoodLog(value: string) {
    hasUserEditedCurrentFoodLog.value = true;
    currentFoodLog.value = value;
  }

  function updateCurrentWeight(value: string) {
    hasUserEditedCurrentWeight.value = true;
    currentWeight.value = value;
  }

  const displayEntries = computed(() =>
    entries.value.map((entry) =>
      entry.date === selectedDate.value && isCurrentFoodLogDirty.value && !analysis.isAnalyzing.value
        ? {
            ...entry,
            analysisStale: true,
          }
        : entry,
    ),
  );
  const currentEntry = computed(() =>
    findEntryByDate(displayEntries.value, selectedDate.value),
  );
  const tdee = computed(() =>
    profile.value
      ? buildTdeeSnapshot(displayEntries.value, profile.value)
      : buildTdeeSnapshot([], createDefaultProfile(locale.value)),
  );
  const progressTdeeReferences = computed<Record<ChartScope, number | null>>(() => {
    if (!profile.value) {
      return { "7d": null, "30d": null, all: null };
    }
    return {
      "7d": buildTdeeSnapshot(scopeEntries(displayEntries.value, "7d"), profile.value).selectedValue,
      "30d": buildTdeeSnapshot(scopeEntries(displayEntries.value, "30d"), profile.value).selectedValue,
      all: buildTdeeSnapshot(scopeEntries(displayEntries.value, "all"), profile.value).selectedValue,
    };
  });

  const weightPoints = computed(() =>
    displayEntries.value
      .map((entry) => {
        const effective = entry.weight ?? deducedWeightFromEntries(displayEntries.value, entry.date);
        return { x: chartDayTimestamp(entry.date), y: effective };
      })
      .filter((point) => point.y !== null && point.y !== undefined),
  );
  const caloriePoints = computed(() =>
    displayEntries.value
      .filter((entry) => resolvedDailyCalories(entry) !== null)
      .map((entry) => ({
        x: chartDayTimestamp(entry.date),
        y: resolvedDailyCalories(entry),
      })),
  );
  const estimatedLeanWeight = computed(() => {
    const weight = profile.value?.estimatedWeight;
    const bodyFat = profile.value?.bodyFat;
    if (weight == null || bodyFat == null || weight <= 0 || bodyFat < 0 || bodyFat >= 100) {
      return null;
    }
    return Math.round(weight * (1 - bodyFat / 100) * 10) / 10;
  });

  async function runProfileSave(
    fieldKey: string,
    scopes: string | string[],
    nextProfile: Profile,
    mode: "schedule" | "now" = "schedule",
  ) {
    const profileChanged = () => JSON.stringify(currentLoadedState.value.profile) !== JSON.stringify(nextProfile);
    return mode === "now"
      ? autoSave.runNow({
          fieldKey,
          queueKey: "profile",
          scopes,
          shouldSave: profileChanged,
          save: async () => {
            setProfileOnly(nextProfile);
            return true;
          },
        })
      : autoSave.schedule({
          fieldKey,
          queueKey: "profile",
          scopes,
          shouldSave: profileChanged,
          save: async () => {
            setProfileOnly(nextProfile);
            return true;
          },
        });
  }

  async function persistWeightDraft(
    mode: "schedule" | "now",
    options?: { date?: string; rawWeight?: string },
  ) {
    const rawWeight = options?.rawWeight ?? currentWeight.value;
    const date = options?.date ?? selectedDate.value;
    const parsed = rawWeight.trim() ? Number(rawWeight) : null;
    const normalizedWeight =
      parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    const saved = findEntryByDate(entries.value, date)?.weight ?? null;

    const runner = mode === "now" ? autoSave.runNow.bind(autoSave) : autoSave.schedule.bind(autoSave);
    const changed = await runner({
      fieldKey: "today.weight",
      scopes: "today.weight",
      shouldSave: () => normalizedWeight !== saved,
      save: async () => {
        upsertEntryLocally(date, (entry) => ({
          ...entry,
          weight: normalizedWeight,
        }));
        if (selectedDate.value === date) {
          currentWeight.value = normalizedWeight !== null ? String(normalizedWeight) : "";
          hasUserEditedCurrentWeight.value = false;
        }
        return true;
      },
    });

    return changed;
  }

  async function persistFoodDraft(
    mode: "schedule" | "now",
    options?: { date?: string; foodLogText?: string },
  ) {
    const foodLogText = options?.foodLogText ?? currentFoodLog.value;
    const date = options?.date ?? selectedDate.value;
    const savedFoodLog = findEntryByDate(entries.value, date)?.foodLogText ?? "";
    const runner = mode === "now" ? autoSave.runNow.bind(autoSave) : autoSave.schedule.bind(autoSave);
    const changed = await runner({
      fieldKey: "today.foodLog",
      scopes: "today.foodLog",
      shouldSave: () => foodLogText.trim() !== savedFoodLog.trim(),
      save: async () => {
        upsertEntryLocally(date, (entry) => {
          const foodLogChanged = foodLogText !== entry.foodLogText;
          return {
            ...entry,
            foodLogText,
            analysisStale: foodLogChanged ? true : entry.analysisStale,
            aiStatus: foodLogChanged ? "idle" : entry.aiStatus,
            aiError: foodLogChanged ? null : entry.aiError,
          };
        });
        if (selectedDate.value === date && currentFoodLog.value === foodLogText) {
          hasUserEditedCurrentFoodLog.value = false;
        }
        return true;
      },
    });

    if (mode === "now") {
      hasUserEditedCurrentFoodLog.value = false;
    }

    return changed;
  }

  function scheduleWeightDraftSave() {
    void persistWeightDraft("schedule");
  }

  function scheduleFoodDraftSave() {
    void persistFoodDraft("schedule");
  }

  async function saveWeightDraft(weightOverride?: string) {
    if (typeof weightOverride === "string") {
      currentWeight.value = weightOverride;
      hasUserEditedCurrentWeight.value = true;
    }
    await persistWeightDraft("now");
  }

  async function saveFoodDraft(foodLogOverride?: string) {
    if (typeof foodLogOverride === "string") {
      currentFoodLog.value = foodLogOverride;
      hasUserEditedCurrentFoodLog.value = true;
    }
    await persistFoodDraft("now");
  }

  async function onLocaleChange(nextLocale: AppLocale) {
    if (!profile.value) return;
    await runProfileSave("settings.locale", "settings.locale", { ...profile.value, locale: nextLocale }, "now");
  }

  async function onProviderChange(nextProvider: string) {
    if (!profile.value) return;
    ensureProviderOption(nextProvider, locale.value);
    await runProfileSave("settings.provider", "settings.provider", { ...profile.value, aiModel: nextProvider }, "now");
  }

  async function saveProfileDraft(nextProfile?: Profile) {
    if (!nextProfile && !profile.value) return;
    await runProfileSave("constants.profile", "constants.profile", nextProfile ?? profile.value!, "schedule");
  }

  async function saveTdeeEquation(tdeeEquation: TdeeEquation) {
    if (!profile.value || profile.value.tdeeEquation === tdeeEquation) {
      return;
    }
    await runProfileSave(
      "constants.profile.tdeeEquation",
      "constants.profile.tdeeEquation",
      { ...profile.value, tdeeEquation },
      "now",
    );
  }

  async function saveThemePreference(nextTheme: ThemePreference) {
    if (!profile.value || profile.value.themePreference === nextTheme) {
      return;
    }
    await runProfileSave(
      "constants.profile.themePreference",
      "constants.profile.themePreference",
      { ...profile.value, themePreference: nextTheme },
      "now",
    );
  }

  async function saveFoodInstructions(foodInstructions: string) {
    if (!profile.value || profile.value.foodInstructions === foodInstructions) {
      return;
    }
    await runProfileSave(
      "constants.foodInstructions",
      "constants.foodInstructions",
      { ...profile.value, foodInstructions },
      "schedule",
    );
  }

  async function saveAiKey(providerKey: keyof StoredAiKeys, value: string) {
    if ((aiKeys.value[providerKey] ?? "") === value) {
      return;
    }
    await autoSave.runNow({
      fieldKey: `credentials.${providerKey}`,
      scopes: `credentials.${providerKey}`,
      save: async () => {
        aiKeys.value = { ...aiKeys.value, [providerKey]: value };
        saveStoredAiKeys(aiKeys.value);
        currentLoadedState.value = {
          ...currentLoadedState.value,
          aiKeys: { ...aiKeys.value },
          updatedAt: new Date().toISOString(),
        };
        refreshVisibleProviderOptions(locale.value);
        (globalThis as any).__APP_DEBUG_STATE__ = buildCloudStateSnapshot();
        return true;
      },
    });
  }

  async function deleteDay(date: string) {
    autoSave.cancel("today.foodLog");
    autoSave.cancel("today.weight");
    const changed = await autoSave.runNow({
      fieldKey: `day.delete.${date}`,
      scopes: `day.delete.${date}`,
      save: async () => deleteEntryLocally(date),
    });
    if (changed) {
      if (selectedDate.value === date) {
        loadSelectedEntry();
      }
      notice.value = "day-deleted";
    }
  }

  async function saveHistoryCalories(date: string, calories: number | null) {
    const savedCalories = findEntryByDate(entries.value, date)?.manualCalories ?? null;
    await autoSave.runNow({
      fieldKey: `history.calories.${date}`,
      scopes: `history.calories.${date}`,
      shouldSave: () => calories !== savedCalories,
      save: async () => {
        upsertEntryLocally(date, (entry) => ({
          ...entry,
          manualCalories: calories,
        }));
        return true;
      },
    });
  }

  async function saveHistoryWeight(date: string, weight: number | null) {
    const savedWeight = findEntryByDate(entries.value, date)?.weight ?? null;
    await autoSave.runNow({
      fieldKey: `history.weight.${date}`,
      scopes: `history.weight.${date}`,
      shouldSave: () => weight !== savedWeight,
      save: async () => {
        upsertEntryLocally(date, (entry) => ({
          ...entry,
          weight,
        }));
        if (selectedDate.value === date) {
          currentWeight.value = weight !== null ? String(weight) : "";
          hasUserEditedCurrentWeight.value = false;
        }
        return true;
      },
    });
  }

  async function updateEntry(date: string, updater: (entry: DailyEntry) => DailyEntry) {
    upsertEntryLocally(date, updater);
  }

  async function updateCurrentEntry(updater: (entry: DailyEntry) => DailyEntry) {
    const existing = findEntryByDate(entries.value, selectedDate.value) ?? createEntry(selectedDate.value);
    upsertEntryLocally(existing.date, updater);
  }

  function clearNotice() {
    notice.value = "";
  }

  const analysis = useAnalysisFlow({
    profile,
    provider,
    providerOptions,
    currentFoodLog,
    selectedDate,
    getEntryForDate: (date) => findEntryByDate(entries.value, date),
    saveFoodDraft,
    saveProvider: onProviderChange,
    updateEntry,
  });

  const corrections = useFoodCorrectionState({
    profile,
    currentEntry,
    setProfile: async (nextProfile) => {
      setProfileOnly(nextProfile);
    },
    updateCurrentEntry,
    setNotice: (value) => {
      notice.value = value;
    },
  });

  async function runMutationWithCloudSync(
    scopes: string | string[],
    mutate: () => Promise<boolean>,
  ) {
    await autoSave.runNow({
      fieldKey: Array.isArray(scopes) ? scopes[0] ?? "mutation" : scopes,
      scopes,
      save: mutate,
    });
  }

  async function cloudSyncNow(options?: { username?: string; password?: string }) {
    const username = normalizeUsername(options?.username ?? cloudUsername.value);
    const password = (options?.password ?? cloudPassword.value).trim();
    if (!isUsernameValid(username)) {
      cloudPhase.value = "error";
      cloudError.value = "";
      return;
    }
    if (!supabaseConfigured.value) {
      cloudPhase.value = "error";
      cloudError.value = "Supabase is not available in this build.";
      return;
    }
    if (!password) {
      cloudPhase.value = "error";
      cloudError.value = "Missing cloud password.";
      return;
    }

    cloudPhase.value = "loading";
    cloudError.value = "";
    isInitialCloudHydrating.value = true;
    try {
      const { createUserBlob, fetchUserBlob, upsertUserBlob } = await getCloudBlobModule();
      const remote = await fetchUserBlob(username);
      if (!remote.ok) {
        throw new Error(remote.error);
      }

      let nextState: CloudAppState;
      if (remote.data?.raw) {
        try {
          nextState = await decodeCloudBlob(remote.data.raw, getCloudSecret(username, password));
        } catch {
          throw new Error("Bad cloud password.");
        }
      } else {
        nextState = {
          ...createEmptyCloudAppState(locale.value),
          profile: {
            ...createDefaultProfile(locale.value),
            locale: profile.value?.locale ?? locale.value,
            themePreference: profile.value?.themePreference ?? "system",
            email: profile.value?.email ?? "",
            aiModel: profile.value?.aiModel ?? provider.value,
          },
          aiKeys: { ...aiKeys.value },
        };
      }

      hydrateFromState(nextState);
      cloudUsername.value = username;
      cloudConfirmedUsername.value = username;
      cloudPassword.value = password;
      savedCloudAuth.value = { username, password };
      saveCloudAuth({ username, password });
      const encoded = await encodeCloudBlob(buildCloudStateSnapshot(), getCloudSecret(username, password));
      const pushed = remote.data?.raw
        ? await upsertUserBlob(username, encoded)
        : await createUserBlob(username, encoded);
      if (!pushed.ok) {
        throw new Error(pushed.error);
      }

      lastSavedFingerprint.value = canonicalCloudFingerprint(buildCloudStateSnapshot());
      cloudLastSyncedAt.value = formatCloudSyncTimestamp(locale.value);
      cloudPhase.value = "saved";
    } catch (error) {
      cloudPhase.value = "error";
      cloudError.value = error instanceof Error ? error.message : String(error);
      if (cloudError.value === "Bad cloud password.") {
        clearSavedCloudAuth();
        savedCloudAuth.value = null;
        cloudPassword.value = "";
        cloudConfirmedUsername.value = "";
      }
    } finally {
      isInitialCloudHydrating.value = false;
    }
  }

  async function cloudLogout() {
    const nextLocale = locale.value;
    const nextTheme = profile.value?.themePreference ?? "system";
    cloudUsername.value = "";
    cloudConfirmedUsername.value = "";
    cloudPassword.value = "";
    savedCloudAuth.value = null;
    cloudLastSyncedAt.value = "";
    cloudError.value = "";
    cloudPhase.value = "idle";
    clearSavedCloudAuth();
    resetStoredAiKeys();
    aiKeys.value = getStoredAiKeys();
    hydrateFromState({
      ...createEmptyCloudAppState(nextLocale),
      profile: {
        ...createDefaultProfile(nextLocale),
        themePreference: nextTheme,
      },
    });
  }

  function createBackupFile() {
    const backup = createBackupDocument(buildCloudStateSnapshot());
    const exportedAt = backup.exportedAt.slice(0, 10);
    const username = normalizeUsername(cloudConfirmedUsername.value) || "cloud";
    return {
      filename: `calorie-tracker-backup-${username}-${exportedAt}.json`,
      content: JSON.stringify(backup, null, 2),
    };
  }

  async function restoreBackupFile(rawText: string) {
    const parsed = JSON.parse(rawText) as unknown;
    const nextState = parseBackupDocument(parsed, locale.value);
    hydrateFromState(nextState);
    await persistCloudState(true);
  }

  async function analyzeCurrentDay() {
    await analysis.analyzeCurrentDay();
    await persistCloudState();
  }

  function setCloudUsername(next: string) {
    cloudUsername.value = next;
    if (cloudConfirmedUsername.value && cloudConfirmedUsername.value !== normalizeUsername(next)) {
      cloudPhase.value = "idle";
      cloudLastSyncedAt.value = "";
      cloudError.value = "";
    }
  }

  watch(currentFoodLog, () => {
    if (!hasUserEditedCurrentFoodLog.value) return;
    if (!isCurrentFoodLogDirty.value) {
      autoSave.cancel("today.foodLog");
      return;
    }
    scheduleFoodDraftSave();
  });

  watch(currentWeight, () => {
    if (!hasUserEditedCurrentWeight.value) return;
    if (!isCurrentWeightDirty.value) {
      autoSave.cancel("today.weight");
      return;
    }
    scheduleWeightDraftSave();
  });

  watch(
    selectedDate,
    async (nextDate, previousDate) => {
      if (previousDate && previousDate !== nextDate) {
        const previousFoodLog = currentFoodLog.value;
        const previousWeight = currentWeight.value;
        autoSave.cancel("today.foodLog");
        autoSave.cancel("today.weight");
        await persistFoodDraft("now", {
          date: previousDate,
          foodLogText: previousFoodLog,
        });
        await persistWeightDraft("now", {
          date: previousDate,
          rawWeight: previousWeight,
        });
      }
      loadSelectedEntry();
    },
    { flush: "sync" },
  );

  watch(
    () => aiKeys.value.gemini,
    async (key) => {
      const effectiveKey = (key || import.meta.env.VITE_GEMINI_API_KEY || "").trim();
      if (!effectiveKey) {
        refreshVisibleProviderOptions();
        return;
      }
      try {
        const geminiOptions = await fetchGeminiModelOptions(effectiveKey, locale.value);
        syncGeminiProviderOptions(geminiOptions);
        const detectedIds = new Set(geminiOptions.map((option) => option.id));
        if (isGeminiModelId(provider.value) && !detectedIds.has(provider.value)) {
          const suggested = geminiOptions[0]?.id;
          if (suggested && profile.value) {
            provider.value = suggested;
            setProfileOnly({ ...profile.value, aiModel: suggested });
            void persistCloudState();
          }
        }
        ensureProviderOption(provider.value, locale.value);
        refreshVisibleProviderOptions();
      } catch {
        ensureProviderOption(provider.value, locale.value);
        refreshVisibleProviderOptions();
      }
    },
    { immediate: true },
  );

  onMounted(() => {
    if (!savedCloudAuth.value || cloudConfirmedUsername.value) {
      return;
    }
    cloudUsername.value = savedCloudAuth.value.username;
    void cloudSyncNow(savedCloudAuth.value);
  });

  syncChrome(locale.value);
  refreshVisibleProviderOptions();
  loadSelectedEntry();
  (globalThis as any).__APP_DEBUG_STATE__ = buildCloudStateSnapshot();

  return {
    locale,
    profile,
    entries: displayEntries,
    selectedDate,
    currentFoodLog,
    currentWeight,
    updateCurrentFoodLog,
    updateCurrentWeight,
    provider,
    providerOptions,
    aiKeys,
    isAnalyzing: analysis.isAnalyzing,
    showModelSwitchPrompt: analysis.showModelSwitchPrompt,
    suggestedModelLabel: analysis.suggestedModelLabel,
    isAutoSaving: autoSave.isAutoSaving,
    isSavingWeight: autoSave.isSavingWeight,
    isSavingFoodLog: autoSave.isSavingFoodLog,
    isSavingFoodInstructions: autoSave.isSavingFoodInstructions,
    isSavingTdeeEquation: autoSave.isSavingTdeeEquation,
    isSavingLocale: autoSave.isSavingLocale,
    isSavingProvider: autoSave.isSavingProvider,
    savingAiKeyField: autoSave.savingAiKeyField,
    analyzeIssue: analysis.analyzeIssue,
    currentEntry,
    tdee,
    progressTdeeReferences,
    estimatedLeanWeight,
    weightPoints,
    caloriePoints,
    savingHistoryCalories: autoSave.savingHistoryCalories,
    savingHistoryWeight: autoSave.savingHistoryWeight,
    notice,
    cloudUsername,
    cloudConfirmedUsername,
    hasSavedCloudPassword: computed(
      () =>
        savedCloudAuth.value?.username === normalizeUsername(cloudUsername.value) &&
        Boolean(savedCloudAuth.value?.password.trim()),
    ),
    isCloudBusy: computed(() => cloudPhase.value === "loading" || cloudPhase.value === "saving"),
    isCloudSyncing: computed(() => cloudPhase.value === "loading" || cloudPhase.value === "saving"),
    isInitialCloudHydrating,
    cloudStatus: computed(() => cloudStatusFromPhase(cloudPhase.value)),
    cloudLastSyncedAt,
    cloudError,
    supabaseConfigured,
    statusLabel,
    loadSelectedEntry,
    onLocaleChange,
    onProviderChange,
    saveWeightDraft,
    saveFoodDraft,
    deleteDay,
    saveHistoryCalories,
    saveHistoryWeight,
    analyzeCurrentDay,
    acceptSuggestedModelSwitch: analysis.acceptSuggestedModelSwitch,
    dismissSuggestedModelSwitch: analysis.dismissSuggestedModelSwitch,
    saveProfileDraft,
    saveTdeeEquation,
    saveFoodInstructions,
    saveAiKey,
    saveFoodCorrectionInstruction: async (
      foodId: string,
      foodName: string,
      grams: number | null,
      calories: number | null,
      caloriesPer100g: number | null,
      _protein?: number | null,
      _carbs?: number | null,
      _fat?: number | null,
      _fiber?: number | null,
      _solubleFiber?: number | null,
      _insolubleFiber?: number | null,
    ) => {
      await runMutationWithCloudSync(
        "nutrition.correction",
        () => corrections.saveFoodCorrectionInstruction(foodId, foodName, grams, calories, caloriesPer100g),
      );
    },
    saveFoodCorrectionInstructionOnly: async (
      foodId: string,
      foodName: string,
      grams: number | null,
      calories: number | null,
      caloriesPer100g: number | null,
      _protein?: number | null,
      _carbs?: number | null,
      _fat?: number | null,
      _fiber?: number | null,
      _solubleFiber?: number | null,
      _insolubleFiber?: number | null,
    ) => {
      await runMutationWithCloudSync(
        "nutrition.correction",
        () => corrections.saveFoodCorrectionInstructionOnly(foodId, foodName, grams, calories, caloriesPer100g),
      );
    },
    applyFoodCorrectionToCurrentEntry: async (
      foodId: string,
      foodName: string,
      grams: number | null,
      calories: number | null,
      caloriesPer100g: number | null,
      protein?: number | null,
      carbs?: number | null,
      fat?: number | null,
      fiber?: number | null,
      solubleFiber?: number | null,
      insolubleFiber?: number | null,
    ) => {
      await runMutationWithCloudSync(
        "nutrition.correction",
        () => corrections.applyFoodCorrectionToCurrentEntry(
          foodId,
          foodName,
          grams,
          calories,
          caloriesPer100g,
          protein,
          carbs,
          fat,
          fiber,
          solubleFiber,
          insolubleFiber,
        ),
      );
    },
    applyMealTotalCorrectionToCurrentEntry: async (
      mealId: string,
      totals: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null; fiber: number | null },
    ) => {
      await runMutationWithCloudSync(
        "nutrition.correction",
        () => corrections.applyMealTotalCorrectionToCurrentEntry(mealId, totals),
      );
    },
    setCloudUsername,
    cloudLogout,
    cloudSyncNow,
    createBackupFile,
    restoreBackupFile,
    clearNotice,
    saveThemePreference,
  };
}
