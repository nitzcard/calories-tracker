<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "./components/base/BasePanel.vue";
import AppHeader from "./components/header/AppHeader.vue";
import JasmineThemePrompt from "./components/JasmineThemePrompt.vue";
import AnalysisSwitchSuggestion from "./components/shared/AnalysisSwitchSuggestion.vue";
import NutritionSummaryPanel from "./components/panels/NutritionSummaryPanel.vue";
import { useDashboard } from "./app/useDashboard";
import { FALLBACK_GEMINI_MODEL, formatGeminiModelLabel } from "./ai/gemini-config";

const MetricChart = defineAsyncComponent(() => import("./components/charts/MetricChart.vue"));
const ApiKeysPanel = defineAsyncComponent(() => import("./components/panels/ApiKeysPanel.vue"));
const CloudSyncPanel = defineAsyncComponent(() => import("./components/panels/CloudSyncPanel.vue"));
const DataTransferPanel = defineAsyncComponent(() => import("./components/panels/DataTransferPanel.vue"));
const HistoryPanel = defineAsyncComponent(() => import("./components/panels/HistoryPanel.vue"));
const InsightsPanel = defineAsyncComponent(() => import("./components/panels/InsightsPanel.vue"));
const ProfilePanel = defineAsyncComponent(() => import("./components/panels/ProfilePanel.vue"));
const TdeeSummaryPanel = defineAsyncComponent(() => import("./components/panels/TdeeSummaryPanel.vue"));
const DailyDeskPanel = defineAsyncComponent(() => import("./components/panels/DailyDeskPanel.vue"));

const dashboard = useDashboard();
const { t } = useI18n();

function readStoredOpen(key: string): boolean | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "0" || raw === "1") return raw === "1";
  } catch {
    // ignore
  }
  return null;
}

function writeStoredOpen(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
}

const PANEL_OPEN_KEYS = {
  appSetup: "panel.open.appSetup",
  constantData: "panel.open.constantData",
} as const;

const {
  locale,
  themeMode,
  profile,
  entries,
  selectedDate,
  currentFoodLog,
  currentWeight,
  provider,
  providerOptions,
  aiKeys,
  dataTransferStatus,
  isAnalyzing,
  showModelSwitchPrompt,
  suggestedModelLabel,
  isAutoSaving,
  isTransferringData,
  isSavingWeight,
  isSavingFoodLog,
  isSavingFoodInstructions,
  isSavingActivityPrompt,
  isSavingTdeeEquation,
  isSavingLocale,
  isSavingTheme,
  isSavingProvider,
  savingAiKeyField,
  analyzeIssue,
  currentEntry,
  tdee,
  nutritionInsights,
  deducedWeight,
  estimatedLeanWeight,
  weightPoints,
  caloriePoints,
  savingHistoryCalories,
  savingHistoryWeight,
  isCalculatingCustomTdee,
  statusLabel,
  onLocaleChange,
  onThemeChange,
  onProviderChange,
  saveWeightDraft,
  saveFoodDraft,
  saveHistoryCalories,
  saveHistoryWeight,
  calculateCustomTdeeWithGemini,
  analyzeCurrentDay,
  acceptSuggestedModelSwitch,
  dismissSuggestedModelSwitch,
  saveProfileDraft,
  saveActivityPrompt,
  saveTdeeEquation,
  saveFoodInstructions,
  saveAiKey,
  saveFoodCorrectionInstruction,
  saveFoodCorrectionInstructionOnly,
  applyFoodCorrectionToCurrentEntry,
	  exportData,
	  importData,
    setAutoBackupAfterAnalyze,
	  cloudMode,
	  cloudUsername,
	  cloudConfirmedUsername,
    autoBackupAfterAnalyze,
    hasSavedCloudPassword,
	  isCloudBusy,
    isCloudSyncing,
	  cloudStatus,
	  cloudLastSyncedAt,
	  cloudError,
	  supabaseConfigured,
	  setCloudMode,
	  setCloudUsername,
    cloudLogout,
	  cloudSyncNow,
	  notice,
	  clearNotice,
	} = dashboard;

