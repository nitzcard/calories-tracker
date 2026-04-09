import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { getStoredAiKeys, saveStoredAiKeys, type StoredAiKeys } from "../ai/credentials";
import { detectLocale, localeDirection, syncI18nLocale } from "../i18n";
import {
  DASHBOARD_STORAGE_KEYS,
  normalizeProvider,
  readStoredLocale,
  readStoredProvider,
  readStoredThemeMode,
  statusLabel,
} from "./dashboard-helpers";
import { useAutoSaveState } from "./useAutoSaveState";
import { useAnalysisFlow } from "./useAnalysisFlow";
import { useDataTransferState } from "./useDataTransferState";
import { useFoodCorrectionState } from "./useFoodCorrectionState";
import {
  ensureDefaultProfile,
  getProfile,
  listEntries,
  exportAppData,
  importAppData,
  saveProfile,
  upsertDailyEntry,
  type ExportedAppData,
  getStoredAiKeysFromDb,
  saveStoredAiKeysToDb,
} from "../storage/repository";
import {
  chartDayTimestamp,
  dailyEntryDraft,
  deducedWeightFromEntries,
  findEntryByDate,
  resolvedDailyCalories,
} from "../domain/entries";
import { buildNutritionInsights } from "../insights/nutrition-insights";
import { buildTdeeSnapshot } from "../tdee/calculations";
import { applyTheme, detectThemeMode } from "../theme";
import type { AiProviderOption, AppLocale, DailyEntry, Profile, TdeeEquation, ThemeMode } from "../types";
import { fetchUserBlob, upsertUserBlob } from "../cloud/user-blob";
import { isSupabaseConfigured } from "../cloud/supabase";
import {
  decryptJsonWithPassphrase,
  encryptJsonWithPassphrase,
  type EncryptedSecretBoxV1,
} from "../cloud/crypto";
import {
  ensureProviderOption,
  listProviderOptions,
  localizeBuiltinProviderOptions,
  syncGeminiProviderOptions,
} from "../ai/registry";
import { fetchGeminiModelOptions } from "../ai/gemini-models";
import { mergeExportedAppData } from "../cloud/merge";
import { localIsoDate } from "../domain/dates";

