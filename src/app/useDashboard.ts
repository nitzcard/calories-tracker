import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { getStoredAiKeys, saveStoredAiKeys, type StoredAiKeys } from "../ai/credentials";
import { listProviderOptions } from "../ai/registry";
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
      await upsertDailyEntry({
        date: selectedDate.value,
        weight: currentWeight.value ? Number(currentWeight.value) : null,
      });
      await refreshState();
      currentWeight.value = rawWeight;
    }, "today.weight");
  }

  async function saveFoodDraft() {
    await autoSave.runAutoSave(async () => {
      await upsertDailyEntry({
        date: selectedDate.value,
        foodLogText: currentFoodLog.value,
      });
      await refreshState();
    }, "today.foodLog");
  }

  async function saveHistoryCalories(date: string, calories: number | null) {
    await autoSave.runAutoSave(async () => {
      await upsertDailyEntry({
        date,
        manualCalories: calories,
      });
      await refreshState();
    }, `history.calories.${date}`);
  }

  async function saveProfileDraft(nextProfile?: Profile) {
    const profileToSave = nextProfile ?? profile.value;
    if (!profileToSave) return;
    await autoSave.runAutoSave(async () => {
      profile.value = profileToSave;
      await saveProfile(profileToSave);
    }, "constants.profile");
  }

  async function saveActivityPrompt(activityPrompt: string) {
    if (!profile.value) return;
    await autoSave.runAutoSave(async () => {
      profile.value = { ...profile.value!, activityPrompt };
      await saveProfile(profile.value);
    }, "constants.profile.activityPrompt");
  }

  async function saveTdeeEquation(tdeeEquation: TdeeEquation) {
    if (!profile.value) return;
    await autoSave.runAutoSave(async () => {
      profile.value = { ...profile.value!, tdeeEquation };
      await saveProfile(profile.value);
    }, "constants.profile.tdeeEquation");
  }

  async function saveFoodInstructions(foodInstructions: string) {
    if (!profile.value) return;
    await autoSave.runAutoSave(async () => {
      profile.value = { ...profile.value!, foodInstructions };
      await saveProfile(profile.value);
    }, "constants.foodInstructions");
  }

  async function saveAiKey(providerKey: keyof StoredAiKeys, value: string) {
    await autoSave.runAutoSave(async () => {
      aiKeys.value = { ...aiKeys.value, [providerKey]: value };
      saveStoredAiKeys(aiKeys.value);
    }, `credentials.${providerKey}`);
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

  watch(selectedDate, loadSelectedEntry);
  watch(locale, syncChrome);
  watch(themeMode, syncChrome);

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
    analyzeCurrentDay: analysis.analyzeCurrentDay,
    saveProfileDraft,
    saveActivityPrompt,
    saveTdeeEquation,
    saveFoodInstructions,
    saveAiKey,
    saveFoodCorrection: corrections.saveFoodCorrection,
    exportData: dataTransfer.exportData,
    importData: dataTransfer.importData,
    clearNotice,
  };
}