const appSetupOpen = ref(readStoredOpen(PANEL_OPEN_KEYS.appSetup) ?? false);
const constantDataOpen = ref(readStoredOpen(PANEL_OPEN_KEYS.constantData) ?? false);
const didInitializePanels = ref(false);
const tdeeHighlightToken = ref(0);
const correctionNoticeToken = ref(0);
const transientToast = ref<{
  kind: "local" | "cloud" | "error";
  message: string;
  action?: { label: string; href: string; onClick?: () => void };
} | null>(null);
let toastTimeout: ReturnType<typeof setTimeout> | null = null;
const ACTIVE_TOAST_MIN_MS = 5000;
const localToastVisibleUntil = ref(0);
const cloudToastVisibleUntil = ref(0);
let localToastHideTimeout: ReturnType<typeof setTimeout> | null = null;
let cloudToastHideTimeout: ReturnType<typeof setTimeout> | null = null;
const isProfileReady = computed(
  () =>
    Boolean(
      profile.value?.age &&
        profile.value?.height &&
        profile.value?.activityPrompt.trim(),
    ),
);
const hasConfiguredGeminiKey = computed(() => Boolean(aiKeys.value.gemini.trim()));
const hasEffectiveGeminiKey = computed(() =>
  Boolean((aiKeys.value.gemini || import.meta.env.VITE_GEMINI_API_KEY || "").trim()),
);
const appSetupEffectiveOpen = computed(() => (hasConfiguredGeminiKey.value ? appSetupOpen.value : true));
const constantDataEffectiveOpen = computed(() => (isProfileReady.value ? constantDataOpen.value : true));
const isJasmineThemeActive = computed(() => themeMode.value === "jasmine");
const averageCalories = computed(() => {
  const ys = (caloriePoints.value ?? [])
    .map((point) => point.y)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!ys.length) return null;
  const sum = ys.reduce((acc, value) => acc + value, 0);
  return Math.round(sum / ys.length);
});
const weightTrendlineLabel = computed(() => {
  const slope = computeTrendlineSlopePerDay(weightPoints.value);
  if (slope === null || !Number.isFinite(slope)) {
    return t("averageWeightChangePerDay");
  }

  // Convert kg/day to g/day and avoid `-0` display while keeping small-but-real slopes visible.
  const slopeGrams = slope * 1000;
  const rounded = Math.round(slopeGrams);
  const normalized = Object.is(rounded, -0) ? 0 : rounded;

  const formatter = new Intl.NumberFormat(locale.value === "he" ? "he-IL" : "en-US", {
    maximumFractionDigits: 0,
  });
  const signedSlope = `${normalized > 0 ? "+" : ""}${formatter.format(normalized)}`;
  const unitPerDay = locale.value === "he" ? `${t("unitG")}/יום` : `${t("unitG")}/day`;
  return `${t("averageWeightChangePerDay")} (${signedSlope} ${unitPerDay})`;
});
const analysisErrorRetryModelId = computed(() => {
  const error = currentEntry.value?.aiError ?? "";
  if (!error || provider.value === FALLBACK_GEMINI_MODEL) return null;

  if (error.includes("(429)") || error.includes("(503)") || error.includes("rate limited") || error.includes("high demand")) {
    return FALLBACK_GEMINI_MODEL;
  }

  return null;
});
const analysisErrorRetryModelLabel = computed(() =>
  analysisErrorRetryModelId.value ? formatGeminiModelLabel(analysisErrorRetryModelId.value) : null,
);