export function useDashboard() {
  const today = localIsoDate();
  const locale = ref<AppLocale>(readStoredLocale() ?? detectLocale());
  const themeMode = ref<ThemeMode>(readStoredThemeMode() ?? detectThemeMode());
  const profile = ref<Profile | null>(null);
  const entries = ref<DailyEntry[]>([]);
  const selectedDate = ref(today);
  const currentFoodLog = ref("");
  const currentWeight = ref("");
  const provider = ref(normalizeProvider(readStoredProvider()));
  localizeBuiltinProviderOptions(locale.value);
  const providerOptions = ref<AiProviderOption[]>(listProviderOptions(locale.value));
  const aiKeys = ref<StoredAiKeys>(getStoredAiKeys());
  const notice = ref("");
  const autoSave = useAutoSaveState();
  const cloudMode = ref<"offline" | "cloud">(
    (localStorage.getItem(DASHBOARD_STORAGE_KEYS.cloudMode) as "offline" | "cloud" | null) ??
      "offline",
  );
  const cloudUsername = ref(localStorage.getItem(DASHBOARD_STORAGE_KEYS.cloudUsername) ?? "");
  const cloudConfirmedUsername = ref(
    localStorage.getItem(DASHBOARD_STORAGE_KEYS.cloudConfirmedUsername) ?? "",
  );
  const isCloudBusy = ref(false);
  const cloudStatus = ref<"idle" | "synced" | "failed">("idle");
  const cloudLastSyncedAt = ref("");
  const cloudError = ref("");
  const supabaseConfigured = computed(() => isSupabaseConfigured());
  const cloudIsSyncing = ref(false);
  let cloudPushTimer: ReturnType<typeof setTimeout> | null = null;
  let cloudPushPending = false;

  function normalizeUsername(value: string) {
    return value.trim().toLowerCase();
  }

  function isUsernameValid(value: string) {
    return normalizeUsername(value).length >= 3;
  }

  const cloudPassword = ref("");
  const cloudPasswordStorageKeyPrefix = "calorie-tracker.cloud-password::";

  function cloudPasswordStorageKey(username: string) {
    return `${cloudPasswordStorageKeyPrefix}${normalizeUsername(username)}`;
  }

  function loadCloudPasswordFromStorage(username: string) {
    try {
      const stored = localStorage.getItem(cloudPasswordStorageKey(username)) ?? "";
      if (stored.trim()) {
        cloudPassword.value = stored;
        return true;
      }
    } catch {
      // Ignore; storage may be unavailable in some contexts.
    }
    return false;
  }

  function saveCloudPasswordToStorage(username: string, password: string) {
    try {
      localStorage.setItem(cloudPasswordStorageKey(username), password);
    } catch {
      // Ignore; storage may be unavailable in some contexts.
    }
  }

  function removeCloudPasswordFromStorage(username: string) {
    try {
      localStorage.removeItem(cloudPasswordStorageKey(username));
    } catch {
      // Ignore; storage may be unavailable in some contexts.
    }
  }

  const hasSavedCloudPassword = computed(() => {
    const normalized = normalizeUsername(cloudUsername.value);
    if (!normalized) return false;
    try {
      const stored = localStorage.getItem(cloudPasswordStorageKey(normalized)) ?? "";
      return Boolean(stored.trim());
    } catch {
      return Boolean(cloudPassword.value.trim());
    }
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

  let foodDraftSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let weightDraftSaveTimer: ReturnType<typeof setTimeout> | null = null;

  watch(currentFoodLog, () => {
    if (!isCurrentFoodLogDirty.value) {
      if (foodDraftSaveTimer) clearTimeout(foodDraftSaveTimer);
      foodDraftSaveTimer = null;
      return;
    }

    if (foodDraftSaveTimer) clearTimeout(foodDraftSaveTimer);
    foodDraftSaveTimer = setTimeout(() => {
      void saveFoodDraft();
    }, 800);
  });

  watch(currentWeight, () => {
    if (!isCurrentWeightDirty.value) {
      if (weightDraftSaveTimer) clearTimeout(weightDraftSaveTimer);
      weightDraftSaveTimer = null;
      return;
    }

    if (weightDraftSaveTimer) clearTimeout(weightDraftSaveTimer);
    weightDraftSaveTimer = setTimeout(() => {
      void saveWeightDraft();
    }, 800);
  });
  const displayEntries = computed(() =>
    entries.value.map((entry) =>
      entry.date === selectedDate.value && isCurrentFoodLogDirty.value
        ? {
            ...entry,
            nutritionSnapshot: null,
            analysisStale: true,
            aiStatus: "idle" as const,
            aiError: null,
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
	        : {
	          observedTdee: null,
	          observedFromDate: null,
	          observedToDate: null,
	          observedValidEntryCount: 0,
	          observedDaySpanDays: null,
	          observedReason: "insufficient_entries" as const,
	          observedMinEntries: 4,
	          observedMinDays: 7,
	          formulaTdeeAverage: null,
	          formulaBreakdown: {},
	          formulaWeight: null,
          formulaWeightSource: null,
          activityMultiplier: null,
          selectedEquation: "mifflinStJeor" as const,
          selectedValue: null,
          targetWeight: null,
          targetTdee: null,
          lastComputedAt: "",
        },
  );
  const weightPoints = computed(() =>
    displayEntries.value
      .filter((entry) => entry.weight !== null)
      .map((entry) => ({ x: chartDayTimestamp(entry.date), y: entry.weight })),
  );
  const caloriePoints = computed(() =>
    displayEntries.value
      .filter((entry) => resolvedDailyCalories(entry) !== null)
      .map((entry) => ({
        x: chartDayTimestamp(entry.date),
        y: resolvedDailyCalories(entry),
      })),
  );
  const nutritionInsights = computed(() =>
    profile.value
      ? buildNutritionInsights(
          displayEntries.value,
          profile.value,
          selectedDate.value,
          tdee.value.observedTdee,
          locale.value,
        )
      : {
          micronutrients: {
            anchorDate: selectedDate.value,
            analyzedDays7d: 0,
            analyzedDays30d: 0,
            likelyLowCount7d: 0,
            likelyLowCount30d: 0,
            items: [],
          },
          macros: [],
          averageProteinPerKg7d: null,
          averageProteinPerKg30d: null,
          averageCaloriesVsObservedTdee7d: null,
          calorieConsistency7d: null,
          topFoods30d: [],
        },
  );
  const deducedWeight = computed(() =>
    deducedWeightFromEntries(displayEntries.value, selectedDate.value),
  );
  const estimatedLeanWeight = computed(() => {
    const weight = profile.value?.estimatedWeight;
    const bodyFat = profile.value?.bodyFat;
    if (weight == null || bodyFat == null || weight <= 0 || bodyFat < 0 || bodyFat >= 100) {
      return null;
    }

    return Math.round(weight * (1 - bodyFat / 100) * 10) / 10;
  });
  function syncChrome() {
    const direction = localeDirection(locale.value);
    syncI18nLocale(locale.value);
    document.documentElement.lang = locale.value;
    document.documentElement.dir = direction;
    document.body.dir = direction;
    document.body.style.direction = direction;
    applyTheme(themeMode.value);
  }

  async function refreshState() {
    entries.value = await listEntries();
    const savedProfile = await getProfile();
    profile.value = savedProfile ?? (await ensureDefaultProfile(locale.value, themeMode.value));
    loadSelectedEntry();
  }

  async function persistDraftsForDate(date: string) {
    const savedEntry = findEntryByDate(entries.value, date);
    const savedFoodLog = savedEntry?.foodLogText ?? "";
    const foodLogDirty = currentFoodLog.value.trim() !== savedFoodLog.trim();

    const rawWeight = currentWeight.value;
    const parsed = rawWeight.trim() ? Number(rawWeight) : null;
    const normalizedWeight = parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    const savedWeight = savedEntry?.weight ?? null;
    const weightDirty = normalizedWeight !== savedWeight;

    if (!foodLogDirty && !weightDirty) {
      return;
    }

    const update: Parameters<typeof upsertDailyEntry>[0] = { date };
    if (foodLogDirty) {
      update.foodLogText = currentFoodLog.value;
    }
    if (weightDirty) {
      update.weight = normalizedWeight;
    }

    await autoSave.runAutoSave(async () => {
      await upsertDailyEntry(update);
      entries.value = await listEntries();
    }, "today.persistDrafts");

    if (foodLogDirty) scheduleCloudPush("today.foodLog");
    if (weightDirty) scheduleCloudPush("today.weight");
  }

  function loadSelectedEntry() {
    const draft = dailyEntryDraft(findEntryByDate(entries.value, selectedDate.value));
    currentFoodLog.value = draft.foodLogText;
    currentWeight.value = draft.weight;
  }

  async function onLocaleChange(nextLocale: AppLocale) {
    locale.value = nextLocale;
    localStorage.setItem(DASHBOARD_STORAGE_KEYS.locale, nextLocale);
    localizeBuiltinProviderOptions(nextLocale);
    ensureProviderOption(provider.value, nextLocale);
    providerOptions.value = listProviderOptions(nextLocale);
    if (!profile.value) return;
    await autoSave.runAutoSave(async () => {
      profile.value = { ...profile.value!, locale: locale.value };
      await saveProfile(profile.value);
    }, "settings.locale");
    scheduleCloudPush("settings.locale");
  }

  async function onThemeChange(nextTheme: ThemeMode) {
    themeMode.value = nextTheme;
    localStorage.setItem(DASHBOARD_STORAGE_KEYS.themeMode, nextTheme);
    if (!profile.value) return;
    await autoSave.runAutoSave(async () => {
      profile.value = { ...profile.value!, themeMode: themeMode.value };
      await saveProfile(profile.value);
    }, "settings.theme");
    scheduleCloudPush("settings.theme");
  }

  async function onProviderChange(nextProvider: string) {
    ensureProviderOption(nextProvider, locale.value);
    provider.value = nextProvider;
    localStorage.setItem(DASHBOARD_STORAGE_KEYS.aiModel, nextProvider);
    localStorage.setItem(DASHBOARD_STORAGE_KEYS.aiModelUserSet, "1");
    if (!profile.value) return;
    await autoSave.runAutoSave(async () => {
      profile.value = { ...profile.value!, aiModel: nextProvider };
      await saveProfile(profile.value);
    }, "settings.provider");
    providerOptions.value = listProviderOptions(locale.value);
    scheduleCloudPush("settings.provider");
  }

  async function saveWeightDraft() {
    const rawWeight = currentWeight.value;
    await autoSave.runAutoSave(async () => {
      const parsed = rawWeight.trim() ? Number(rawWeight) : null;
      const normalizedWeight =
        parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      await upsertDailyEntry({
        date: selectedDate.value,
        weight: normalizedWeight,
      });
      await refreshState();
      currentWeight.value = rawWeight;
    }, "today.weight");
    scheduleCloudPush("today.weight");
  }

  async function saveFoodDraft() {
    await autoSave.runAutoSave(async () => {
      await upsertDailyEntry({
        date: selectedDate.value,
        foodLogText: currentFoodLog.value,
      });
      await refreshState();
    }, "today.foodLog");
    scheduleCloudPush("today.foodLog");
  }

  async function saveHistoryCalories(date: string, calories: number | null) {
    await autoSave.runAutoSave(async () => {
      await upsertDailyEntry({
        date,
        manualCalories: calories,
      });
      await refreshState();
    }, `history.calories.${date}`);
    scheduleCloudPush(`history.calories.${date}`);
  }

  async function saveProfileDraft(nextProfile?: Profile) {
    const profileToSave = nextProfile ?? profile.value;
    if (!profileToSave) return;
    await autoSave.runAutoSave(async () => {
      profile.value = profileToSave;
      await saveProfile(profileToSave);
    }, "constants.profile");
    scheduleCloudPush("constants.profile");
  }

  async function saveActivityPrompt(activityPrompt: string) {
    if (!profile.value) return;
    await autoSave.runAutoSave(async () => {
      profile.value = { ...profile.value!, activityPrompt };
      await saveProfile(profile.value);
    }, "constants.profile.activityPrompt");
    scheduleCloudPush("constants.profile.activityPrompt");
  }

  async function saveTdeeEquation(tdeeEquation: TdeeEquation) {
    if (!profile.value) return;
    await autoSave.runAutoSave(async () => {
      profile.value = { ...profile.value!, tdeeEquation };
      await saveProfile(profile.value);
    }, "constants.profile.tdeeEquation");
    scheduleCloudPush("constants.profile.tdeeEquation");
  }

  async function saveFoodInstructions(foodInstructions: string) {
    if (!profile.value) return;
    await autoSave.runAutoSave(async () => {
      profile.value = { ...profile.value!, foodInstructions };
      await saveProfile(profile.value);
    }, "constants.foodInstructions");
    scheduleCloudPush("constants.foodInstructions");
  }

  async function saveAiKey(providerKey: keyof StoredAiKeys, value: string) {
    await autoSave.runAutoSave(async () => {
      aiKeys.value = { ...aiKeys.value, [providerKey]: value };
      saveStoredAiKeys(aiKeys.value);
      await saveStoredAiKeysToDb(aiKeys.value);
    }, `credentials.${providerKey}`);
    // Keys are stored separately from the IndexedDB backup; cloud sync can encrypt them
    // only when a passphrase is provided.
    scheduleCloudPush(`credentials.${providerKey}`);
  }

  function clearNotice() {
    notice.value = "";
  }

  const analysis = useAnalysisFlow({
    profile,
    provider,
    currentFoodLog,
    selectedDate,
    refreshState,
    saveFoodDraft,
  });

  const corrections = useFoodCorrectionState({
    profile,
    currentEntry,
    provider,
    selectedDate,
    refreshState,
    flushPendingAnalysis: analysis.flushPendingAnalysis,
    setNotice: (value) => {
      notice.value = value;
    },
  });

  const dataTransfer = useDataTransferState(refreshState);

  function autoExportFilename(date: string) {
    const day = localIsoDate();
    return `calorie-tracker-backup-${day}-after-${date}.json`;
  }

  type CloudEncryptedEnvelopeV1 = { kind: "encrypted-v1"; box: EncryptedSecretBoxV1 };
  type CloudDecodedBlob = { payload: ExportedAppData; aiKeys?: StoredAiKeys };

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

  function toArray<T>(value: unknown): T[] {
    if (!value) return [];
    if (Array.isArray(value)) return value as T[];
    // Common loose legacy shape: object keyed by id/date.
    if (typeof value === "object") return Object.values(value as Record<string, T>);
    return [];
  }

  function normalizeExportedAppDataLoose(raw: unknown): ExportedAppData {
    const obj = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null) ?? {};

    // Some buggy/legacy exports omitted these keys.
    const schemaVersion: "1" = "1";
    const exportedAt =
      typeof obj.exportedAt === "string" && obj.exportedAt ? obj.exportedAt : new Date().toISOString();

    const profile = toArray<Profile>(obj.profile);
    const dailyEntries =
      toArray<DailyEntry>(obj.dailyEntries).length > 0
        ? toArray<DailyEntry>(obj.dailyEntries)
        : toArray<DailyEntry>(obj.entries); // legacy key
    const foodRules = toArray<import("../types").FoodRule>(obj.foodRules);
    const syncQueue = toArray<import("../types").SyncQueueItem>(obj.syncQueue);

    const encryptedSecrets =
      obj.encryptedSecrets && typeof obj.encryptedSecrets === "object"
        ? (obj.encryptedSecrets as ExportedAppData["encryptedSecrets"])
        : undefined;

    return {
      schemaVersion,
      exportedAt,
      profile,
      dailyEntries,
      foodRules,
      syncQueue,
      encryptedSecrets,
    };
  }

  function parseLegacyCloudPayload(raw: unknown): ExportedAppData {
    // Backward compatible: some older builds stored `{ payload, secrets }` in the `data` column.
    if (raw && typeof raw === "object" && "payload" in raw) {
      const obj = raw as { payload?: unknown };
      if (obj.payload && typeof obj.payload === "object") {
        return normalizeExportedAppDataLoose(obj.payload);
      }
    }
    if (raw && typeof raw === "object") {
      return normalizeExportedAppDataLoose(raw);
    }
    throw new Error("Cloud data format is not recognized.");
  }

  function mergeStoredAiKeys(localKeys: StoredAiKeys, remoteKeys?: StoredAiKeys): StoredAiKeys {
    if (!remoteKeys) return localKeys;
    return {
      gemini: remoteKeys.gemini?.trim() ? remoteKeys.gemini : localKeys.gemini,
      deepseek: remoteKeys.deepseek?.trim() ? remoteKeys.deepseek : localKeys.deepseek,
      kimi: remoteKeys.kimi?.trim() ? remoteKeys.kimi : localKeys.kimi,
      groq: remoteKeys.groq?.trim() ? remoteKeys.groq : localKeys.groq,
    };
  }

  async function decodeCloudBlob(raw: unknown, secret: string): Promise<CloudDecodedBlob> {
    if (isEncryptedEnvelope(raw)) {
      const decrypted = await decryptJsonWithPassphrase<{ payload: ExportedAppData; aiKeys: StoredAiKeys }>(
        raw.box,
        secret,
      );
      return { payload: normalizeExportedAppDataLoose(decrypted.payload), aiKeys: decrypted.aiKeys };
    }

    if (isEncryptedSecretBox(raw)) {
      const decrypted = await decryptJsonWithPassphrase<{ payload: ExportedAppData; aiKeys: StoredAiKeys }>(raw, secret);
      return { payload: normalizeExportedAppDataLoose(decrypted.payload), aiKeys: decrypted.aiKeys };
    }

    const payload = parseLegacyCloudPayload(raw);
    if (payload.encryptedSecrets?.aiKeys) {
      const decryptedKeys = await decryptJsonWithPassphrase<StoredAiKeys>(payload.encryptedSecrets.aiKeys, secret);
      return { payload, aiKeys: decryptedKeys };
    }

    return { payload };
  }

  async function encodeCloudBlob(payload: ExportedAppData, secret: string): Promise<CloudEncryptedEnvelopeV1> {
    const box = await encryptJsonWithPassphrase({ payload, aiKeys: aiKeys.value }, secret);
    return { kind: "encrypted-v1", box };
  }

  async function cloudSyncNow(options?: { backupBeforePull?: boolean; username?: string; password?: string }) {
    if (cloudMode.value !== "cloud") {
      cloudStatus.value = "idle";
      cloudLastSyncedAt.value = "";
      cloudError.value = "";
      return;
    }

    const username = normalizeUsername(options?.username ?? cloudUsername.value);
    if (!username) {
      cloudStatus.value = "failed";
      cloudError.value = "";
      return;
    }
    if (!isUsernameValid(username)) {
      cloudStatus.value = "failed";
      cloudError.value = "";
      return;
    }

    if (!supabaseConfigured.value) {
      cloudStatus.value = "failed";
      cloudError.value = "";
      return;
    }

    if (!options?.password?.trim() && !cloudPassword.value.trim()) {
      loadCloudPasswordFromStorage(username);
    }

    const secret = getCloudSecret(username, options?.password);
    if (!secret) {
      cloudStatus.value = "failed";
      cloudError.value = "Missing cloud password.";
      return;
    }

    isCloudBusy.value = true;
    cloudIsSyncing.value = true;
    cloudStatus.value = "idle";
    cloudError.value = "";
    try {
      // Ensure the current UI draft is persisted before snapshotting local state for the merge.
      if (isCurrentFoodLogDirty.value) {
        await saveFoodDraft();
      }

      const localBefore = await exportAppData();
      const remote = await fetchUserBlob(username);
      if (!remote.ok) {
        throw new Error(remote.error);
      }

      let remotePayload: ExportedAppData | null = null;
      if (remote.data?.raw) {
        try {
          const decoded = await decodeCloudBlob(remote.data.raw, secret);
          remotePayload = decoded.payload;
          aiKeys.value = mergeStoredAiKeys(aiKeys.value, decoded.aiKeys);
          saveStoredAiKeys(aiKeys.value);
          await saveStoredAiKeysToDb(aiKeys.value);
        } catch {
          throw new Error("Bad cloud password.");
        }
      }

      // If we got here, the password was valid (or there was nothing to decrypt yet).
      if (options?.password?.trim()) {
        cloudPassword.value = options.password;
        saveCloudPasswordToStorage(username, options.password);
      }

      // Two-way merge: keep newer daily entries on either side.
      const merged = mergeExportedAppData(localBefore, remotePayload);
      // Defensive: never let a cloud login wipe local data.
      if (localBefore.dailyEntries.length > 0 && merged.dailyEntries.length === 0) {
        merged.dailyEntries = localBefore.dailyEntries;
      }
      if (localBefore.profile.length > 0 && merged.profile.length === 0) {
        merged.profile = localBefore.profile;
      }
      if (localBefore.foodRules.length > 0 && merged.foodRules.length === 0) {
        merged.foodRules = localBefore.foodRules;
      }

      if (remotePayload && options?.backupBeforePull !== false) {
        // Backup the local copy before we replace local state with a merged copy.
        await dataTransfer.exportData({
          filename: `calorie-tracker-backup-${localIsoDate()}-before-cloud-merge-${username}.json`,
        });
      }

      await importAppData(merged);
      await refreshState();

      // After importing cloud data, ensure UI settings reflect the imported profile.
      if (profile.value) {
        // Keep local storage aligned so reloads preserve the cloud state.
        locale.value = profile.value.locale;
        localStorage.setItem(DASHBOARD_STORAGE_KEYS.locale, locale.value);
        themeMode.value = profile.value.themeMode;
        localStorage.setItem(DASHBOARD_STORAGE_KEYS.themeMode, themeMode.value);
        provider.value = normalizeProvider(profile.value.aiModel);
        localStorage.setItem(DASHBOARD_STORAGE_KEYS.aiModel, provider.value);
        localizeBuiltinProviderOptions(locale.value);
        ensureProviderOption(provider.value, locale.value);
        providerOptions.value = listProviderOptions(locale.value);
        syncChrome();
      }

      const pushed = await upsertUserBlob(username, await encodeCloudBlob(merged, secret));
      if (!pushed.ok) {
        throw new Error(pushed.error);
      }

      cloudStatus.value = "synced";
      cloudLastSyncedAt.value = new Date().toLocaleString();
      cloudConfirmedUsername.value = username;
      localStorage.setItem(DASHBOARD_STORAGE_KEYS.cloudConfirmedUsername, username);
      cloudUsername.value = username;
      localStorage.setItem(DASHBOARD_STORAGE_KEYS.cloudUsername, username);
      if (options?.password) {
        cloudPassword.value = options.password;
        saveCloudPasswordToStorage(username, options.password);
      } else if (!cloudPassword.value.trim()) {
        loadCloudPasswordFromStorage(username);
      }
    } catch (err) {
      cloudStatus.value = "failed";
      const message = err instanceof Error ? err.message : String(err);
      cloudError.value = message;
      if (message === "Bad cloud password.") {
        cloudPassword.value = "";
        removeCloudPasswordFromStorage(username);
        cloudConfirmedUsername.value = "";
        localStorage.removeItem(DASHBOARD_STORAGE_KEYS.cloudConfirmedUsername);
      }
    } finally {
      isCloudBusy.value = false;
      cloudIsSyncing.value = false;
    }
  }

  function canAutoCloudSync() {
    if (cloudMode.value !== "cloud") return false;
    if (!supabaseConfigured.value) return false;
    if (typeof navigator !== "undefined" && !navigator.onLine) return false;
    const normalized = normalizeUsername(cloudUsername.value);
    return cloudConfirmedUsername.value === normalized && isUsernameValid(normalized) && Boolean(cloudPassword.value);
  }

  function scheduleCloudPush(_reason: string) {
    if (!canAutoCloudSync()) return;
    cloudPushPending = true;
    if (cloudPushTimer) clearTimeout(cloudPushTimer);
    cloudPushTimer = setTimeout(() => {
      void runCloudPush();
    }, 900);
  }

  async function runCloudPush() {
    if (!canAutoCloudSync()) {
      cloudPushPending = false;
      return;
    }
    if (!cloudPushPending) return;
    if (isCloudBusy.value) {
      // Try again after the current sync finishes.
      cloudPushTimer = setTimeout(() => void runCloudPush(), 1000);
      return;
    }

    try {
      cloudPushPending = false;
      const normalized = normalizeUsername(cloudUsername.value);
      const secret = getCloudSecret(normalized);
      if (!secret) return;
      isCloudBusy.value = true;
      cloudIsSyncing.value = true;
      cloudError.value = "";

      const local = await exportAppData();
      const remote = await fetchUserBlob(normalized);
      let remotePayload: ExportedAppData | null = null;
      if (remote.ok && remote.data?.raw) {
        // If this fails (wrong password), don't overwrite cloud with garbage.
        const decoded = await decodeCloudBlob(remote.data.raw, secret);
        remotePayload = decoded.payload;
        aiKeys.value = mergeStoredAiKeys(aiKeys.value, decoded.aiKeys);
        saveStoredAiKeys(aiKeys.value);
        await saveStoredAiKeysToDb(aiKeys.value);
      }
      const merged = mergeExportedAppData(local, remotePayload);

      const pushed = await upsertUserBlob(normalized, await encodeCloudBlob(merged, secret));
      if (!pushed.ok) throw new Error(pushed.error);
      cloudStatus.value = "synced";
      cloudLastSyncedAt.value = new Date().toLocaleString();
    } catch (err) {
      cloudStatus.value = "failed";
      cloudError.value = err instanceof Error ? err.message : String(err);
    } finally {
      isCloudBusy.value = false;
      cloudIsSyncing.value = false;
    }
  }

  function setCloudMode(next: "offline" | "cloud") {
    cloudMode.value = next;
    localStorage.setItem(DASHBOARD_STORAGE_KEYS.cloudMode, next);
  }

  function setCloudUsername(next: string) {
    cloudUsername.value = next;
    localStorage.setItem(DASHBOARD_STORAGE_KEYS.cloudUsername, next);
    const normalized = normalizeUsername(next);
    if (cloudConfirmedUsername.value && cloudConfirmedUsername.value !== normalized) {
      cloudStatus.value = "idle";
      cloudLastSyncedAt.value = "";
      cloudError.value = "";
    }
    if (normalized && !cloudPassword.value.trim()) {
      loadCloudPasswordFromStorage(normalized);
    }
  }

  function cloudLogout() {
    cloudPassword.value = "";
    cloudConfirmedUsername.value = "";
    localStorage.removeItem(DASHBOARD_STORAGE_KEYS.cloudConfirmedUsername);
    cloudStatus.value = "idle";
    cloudLastSyncedAt.value = "";
    cloudError.value = "";
    // Keep the typed username for convenience, but switch to offline to stop cloud pushes.
    setCloudMode("offline");
  }

  async function analyzeCurrentDay() {
    await analysis.analyzeCurrentDay();
    const finished = findEntryByDate(entries.value, selectedDate.value);
    if (finished?.aiStatus === "done" && finished.nutritionSnapshot) {
      // Best-effort: some browsers may block non-user-gesture downloads.
      await dataTransfer.exportData({ filename: autoExportFilename(selectedDate.value) });
      scheduleCloudPush("analysis.done");
    }
  }

  watch(
    selectedDate,
    async (nextDate, previousDate) => {
      if (previousDate && previousDate !== nextDate) {
        if (foodDraftSaveTimer) clearTimeout(foodDraftSaveTimer);
        foodDraftSaveTimer = null;
        if (weightDraftSaveTimer) clearTimeout(weightDraftSaveTimer);
        weightDraftSaveTimer = null;

        await persistDraftsForDate(previousDate);
      }

      loadSelectedEntry();
    },
    { flush: "sync" },
  );
  watch(locale, syncChrome);
  watch(themeMode, syncChrome);

  watch(
    () => aiKeys.value.gemini,
    async (key) => {
      const effectiveKey = (key || import.meta.env.VITE_GEMINI_API_KEY || "").trim();
      if (!effectiveKey) {
        // No key: keep model select disabled and empty to avoid misleading options.
        providerOptions.value = [];
        return;
      }
      try {
        const geminiOptions = await fetchGeminiModelOptions(effectiveKey, locale.value);
        syncGeminiProviderOptions(geminiOptions);
        const detectedIds = new Set(geminiOptions.map((option) => option.id));
        const suggested = suggestLatestStableFlash(geminiOptions);
        if (suggested) {
          try {
            localStorage.setItem(DASHBOARD_STORAGE_KEYS.geminiLatestModel, suggested);
          } catch {
            // ignore
          }
        }
        const userPicked = localStorage.getItem(DASHBOARD_STORAGE_KEYS.aiModelUserSet) === "1";
        const shouldNormalizeToLatest =
          provider.value.startsWith("gemini-") && !detectedIds.has(provider.value);

        // If the saved model is not part of the latest-only API list, or the user never picked,
        // normalize to the preferred latest Flash model.
        if ((shouldNormalizeToLatest || !userPicked) && suggested && provider.value !== suggested) {
          provider.value = suggested;
          localStorage.setItem(DASHBOARD_STORAGE_KEYS.aiModel, suggested);
          if (shouldNormalizeToLatest) {
            localStorage.removeItem(DASHBOARD_STORAGE_KEYS.aiModelUserSet);
          }
          if (profile.value) {
            profile.value = { ...profile.value, aiModel: suggested };
            await saveProfile(profile.value);
          }
        }

        ensureProviderOption(provider.value, locale.value);
        providerOptions.value = listProviderOptions(locale.value);
      } catch {
        localizeBuiltinProviderOptions(locale.value);
        ensureProviderOption(provider.value, locale.value);
        providerOptions.value = listProviderOptions(locale.value);
      }
    },
    { immediate: true },
  );

  const didInitCloudSync = ref(false);

  async function maybeInitCloudSync() {
    if (didInitCloudSync.value) return;
    if (cloudMode.value !== "cloud") return;
    if (!supabaseConfigured.value) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const username = normalizeUsername(cloudConfirmedUsername.value || cloudUsername.value);
    if (!isUsernameValid(username)) return;
    if (!cloudPassword.value.trim()) return;

    didInitCloudSync.value = true;
    await cloudSyncNow({ username, password: cloudPassword.value, backupBeforePull: false });
  }

  onMounted(async () => {
    profile.value = await ensureDefaultProfile(locale.value, themeMode.value);
    provider.value = normalizeProvider(readStoredProvider() ?? profile.value.aiModel);
    locale.value = readStoredLocale() ?? profile.value.locale;
    localizeBuiltinProviderOptions(locale.value);
    ensureProviderOption(provider.value, locale.value);
    providerOptions.value = listProviderOptions(locale.value);
    themeMode.value = readStoredThemeMode() ?? profile.value.themeMode;
    profile.value = {
      ...profile.value,
      aiModel: provider.value,
      locale: locale.value,
      themeMode: themeMode.value,
    };
    // If localStorage was cleared but IndexedDB still has keys, restore them.
    if (!aiKeys.value.gemini.trim()) {
      const dbKeys = await getStoredAiKeysFromDb();
      if (dbKeys?.gemini?.trim()) {
        aiKeys.value = mergeStoredAiKeys(aiKeys.value, dbKeys);
        saveStoredAiKeys(aiKeys.value);
      }
    }
    syncChrome();
    await refreshState();

    const existingCloudUser = normalizeUsername(cloudConfirmedUsername.value || cloudUsername.value);
    if (existingCloudUser && !cloudPassword.value.trim()) {
      loadCloudPasswordFromStorage(existingCloudUser);
    }

    await maybeInitCloudSync();
    void analysis.flushPendingAnalysis(false);
  });

  function suggestLatestStableFlash(options: AiProviderOption[]) {
    // Prefer the newest API-reported `latest` Flash, then Flash-Lite as fallback.
    const candidates = options
      .map((o) => o.id)
      .filter((id) => id.includes("latest"));
    const flash = candidates.find((id) => id.includes("-flash") && !id.includes("lite") && !id.includes("preview"));
    if (flash) return flash;
    const flashLite = candidates.find((id) => id.includes("-flash-lite") && !id.includes("preview"));
    if (flashLite) return flashLite;
    if (!candidates.length) return null;
    return candidates[0] ?? null;
  }

  function getCloudSecret(username: string, passwordOverride?: string) {
    const password = (passwordOverride ?? cloudPassword.value).trim();
    if (!password) return "";
    return `${normalizeUsername(username)}::${password}`;
  }

  function handleOnline() {
    void analysis.flushPendingAnalysis(false);
  }

  onMounted(() => {
    window.addEventListener("online", handleOnline);
  });

  onUnmounted(() => {
    window.removeEventListener("online", handleOnline);
    if (foodDraftSaveTimer) clearTimeout(foodDraftSaveTimer);
    if (weightDraftSaveTimer) clearTimeout(weightDraftSaveTimer);
  });

  return {
    locale,
    themeMode,
    profile,
    entries: displayEntries,
    selectedDate,
    currentFoodLog,
    currentWeight,
    provider,
    providerOptions,
    aiKeys,
    isAnalyzing: analysis.isAnalyzing,
    isAutoSaving: autoSave.isAutoSaving,
    isSavingWeight: autoSave.isSavingWeight,
    isSavingFoodLog: autoSave.isSavingFoodLog,
    isSavingFoodInstructions: autoSave.isSavingFoodInstructions,
    isSavingActivityPrompt: autoSave.isSavingActivityPrompt,
    isSavingTdeeEquation: autoSave.isSavingTdeeEquation,
    isSavingLocale: autoSave.isSavingLocale,
    isSavingTheme: autoSave.isSavingTheme,
    isSavingProvider: autoSave.isSavingProvider,
    savingAiKeyField: autoSave.savingAiKeyField,
    analyzeIssue: analysis.analyzeIssue,
    currentEntry,
    tdee,
    nutritionInsights,
    deducedWeight,
    estimatedLeanWeight,
    weightPoints,
    caloriePoints,
    savingHistoryCalories: autoSave.savingHistoryCalories,
    notice,
    cloudMode,
    cloudUsername,
    cloudConfirmedUsername,
    hasSavedCloudPassword,
    isCloudBusy,
    isCloudSyncing: cloudIsSyncing,
    cloudStatus,
    cloudLastSyncedAt,
    cloudError,
    supabaseConfigured,
    dataTransferStatus: dataTransfer.dataTransferStatus,
    isTransferringData: dataTransfer.isTransferringData,
    statusLabel,
    loadSelectedEntry,
    onLocaleChange,
    onThemeChange,
    onProviderChange,
    saveWeightDraft,
    saveFoodDraft,
    saveHistoryCalories,
    analyzeCurrentDay,
    saveProfileDraft,
    saveActivityPrompt,
    saveTdeeEquation,
    saveFoodInstructions,
    saveAiKey,
    saveFoodCorrection: async (
      foodId: string,
      foodName: string,
      grams: number | null,
      calories: number | null,
      caloriesPer100g: number | null,
    ) => {
      await corrections.saveFoodCorrection(foodId, foodName, grams, calories, caloriesPer100g);
      scheduleCloudPush("nutrition.correction");
    },
    exportData: dataTransfer.exportData,
    importData: dataTransfer.importData,
    setCloudMode,
    setCloudUsername,
    cloudLogout,
    cloudSyncNow,
    clearNotice,
  };
}
