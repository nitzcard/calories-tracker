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
import { decryptJsonWithPassphrase, encryptJsonWithPassphrase } from "../cloud/crypto";
import { listProviderOptions, syncGeminiProviderOptions } from "../ai/registry";
import { fetchGeminiModelOptions } from "../ai/gemini-models";
import { mergeExportedAppData } from "../cloud/merge";

const today = new Date().toISOString().slice(0, 10);

export function useDashboard() {
  const locale = ref<AppLocale>(readStoredLocale() ?? detectLocale());
  const themeMode = ref<ThemeMode>(readStoredThemeMode() ?? detectThemeMode());
  const profile = ref<Profile | null>(null);
  const entries = ref<DailyEntry[]>([]);
  const selectedDate = ref(today);
  const currentFoodLog = ref("");
  const currentWeight = ref("");
  const provider = ref(normalizeProvider(readStoredProvider()));
  const providerOptions = ref<AiProviderOption[]>(listProviderOptions());
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
  const cloudPassphrase = ref("");
  const cloudIsSyncing = ref(false);
  let cloudPushTimer: ReturnType<typeof setTimeout> | null = null;
  let cloudPushPending = false;

  function normalizeUsername(value: string) {
    return value.trim().toLowerCase();
  }

  function isUsernameValid(value: string) {
    return normalizeUsername(value).length >= 3;
  }

  const savedCurrentEntry = computed(() =>
    findEntryByDate(entries.value, selectedDate.value),
  );
  const isCurrentFoodLogDirty = computed(() => {
    const savedFoodLog = savedCurrentEntry.value?.foodLogText ?? "";
    return currentFoodLog.value.trim() !== savedFoodLog.trim();
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
    if (savedProfile) {
      profile.value = savedProfile;
    }
    loadSelectedEntry();
  }

  function loadSelectedEntry() {
    const draft = dailyEntryDraft(findEntryByDate(entries.value, selectedDate.value));
    currentFoodLog.value = draft.foodLogText;
    currentWeight.value = draft.weight;
  }

  async function onLocaleChange(nextLocale: AppLocale) {
    locale.value = nextLocale;
    localStorage.setItem(DASHBOARD_STORAGE_KEYS.locale, nextLocale);
    if (!profile.value) return;
    await autoSave.runAutoSave(async () => {
      profile.value = { ...profile.value!, locale: locale.value };
      await saveProfile(profile.value);
    }, "settings.locale");
  }

  async function onThemeChange(nextTheme: ThemeMode) {
    themeMode.value = nextTheme;
    localStorage.setItem(DASHBOARD_STORAGE_KEYS.themeMode, nextTheme);
    if (!profile.value) return;
    await autoSave.runAutoSave(async () => {
      profile.value = { ...profile.value!, themeMode: themeMode.value };
      await saveProfile(profile.value);
    }, "settings.theme");
  }

  async function onProviderChange(nextProvider: string) {
    provider.value = nextProvider;
    localStorage.setItem(DASHBOARD_STORAGE_KEYS.aiModel, nextProvider);
    if (!profile.value) return;
    await autoSave.runAutoSave(async () => {
      profile.value = { ...profile.value!, aiModel: nextProvider };
      await saveProfile(profile.value);
    }, "settings.provider");
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
    const day = new Date().toISOString().slice(0, 10);
    return `calorie-tracker-backup-${day}-after-${date}.json`;
  }

  async function cloudSyncNow(options?: { backupBeforePull?: boolean; username?: string; passphrase?: string }) {
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

    isCloudBusy.value = true;
    cloudIsSyncing.value = true;
    cloudStatus.value = "idle";
    cloudError.value = "";
    try {
      const localBefore = await exportAppData();
      const remote = await fetchUserBlob(username);
      if (!remote.ok) {
        throw new Error(remote.error);
      }

      const remotePayload = remote.data?.payload ?? null;

      // Decrypt keys (best-effort) from remote if present and passphrase is provided.
      if (remotePayload?.encryptedSecrets?.aiKeys) {
        const passphrase = (options?.passphrase ?? cloudPassphrase.value).trim();
        if (passphrase) {
          try {
            const decrypted = await decryptJsonWithPassphrase<StoredAiKeys>(
              remotePayload.encryptedSecrets.aiKeys,
              passphrase,
            );
            aiKeys.value = {
              gemini: decrypted.gemini ?? "",
              deepseek: decrypted.deepseek ?? "",
              kimi: decrypted.kimi ?? "",
              groq: decrypted.groq ?? "",
            };
            saveStoredAiKeys(aiKeys.value);
          } catch {
            // Ignore bad passphrase: keep local keys.
          }
        }
      }

      // Two-way merge: keep newer daily entries on either side.
      const merged = mergeExportedAppData(localBefore, remotePayload);

      const passphrase = (options?.passphrase ?? cloudPassphrase.value).trim();
      if (passphrase) {
        merged.encryptedSecrets = {
          ...(merged.encryptedSecrets ?? {}),
          aiKeys: await encryptJsonWithPassphrase(aiKeys.value, passphrase),
        };
      }

      if (remotePayload && options?.backupBeforePull !== false) {
        // Backup the local copy before we replace local state with a merged copy.
        await dataTransfer.exportData({
          filename: `calorie-tracker-backup-${new Date().toISOString().slice(0, 10)}-before-cloud-merge-${username}.json`,
        });
      }

      await importAppData(merged);
      await refreshState();

      const pushed = await upsertUserBlob(username, merged);
      if (!pushed.ok) {
        throw new Error(pushed.error);
      }

      cloudStatus.value = "synced";
      cloudLastSyncedAt.value = new Date().toLocaleString();
      cloudConfirmedUsername.value = username;
      localStorage.setItem(DASHBOARD_STORAGE_KEYS.cloudConfirmedUsername, username);
      cloudUsername.value = username;
      localStorage.setItem(DASHBOARD_STORAGE_KEYS.cloudUsername, username);
    } catch (err) {
      cloudStatus.value = "failed";
      cloudError.value = err instanceof Error ? err.message : String(err);
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
    return cloudConfirmedUsername.value === normalized && isUsernameValid(normalized);
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
      isCloudBusy.value = true;
      cloudIsSyncing.value = true;
      cloudError.value = "";

      const local = await exportAppData();
      const remote = await fetchUserBlob(normalized);
      const remotePayload = remote.ok ? remote.data?.payload ?? null : null;
      const merged = mergeExportedAppData(local, remotePayload);

      const passphrase = cloudPassphrase.value.trim();
      if (passphrase) {
        merged.encryptedSecrets = {
          ...(merged.encryptedSecrets ?? {}),
          aiKeys: await encryptJsonWithPassphrase(aiKeys.value, passphrase),
        };
      }

      const pushed = await upsertUserBlob(normalized, merged);
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
  }

  function setCloudPassphrase(next: string) {
    cloudPassphrase.value = next;
  }

  async function analyzeCurrentDay() {
    await analysis.analyzeCurrentDay();
    const finished = findEntryByDate(entries.value, selectedDate.value);
    if (finished?.aiStatus === "done" && finished.nutritionSnapshot) {
      // Best-effort: some browsers may block non-user-gesture downloads.
      await dataTransfer.exportData({ filename: autoExportFilename(selectedDate.value) });
      const normalized = normalizeUsername(cloudUsername.value);
      if (
        cloudMode.value === "cloud" &&
        supabaseConfigured.value &&
        cloudConfirmedUsername.value === normalized &&
        isUsernameValid(normalized)
      ) {
        const local = await exportAppData();
        const pushed = await upsertUserBlob(normalized, local);
        if (pushed.ok) {
          cloudStatus.value = "synced";
          cloudLastSyncedAt.value = new Date().toLocaleString();
          cloudError.value = "";
        }
      }
    }
  }

  watch(selectedDate, loadSelectedEntry);
  watch(locale, syncChrome);
  watch(themeMode, syncChrome);

  watch(
    () => aiKeys.value.gemini,
    async (key) => {
      const effectiveKey = (key || import.meta.env.VITE_GEMINI_API_KEY || "").trim();
      if (!effectiveKey) {
        providerOptions.value = listProviderOptions();
        return;
      }
      try {
        const geminiOptions = await fetchGeminiModelOptions(effectiveKey);
        syncGeminiProviderOptions(geminiOptions);
        providerOptions.value = listProviderOptions();
      } catch {
        providerOptions.value = listProviderOptions();
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
    const username = normalizeUsername(cloudConfirmedUsername.value);
    if (!isUsernameValid(username)) return;

    didInitCloudSync.value = true;
    await cloudSyncNow({ username, backupBeforePull: false });
  }

  onMounted(async () => {
    profile.value = await ensureDefaultProfile(locale.value, themeMode.value);
    provider.value = normalizeProvider(readStoredProvider() ?? profile.value.aiModel);
    locale.value = readStoredLocale() ?? profile.value.locale;
    themeMode.value = readStoredThemeMode() ?? profile.value.themeMode;
    profile.value = {
      ...profile.value,
      aiModel: provider.value,
      locale: locale.value,
      themeMode: themeMode.value,
    };
    await saveProfile(profile.value);
    syncChrome();
    await refreshState();
    await maybeInitCloudSync();
    void analysis.flushPendingAnalysis(false);
  });

  function handleOnline() {
    void analysis.flushPendingAnalysis(false);
  }

  onMounted(() => {
    window.addEventListener("online", handleOnline);
  });

  onUnmounted(() => {
    window.removeEventListener("online", handleOnline);
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
    cloudPassphrase,
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
    setCloudPassphrase,
    cloudSyncNow,
    clearNotice,
  };
}