function openFoodRulesFromToast() {
  const panel = document.getElementById("dailyDeskPanel");
  if (panel instanceof HTMLDetailsElement) {
    panel.open = true;
  }

  requestAnimationFrame(() => {
    const textarea = document.getElementById("food-rules-textarea");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.focus();
      textarea.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
}

function computeTrendlineSlopePerDay(points: Array<{ x: number; y: number | null }>) {
  const numeric = points.filter(
    (point): point is { x: number; y: number } =>
      typeof point.y === "number" && Number.isFinite(point.y),
  );
  if (numeric.length < 2) {
    return null;
  }

  // `chartDayTimestamp()` stores ms; normalize to seconds before converting to day offsets.
  const originSec = numeric[0].x > 1e12 ? numeric[0].x / 1000 : numeric[0].x;
  const xs = numeric.map((point) => {
    const xSec = point.x > 1e12 ? point.x / 1000 : point.x;
    return (xSec - originSec) / 86400;
  });
  const ys = numeric.map((point) => point.y);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0);
  const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);

  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function bumpToastVisibility(kind: "local" | "cloud") {
  const nextVisibleUntil = Date.now() + ACTIVE_TOAST_MIN_MS;

  if (kind === "local") {
    localToastVisibleUntil.value = Math.max(localToastVisibleUntil.value, nextVisibleUntil);
    return;
  }

  cloudToastVisibleUntil.value = Math.max(cloudToastVisibleUntil.value, nextVisibleUntil);
}

function scheduleActiveToastHide(kind: "local" | "cloud") {
  const delay = Math.max(
    0,
    (kind === "local" ? localToastVisibleUntil.value : cloudToastVisibleUntil.value) - Date.now(),
  );

  const clear = () => {
    if (kind === "local") {
      if (localToastHideTimeout) {
        clearTimeout(localToastHideTimeout);
      }
      localToastHideTimeout = setTimeout(() => {
        localToastVisibleUntil.value = 0;
        localToastHideTimeout = null;
      }, delay);
      return;
    }

    if (cloudToastHideTimeout) {
      clearTimeout(cloudToastHideTimeout);
    }
    cloudToastHideTimeout = setTimeout(() => {
      cloudToastVisibleUntil.value = 0;
      cloudToastHideTimeout = null;
    }, delay);
  };

  clear();
}

async function applyJasmineThemeFromDialog() {
  await onThemeChange("jasmine");
}

const canAutoCloudSync = computed(() => {
  if (cloudMode.value !== "cloud") return false;
  if (!supabaseConfigured.value) return false;
  if (!cloudConfirmedUsername.value.trim()) return false;
  if (!hasSavedCloudPassword.value) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return true;
});

const activeToasts = computed(() => {
  const items: Array<{
    id: string;
    kind: "local" | "cloud" | "error";
    message: string;
    spinning: boolean;
    action?: { label: string; href: string; onClick?: () => void };
  }> = [];

  const cloudActive = isCloudSyncing.value || cloudToastVisibleUntil.value > Date.now();
  const localActive =
    isAutoSaving.value || isTransferringData.value || localToastVisibleUntil.value > Date.now();

  const shouldCombine = (cloudActive && localActive) || (localActive && canAutoCloudSync.value);

  const activeToast =
    shouldCombine
      ? {
          id: "sync-active",
          kind: "cloud" as const,
          message: isTransferringData.value
            ? `💾☁️ ${t("toastLocalCloudTransferring")}`
            : `💾☁️ ${t("toastLocalCloudSyncing")}`,
          spinning: true,
        }
      : cloudActive
        ? {
            id: "cloud-active",
            kind: "cloud" as const,
            message: `☁️ ${t("toastCloudSyncing")}`,
            spinning: true,
          }
        : localActive
          ? {
              id: "local-active",
              kind: "local" as const,
              message: isTransferringData.value
                ? `💾 ${t("toastLocalTransferring")}`
                : `💾 ${t("toastLocalSaving")}`,
              spinning: true,
            }
          : null;

  // Keep the UI to a single toast: fold transient info into the active toast when present.
  if (transientToast.value?.kind === "error") {
    items.push({
      id: "transient",
      kind: "error",
      message: transientToast.value.message,
      spinning: false,
      action: transientToast.value.action,
    });
    return items;
  }

  if (activeToast) {
    const mergedMessage = transientToast.value?.message
      ? `${activeToast.message} • ${transientToast.value.message}`
      : activeToast.message;
    items.push({ ...activeToast, message: mergedMessage, action: transientToast.value?.action });
    return items;
  }

  if (transientToast.value) {
    items.push({
      id: "transient",
      kind: transientToast.value.kind,
      message: transientToast.value.message,
      spinning: false,
      action: transientToast.value.action,
    });
  }

  return items;
});

function showTransientToast(
  kind: "local" | "cloud" | "error",
  message: string,
  options?: { action?: { label: string; href: string; onClick?: () => void }; duration?: number },
) {
  const duration = options?.duration ?? 5000;
  transientToast.value = { kind, message, action: options?.action };
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  toastTimeout = setTimeout(() => {
    transientToast.value = null;
    toastTimeout = null;
  }, duration);
}

watch(
  locale,
  () => {
    document.title = `${t("appTitle")} (${t("beta")})`;
  },
  { immediate: true },
);

watch(
  () => isAutoSaving.value || isTransferringData.value,
  (active, wasActive) => {
    if (active) {
      bumpToastVisibility("local");
      return;
    }

    if (wasActive) {
      scheduleActiveToastHide("local");
    }
  },
  { immediate: true },
);

watch(
  isCloudSyncing,
  (active, wasActive) => {
    if (active) {
      bumpToastVisibility("cloud");
      return;
    }

    if (wasActive) {
      scheduleActiveToastHide("cloud");
    }
  },
  { immediate: true },
);

watch(
  notice,
  (next, previous) => {
    console.log('Notice changed:', { next, previous });
    if (!next || next === previous) {
      return;
    }

    if (next === "correction") {
      showTransientToast("local", `💾 ${t("resultsUpdated")}`);
      return;
    }

    if (next === "queued") {
      showTransientToast("local", `💾 ${t("resultsQueued")}`, { duration: 5000 });
      return;
    }

    if (next === "instruction-pending") {
      showTransientToast("local", `💾 ${t("instructionSavedNeedsReanalysis")}`, {
        duration: 5000,
        action: {
          label: t("instructionSavedOpenLink"),
          href: "#food-rules-textarea",
          onClick: openFoodRulesFromToast,
        },
      });
      return;
    }

    if (next === "instruction-saved") {
      console.log('Showing instruction-saved toast');
      showTransientToast("local", `💾 ${t("instructionSavedOnly")}`, {
        duration: 5000,
        action: {
          label: t("instructionSavedOpenLink"),
          href: "#food-rules-textarea",
          onClick: openFoodRulesFromToast,
        },
      });
    }
  },
);

watch(
  cloudStatus,
  (next, previous) => {
    if (next === previous) {
      return;
    }

    if (next === "failed") {
      showTransientToast("error", `⚠️ ${cloudError.value || t("cloudSyncFailed")}`, { duration: 5000 });
    }
  },
);

watch(
  [isProfileReady, hasConfiguredGeminiKey],
  ([profileReady, geminiReady]) => {
    if (didInitializePanels.value) {
      return;
    }

    const savedAppSetup = readStoredOpen(PANEL_OPEN_KEYS.appSetup);
    const savedConstant = readStoredOpen(PANEL_OPEN_KEYS.constantData);
    appSetupOpen.value = savedAppSetup ?? !geminiReady;
    constantDataOpen.value = savedConstant ?? !profileReady;
    didInitializePanels.value = true;
  },
  { immediate: true },
);

function onAppSetupToggle(event: Event) {
  const details = event.target as HTMLDetailsElement;
  // If required, keep it open (no collapsing).
  if (!hasConfiguredGeminiKey.value) {
    appSetupOpen.value = true;
    writeStoredOpen(PANEL_OPEN_KEYS.appSetup, true);
    return;
  }
  appSetupOpen.value = details.open;
  writeStoredOpen(PANEL_OPEN_KEYS.appSetup, appSetupOpen.value);
}

function onConstantDataToggle(event: Event) {
  const details = event.target as HTMLDetailsElement;
  // If required, keep it open (no collapsing).
  if (!isProfileReady.value) {
    constantDataOpen.value = true;
    writeStoredOpen(PANEL_OPEN_KEYS.constantData, true);
    return;
  }
  constantDataOpen.value = details.open;
  writeStoredOpen(PANEL_OPEN_KEYS.constantData, constantDataOpen.value);
}

async function saveFoodCorrectionInstructionAndRefresh(
  foodId: string,
  foodName: string,
  grams: number | null,
  calories: number | null,
  caloriesPer100g: number | null,
) {
  await saveFoodCorrectionInstruction(foodId, foodName, grams, calories, caloriesPer100g);
  await analyzeCurrentDay();
}

async function saveFoodCorrectionInstructionOnlyAndRefresh(
  foodId: string,
  foodName: string,
  grams: number | null,
  calories: number | null,
  caloriesPer100g: number | null,
) {
  await saveFoodCorrectionInstructionOnly(foodId, foodName, grams, calories, caloriesPer100g);
}

async function applyFoodCorrectionForCurrentEntry(
  foodId: string,
  foodName: string,
  grams: number | null,
  calories: number | null,
  caloriesPer100g: number | null,
) {
  await applyFoodCorrectionToCurrentEntry(foodId, foodName, grams, calories, caloriesPer100g);
  correctionNoticeToken.value += 1;
}

async function retryAnalysisWithModel(providerId: string) {
  if (!providerId) return;
  await onProviderChange(providerId);
  await analyzeCurrentDay();
}

async function saveActivityAndHighlight(activityPrompt: string) {
  await saveActivityPrompt(activityPrompt);
  tdeeHighlightToken.value += 1;
}

async function saveProfileAndHighlight(nextProfile?: typeof profile.value) {
  await saveProfileDraft(nextProfile ?? undefined);
  tdeeHighlightToken.value += 1;
}

function onWeightMissingStrategyChange(value: "previousDay" | "deducedWeight") {
  if (!profile.value) {
    return;
  }

  const nextProfile = { ...profile.value, weightMissingStrategy: value };
  profile.value = nextProfile;
  void saveProfileAndHighlight(nextProfile);
}

</script>

<template>
  <Teleport to="body">
    <div v-if="isAnalyzing" class="global-analyzing-overlay" role="status" :aria-label="t('analysisInProgressTitle')">
      <div class="global-analyzing-bar">
        <span class="global-analyzing-spinner" aria-hidden="true"></span>
        <div class="global-analyzing-copy">
          <strong class="global-analyzing-label">{{ t("analysisInProgressTitle") }}</strong>
          <AnalysisSwitchSuggestion
            v-if="showModelSwitchPrompt && suggestedModelLabel"
            :model-label="suggestedModelLabel"
            @accept="acceptSuggestedModelSwitch"
          />
          <span v-else>{{ t("analyzeSlowNotice") }}</span>
        </div>
      </div>
    </div>
  </Teleport>

  <JasmineThemePrompt
    :confirmed-username="cloudConfirmedUsername"
    :is-theme-active="isJasmineThemeActive"
    @apply="applyJasmineThemeFromDialog"
  />

  <main class="app-shell">
    <AppHeader
      :locale="locale"
      :theme-mode="themeMode"
      :is-saving-locale="isSavingLocale"
      :is-saving-theme="isSavingTheme"
      :cloud-mode="cloudMode"
      :cloud-confirmed-username="cloudConfirmedUsername"
      :is-cloud-busy="isCloudSyncing"
      @locale-change="onLocaleChange"
      @theme-change="onThemeChange"
    />

    <p v-if="notice === 'queued'" class="notice-banner">
      {{ t("resultsQueued") }}
      <button class="notice-dismiss" @click="clearNotice">x</button>
    </p>

    <div v-if="activeToasts.length" class="status-toast-stack" aria-live="polite" aria-atomic="true">
      <transition-group name="status-toast">
        <div
          v-for="toast in activeToasts"
          :key="toast.id"
          class="status-toast"
          :class="`status-toast--${toast.kind}`"
          role="status"
        >
          <span class="status-toast__glyph" :class="{ 'is-spinning': toast.spinning }" aria-hidden="true"></span>
          <span class="status-toast__message">{{ toast.message }}</span>
          <a
            v-if="toast.action"
            class="status-toast__action"
            :href="toast.action.href"
            @click="toast.action.onClick?.()"
          >
            {{ toast.action.label }}
          </a>
        </div>
      </transition-group>
    </div>

    <details
      v-if="profile"
      class="panel constant-data-panel"
      :open="appSetupEffectiveOpen"
      :class="{ 'is-locked-open': !hasConfiguredGeminiKey, 'is-required-pane': !hasConfiguredGeminiKey }"
      @toggle="onAppSetupToggle"
    >
      <summary class="constant-data-summary">
        <span class="summary-title">
          {{ t("appSetup") }}
          <span v-if="!hasConfiguredGeminiKey" class="summary-required">{{ t("requiredNow") }}</span>
        </span>
        <span class="summary-helper">
          {{ hasConfiguredGeminiKey ? t("appSetupHelper") : t("appSetupRequiredHelper") }}
        </span>
      </summary>

      <div class="constant-data-grid">
	        <CloudSyncPanel
	          :locale="locale"
            :profile="profile"
	          :cloud-mode="cloudMode"
	          :cloud-username="cloudUsername"
	          :cloud-confirmed-username="cloudConfirmedUsername"
            :has-saved-cloud-password="hasSavedCloudPassword"
	          :is-cloud-busy="isCloudBusy"
	          :cloud-status="cloudStatus"
	          :cloud-last-synced-at="cloudLastSyncedAt"
	          :cloud-error="cloudError"
	          :supabase-configured="supabaseConfigured"
          @update:profile="profile = $event"
          @save="saveProfileAndHighlight"
          @update:cloud-mode="setCloudMode"
          @update:cloud-username="setCloudUsername"
          @sync="cloudSyncNow($event)"
          @logout="cloudLogout"
        />

        <ApiKeysPanel
          :locale="locale"
          :keys="aiKeys"
          :saving-field="savingAiKeyField"
          @save="saveAiKey"
        />

        <div class="constant-data-full">
          <DataTransferPanel
            :locale="locale"
            :is-busy="isTransferringData"
            :status="dataTransferStatus"
            :auto-backup-after-analyze="autoBackupAfterAnalyze"
            @export-data="exportData"
            @import-data="importData"
            @update:auto-backup-after-analyze="setAutoBackupAfterAnalyze"
          />
        </div>
      </div>
    </details>

    <details
      v-if="profile"
      class="panel constant-data-panel"
      :open="constantDataEffectiveOpen"
      :class="{ 'is-locked-open': !isProfileReady, 'is-required-pane': !isProfileReady }"
      @toggle="onConstantDataToggle"
    >
      <summary class="constant-data-summary">
        <span class="summary-title">
          {{ t("constantData") }}
          <span v-if="!isProfileReady" class="summary-required">{{ t("requiredNow") }}</span>
        </span>
        <span class="summary-helper">
          {{ isProfileReady ? t("constantDataHelper") : t("constantDataRequiredHelper") }}
        </span>
      </summary>

      <div class="constant-data-grid">
        <ProfilePanel
          :locale="locale"
          :profile="profile"
          :deduced-weight="deducedWeight"
          :estimated-lean-weight="estimatedLeanWeight"
          :is-saving-activity="isSavingActivityPrompt"
          @update:profile="profile = $event"
          @save="saveProfileAndHighlight"
          @save-activity="saveActivityAndHighlight"
        />

	        <TdeeSummaryPanel
	          :locale="locale"
            :profile="profile"
	          :tdee="tdee"
	          :selected-equation="profile.tdeeEquation"
	          :highlight-token="tdeeHighlightToken"
	          :is-updating="isSavingActivityPrompt || isSavingTdeeEquation || isCalculatingCustomTdee"
            :is-calculating-custom-tdee="isCalculatingCustomTdee"
            @update:profile="profile = $event"
            @save="saveProfileAndHighlight"
	          @select-equation="
            saveTdeeEquation($event);
            tdeeHighlightToken += 1;
          "
            @calculate-custom-tdee="calculateCustomTdeeWithGemini"
        />

      </div>
    </details>

    <section v-if="profile" class="content-grid">
      <div class="grid-cell span-12">
        <DailyDeskPanel
          :locale="locale"
          :selected-date="selectedDate"
          :current-weight="currentWeight"
          :food-log="currentFoodLog"
          :is-analyzing="isAnalyzing"
          :show-model-switch-prompt="showModelSwitchPrompt"
          :suggested-model-label="suggestedModelLabel"
          :has-results="Boolean(currentEntry?.nutritionSnapshot)"
          :is-profile-ready="isProfileReady"
          :provider="provider"
          :provider-options="providerOptions"
          :is-saving-provider="isSavingProvider"
          :can-select-provider="hasEffectiveGeminiKey"
          :analyze-issue="analyzeIssue"
          :analysis-error="currentEntry?.aiError ?? null"
          :analysis-retry-model-label="analysisErrorRetryModelLabel"
          :analysis-retry-model-id="analysisErrorRetryModelId"
          :is-saving-weight="isSavingWeight"
          :is-saving-food-log="isSavingFoodLog"
          :food-instructions="profile.foodInstructions"
          :is-saving-food-instructions="isSavingFoodInstructions"
          @update:selected-date="selectedDate = $event"
          @update:current-weight="currentWeight = $event"
          @update:food-log="currentFoodLog = $event"
          @save-weight="saveWeightDraft"
          @save-draft="saveFoodDraft"
          @analyze="analyzeCurrentDay"
          @accept-model-switch="acceptSuggestedModelSwitch"
          @dismiss-model-switch="dismissSuggestedModelSwitch"
          @retry-analysis-with-model="retryAnalysisWithModel"
          @provider-change="onProviderChange"
          @save-instructions="saveFoodInstructions"
        />
      </div>

      <div class="grid-cell span-12">
        <NutritionSummaryPanel
          :locale="locale"
          :entry="currentEntry"
          :profile="profile"
          :is-analyzing="isAnalyzing"
          :is-stale="Boolean(currentEntry?.analysisStale)"
          :status-text="statusLabel((key: string) => t(key), currentEntry?.aiStatus ?? 'idle')"
          :correction-token="correctionNoticeToken"
          :analysis-retry-model-label="analysisErrorRetryModelLabel"
          :analysis-retry-model-id="analysisErrorRetryModelId"
          @save-correction="saveFoodCorrectionInstructionAndRefresh"
          @save-correction-only="saveFoodCorrectionInstructionOnlyAndRefresh"
          @apply-correction="applyFoodCorrectionForCurrentEntry"
          @retry-analysis-with-model="retryAnalysisWithModel"
        />
      </div>

      <div class="grid-cell span-12">
        <InsightsPanel :locale="locale" :insights="nutritionInsights" />
      </div>

      <BasePanel id="graphCaloriesPanel" class="grid-cell span-6" :title="t('graphCalories')" collapsible>
        <MetricChart
          :locale="locale"
          :points="caloriePoints"
          :label="t('graphCalories')"
          :y-unit="t('unitKcal')"
          :reference-lines="[
            { label: t('tdeeSummary'), value: tdee.selectedValue, color: '#9a7b24' },
            { label: t('targetCaloriesLine'), value: tdee.targetTdee, color: '#8f3333' },
            { label: t('avgCaloriesLine'), value: averageCalories, color: '#6a6a6a' },
          ]"
        />
      </BasePanel>

      <BasePanel id="graphWeightPanel" class="grid-cell span-6" :title="t('graphWeight')" collapsible>
        <MetricChart
          :locale="locale"
          :points="weightPoints"
          :label="t('graphWeight')"
          :y-unit="t('unitKg')"
          :trendline="{ label: weightTrendlineLabel, color: '#7a5ec8' }"
        />
      </BasePanel>

      <div class="grid-cell span-12">
        <HistoryPanel
          :locale="locale"
          :entries="entries"
          :saving-calories="savingHistoryCalories"
          :saving-weight="savingHistoryWeight"
          :tdee-reference="tdee.selectedValue"
          :target-weight-reference="tdee.targetWeight"
          :weight-missing-strategy="profile.weightMissingStrategy"
          @update:weight-missing-strategy="onWeightMissingStrategyChange"
          @save-calories="saveHistoryCalories"
          @save-weight="saveHistoryWeight"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.global-analyzing-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: 1rem;
  pointer-events: none;
}

.global-analyzing-bar {
  inline-size: min(32rem, calc(100vw - 2rem));
  display: grid;
  justify-items: center;
  gap: 0.7rem;
  padding: 1rem 1.15rem;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border-strong));
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-1) 88%, var(--accent) 12%) 0%,
      color-mix(in srgb, var(--surface-2) 92%, var(--accent) 8%) 100%
    );
  color: var(--text-primary);
  border-radius: 14px;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.24), var(--bevel-raised);
  text-align: center;
  backdrop-filter: blur(10px);
  pointer-events: auto;
}

.global-analyzing-spinner {
  inline-size: 1.35rem;
  block-size: 1.35rem;
  border: 2px solid color-mix(in srgb, var(--accent) 28%, transparent);
  border-inline-end-color: var(--accent);
  border-radius: 50%;
  flex: 0 0 auto;
  animation: global-spin 850ms linear infinite;
}

.global-analyzing-copy {
  display: grid;
  gap: 0.22rem;
  justify-items: center;
}

.global-analyzing-label {
  font-size: 0.98rem;
  line-height: 1.2;
}

@keyframes global-spin {
  to { transform: rotate(360deg); }
}

.app-shell {
  padding: var(--space-4);
  max-inline-size: 1400px;
  margin: 0 auto;
}

.constant-data-panel {
  margin-block-end: var(--space-3);
}

.constant-data-panel.is-locked-open .constant-data-summary {
  cursor: default;
  pointer-events: none;
}

.constant-data-panel.is-locked-open .constant-data-summary::before {
  display: none;
}

.constant-data-summary {
  cursor: pointer;
  list-style: none;
  display: grid;
  gap: 6px;
  position: relative;
  padding-inline-end: 1.5rem;
  padding-block-end: 12px;
  margin-block-end: 12px;
  border-block-end: 1px solid var(--border);
}

.constant-data-summary::-webkit-details-marker {
  display: none;
}

.constant-data-summary::before {
  content: "▸";
  position: absolute;
  inset-inline-end: 0;
  inset-block-start: 0.15rem;
  color: var(--text-muted);
  transition: transform 160ms ease;
}

.constant-data-panel[open] .constant-data-summary::before {
  transform: rotate(90deg);
}

.summary-title {
  font-size: 1rem;
  font-weight: 700;
}

.summary-required {
  margin-inline-start: 0.45rem;
  display: inline-block;
  padding: 0.12rem 0.42rem;
  border: 1px solid #7c2d2d;
  background: #f0c6c3;
  color: #651c1c;
  font-size: 0.88rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  box-shadow: var(--bevel-raised);
}

.summary-helper {
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.35;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--space-3);
  align-items: start;
}

.grid-cell {
  min-inline-size: 0;
  display: block;
}

.span-12 {
  grid-column: span 12;
}

.span-6 {
  grid-column: span 6;
}

.notice-banner {
  margin: 0 0 var(--space-3);
  padding: 0.55rem 0.75rem;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--bevel-raised);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.notice-dismiss {
  padding: 0.1rem 0.45rem;
}

.status-toast-stack {
  position: fixed;
  inset-inline-start: 1rem;
  inset-block-end: 1rem;
  z-index: 40;
  display: grid;
  gap: 0.65rem;
  justify-items: start;
  pointer-events: none;
}

.status-toast {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  max-inline-size: min(32rem, calc(100vw - 2rem));
  padding: 0.72rem 0.95rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: color-mix(in srgb, var(--panel) 92%, black 8%);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22), var(--bevel-raised);
  color: var(--text-primary);
  backdrop-filter: blur(10px);
  pointer-events: auto;
}

.status-toast--local {
  border-color: color-mix(in srgb, #15803d 56%, var(--border));
  background: color-mix(in srgb, #15803d 16%, var(--panel));
}

.status-toast--cloud {
  border-color: color-mix(in srgb, #16a34a 58%, var(--border));
  background: color-mix(in srgb, #16a34a 18%, var(--panel));
}

.status-toast--error {
  border-color: color-mix(in srgb, #b91c1c 58%, var(--border));
  background: color-mix(in srgb, #b91c1c 13%, var(--panel));
}

.status-toast__glyph {
  inline-size: 1rem;
  block-size: 1rem;
  border-radius: 999px;
  border: 2px solid currentColor;
  border-inline-end-color: transparent;
  flex: 0 0 auto;
  opacity: 0.92;
}

.status-toast--error .status-toast__glyph {
  border-inline-end-color: currentColor;
}

.status-toast--error .status-toast__glyph {
  background:
    linear-gradient(45deg, transparent 43%, currentColor 43% 57%, transparent 57%),
    linear-gradient(-45deg, transparent 43%, currentColor 43% 57%, transparent 57%);
}

.status-toast__glyph.is-spinning {
  animation: status-toast-spin 0.85s linear infinite;
}

.status-toast__message {
  min-inline-size: 0;
  overflow-wrap: anywhere;
  line-height: 1.3;
}

.status-toast__action {
  color: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 0.15em;
  white-space: nowrap;
}

.status-toast__action:hover {
  text-decoration-thickness: 2px;
}

.status-toast-enter-active,
.status-toast-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.status-toast-enter-from,
.status-toast-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

@keyframes status-toast-spin {
  to {
    transform: rotate(360deg);
  }
}

.constant-data-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--space-3);
  align-items: start;
  padding: 2px 12px 12px 12px;
}

.constant-data-grid > :deep(.panel) {
  grid-column: span 6;
}

.constant-data-full {
  grid-column: span 12;
  display: grid;
}

.constant-data-full > :deep(.panel) {
}

@media (min-width: 961px) {
  .constant-data-grid > :deep(textarea) {
    min-block-size: 12rem;
    block-size: 12rem;
  }
}

@media (max-width: 960px) {
  .status-toast-stack {
    inset-inline: 0.75rem;
    inset-block-end: 0.75rem;
    justify-items: stretch;
  }

  .status-toast {
    max-inline-size: none;
    border-radius: 1rem;
  }

  .app-shell {
    padding: 10px;
  }

  .content-grid,
  .constant-data-grid {
    grid-template-columns: 1fr;
  }

  .span-6,
  .span-12,
  .constant-data-grid > :deep(.panel),
  .constant-data-full {
    grid-column: auto;
  }
}

@media (max-width: 960px) {
  .content-grid {
    grid-template-columns: 1fr;
  }

  .content-grid > :deep(.panel),
  .content-grid > .panel,
  .grid-cell {
    grid-column: auto;
  }

  .constant-data-grid {
    grid-template-columns: 1fr;
  }

  .constant-data-grid > :deep(.panel) {
    grid-column: auto;
  }

  .constant-data-full {
    grid-column: auto;
  }
}
</style>
