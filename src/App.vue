<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import BasePanel from "./components/base/BasePanel.vue";
import AppHeader from "./components/header/AppHeader.vue";
import AnalysisSwitchSuggestion from "./components/shared/AnalysisSwitchSuggestion.vue";
import PaneScrubber from "./components/shared/PaneScrubber.vue";
import NutritionSummaryPanel from "./components/panels/NutritionSummaryPanel.vue";
import { buildAnalysisErrorPresentation } from "./app/analysis-errors";
import { useDashboard } from "./app/useDashboard";
import { formatEntryDate } from "./domain/entries";

const MetricChart = defineAsyncComponent(() => import("./components/charts/MetricChart.vue"));
const ApiKeysPanel = defineAsyncComponent(() => import("./components/panels/ApiKeysPanel.vue"));
const CloudSyncPanel = defineAsyncComponent(() => import("./components/panels/CloudSyncPanel.vue"));
const HistoryPanel = defineAsyncComponent(() => import("./components/panels/HistoryPanel.vue"));
const InsightsPanel = defineAsyncComponent(() => import("./components/panels/InsightsPanel.vue"));
const ProfilePanel = defineAsyncComponent(() => import("./components/panels/ProfilePanel.vue"));
const TdeeSummaryPanel = defineAsyncComponent(() => import("./components/panels/TdeeSummaryPanel.vue"));
const DailyDeskPanel = defineAsyncComponent(() => import("./components/panels/DailyDeskPanel.vue"));

const dashboard = useDashboard();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

function readStoredOpen(key: string): boolean | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "0" || raw === "1") return raw === "1";
  } catch {
    // ignore and del
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
  profile,
  entries,
  selectedDate,
  currentFoodLog,
  currentWeight,
  updateCurrentFoodLog,
  updateCurrentWeight,
  provider,
  providerOptions,
  aiKeys,
  isAnalyzing,
  showModelSwitchPrompt,
  suggestedModelLabel,
  isAutoSaving,
  isSavingWeight,
  isSavingFoodLog,
  isSavingFoodInstructions,
  isSavingTdeeEquation,
  isSavingLocale,
  isSavingProvider,
  savingAiKeyField,
  analyzeIssue,
  currentEntry,
  tdee,
  nutritionInsights,
  estimatedLeanWeight,
  weightPoints,
  caloriePoints,
  savingHistoryCalories,
  savingHistoryWeight,
  statusLabel,
  onLocaleChange,
  onProviderChange,
  saveWeightDraft,
  saveFoodDraft,
  deleteDay,
  saveHistoryCalories,
  saveHistoryWeight,
  analyzeCurrentDay,
  acceptSuggestedModelSwitch,
  dismissSuggestedModelSwitch,
  saveProfileDraft,
  saveTdeeEquation,
  saveFoodInstructions,
  saveAiKey,
  saveFoodCorrectionInstruction,
  saveFoodCorrectionInstructionOnly,
  applyFoodCorrectionToCurrentEntry,
  applyMealTotalCorrectionToCurrentEntry,
  cloudUsername,
  cloudConfirmedUsername,
  hasSavedCloudPassword,
  isCloudBusy,
  isCloudSyncing,
  cloudStatus,
  cloudLastSyncedAt,
  cloudError,
  supabaseConfigured,
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
const deleteDayDialogRef = ref<HTMLDialogElement | null>(null);
const deleteDayPendingDate = ref<string | null>(null);
const isProfileReady = computed(
  () =>
    Boolean(
      profile.value?.age &&
      profile.value?.height &&
        profile.value?.activityFactor,
    ),
);
const hasConfiguredGeminiKey = computed(() => Boolean(aiKeys.value.gemini.trim()));
const hasEffectiveGeminiKey = computed(() =>
  Boolean((aiKeys.value.gemini || import.meta.env.VITE_GEMINI_API_KEY || "").trim()),
);
const appSetupEffectiveOpen = computed(() => (hasConfiguredGeminiKey.value ? appSetupOpen.value : true));
const constantDataEffectiveOpen = computed(() => (isProfileReady.value ? constantDataOpen.value : true));
const hasConfirmedCloudLogin = computed(() => Boolean(cloudConfirmedUsername.value.trim()));
const showCloudLoginGate = computed(() => supabaseConfigured.value && !hasConfirmedCloudLogin.value);
const isLoginRoute = computed(() => route.name === "login");
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
const calorieTrendlineLabel = computed(() => {
  const base = t("trendLine");
  const tdeeValue = tdee.value.selectedValue;
  if (typeof tdeeValue !== "number" || !Number.isFinite(tdeeValue)) {
    return base;
  }

  const ys = (caloriePoints.value ?? [])
    .map((point) => point.y)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!ys.length) {
    return base;
  }

  const averageCalories = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const roundedDelta = Math.round(averageCalories - tdeeValue);
  const normalizedDelta = Object.is(roundedDelta, -0) ? 0 : roundedDelta;
  const formatter = new Intl.NumberFormat(locale.value === "he" ? "he-IL" : "en-US", {
    maximumFractionDigits: 0,
  });
  const signedDelta = `${normalizedDelta > 0 ? "+" : ""}${formatter.format(normalizedDelta)}`;
  const suffix = locale.value === "he"
    ? `${signedDelta} ${t("unitKcal")} מול TDEE`
    : `${signedDelta} ${t("unitKcal")} vs TDEE`;

  return `${base} (${suffix})`;
});
const analysisErrorPresentation = computed(() =>
  buildAnalysisErrorPresentation(currentEntry.value?.aiError, locale.value, provider.value, providerOptions.value),
);
const analysisErrorRetryModelId = computed(() => analysisErrorPresentation.value.retryModelId);
const analysisErrorRetryModelLabel = computed(() => analysisErrorPresentation.value.retryModelLabel);
const formattedAnalysisError = computed(() => analysisErrorPresentation.value.message);
const mobilePanes = computed(() => [
  { id: "dailyDeskPanel", label: t("dailyDesk"), icon: "diary" as const },
  { id: "nutritionSummaryPanel", label: t("nutritionSummary"), icon: "summary" as const },
  { id: "graphCaloriesPanel", label: t("graphCalories"), icon: "graphs" as const },
  { id: "historyPanel", label: t("history"), icon: "history" as const },
]);
const deleteDayPendingLabel = computed(() =>
  deleteDayPendingDate.value ? formatEntryDate(deleteDayPendingDate.value, locale.value) : "",
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

const activeToasts = computed(() => {
  const items: Array<{
    id: string;
    kind: "local" | "cloud" | "error";
    message: string;
    action?: { label: string; href: string; onClick?: () => void };
  }> = [];

  const cloudActive = isCloudSyncing.value || cloudToastVisibleUntil.value > Date.now();
  const localActive = isAutoSaving.value || localToastVisibleUntil.value > Date.now();
  const shouldCombine = cloudActive && localActive;

  const activeToast =
    shouldCombine
      ? {
          id: "sync-active",
          kind: "cloud" as const,
          message: `💾☁️ ${t("toastLocalCloudSyncing")}`,
        }
      : cloudActive
        ? {
            id: "cloud-active",
            kind: "cloud" as const,
            message: `☁️ ${t("toastCloudSyncing")}`,
          }
        : localActive
          ? {
              id: "local-active",
              kind: "local" as const,
              message: `💾 ${t("toastLocalSaving")}`,
            }
          : null;

  // Keep the UI to a single toast: fold transient info into the active toast when present.
  if (transientToast.value?.kind === "error") {
    items.push({
      id: "transient",
      kind: "error",
      message: transientToast.value.message,
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
      action: transientToast.value.action,
    });
  }

  return items;
});

const primaryToast = computed(() => activeToasts.value[0] ?? null);

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
  [showCloudLoginGate, () => route.name],
  async ([shouldShowLogin, routeName]) => {
    if (shouldShowLogin && routeName !== "login") {
      await router.replace({ name: "login" });
      return;
    }

    if (!shouldShowLogin && routeName === "login") {
      await router.replace({ name: "dashboard" });
    }
  },
  { immediate: true },
);

watch(
  [hasConfirmedCloudLogin, () => route.name],
  async ([isLoggedIn, routeName]) => {
    if (isLoggedIn && routeName === "login") {
      await router.replace({ name: "dashboard" });
    }
  },
  { immediate: true },
);

watch(
  isAutoSaving,
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
      showTransientToast("local", `💾 ${t("instructionSavedOnly")}`, {
        duration: 5000,
        action: {
          label: t("instructionSavedOpenLink"),
          href: "#food-rules-textarea",
          onClick: openFoodRulesFromToast,
        },
      });
      return;
    }

    if (next === "day-deleted") {
      showTransientToast("local", t("dayDeleted"), { duration: 4500 });
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
  protein?: number | null,
  carbs?: number | null,
  fat?: number | null,
  fiber?: number | null,
  solubleFiber?: number | null,
  insolubleFiber?: number | null,
) {
  await saveFoodCorrectionInstruction(
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
  );
  await analyzeCurrentDay();
}

async function saveFoodCorrectionInstructionOnlyAndRefresh(
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
) {
  await saveFoodCorrectionInstructionOnly(
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
  );
}

async function applyFoodCorrectionForCurrentEntry(
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
) {
  await applyFoodCorrectionToCurrentEntry(
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
  );
  correctionNoticeToken.value += 1;
}

async function applyMealTotalCorrectionForCurrentEntry(
  mealId: string,
  totals: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fiber: number | null;
  },
) {
  await applyMealTotalCorrectionToCurrentEntry(mealId, totals);
  correctionNoticeToken.value += 1;
}

async function retryAnalysisWithModel(providerId: string) {
  if (!providerId) return;
  await onProviderChange(providerId);
  await analyzeCurrentDay();
}

async function saveProfileAndHighlight(nextProfile?: typeof profile.value) {
  await saveProfileDraft(nextProfile ?? undefined);
  tdeeHighlightToken.value += 1;
}

function closeDeleteDayDialog() {
  deleteDayDialogRef.value?.close();
  deleteDayPendingDate.value = null;
}

function openDeleteDayDialog(date: string) {
  deleteDayPendingDate.value = date;
  const dialog = deleteDayDialogRef.value;
  if (!dialog) {
    return;
  }

  if (dialog.open) {
    dialog.close();
  }

  dialog.showModal();
}

async function confirmDeleteDay() {
  const date = deleteDayPendingDate.value;
  closeDeleteDayDialog();
  if (!date) {
    return;
  }

  await deleteDay(date);
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

  <dialog ref="deleteDayDialogRef" class="confirm-delete-dialog" @close="deleteDayPendingDate = null">
    <form method="dialog" class="confirm-delete-dialog__form" @submit.prevent="confirmDeleteDay">
      <h2 class="confirm-delete-dialog__title">{{ t("deleteDayModalTitle") }}</h2>
      <p class="confirm-delete-dialog__copy">
        {{ t("deleteDayModalBody", { date: deleteDayPendingLabel }) }}
      </p>
      <div class="confirm-delete-dialog__actions">
        <button
          type="button"
          class="secondary-action confirm-delete-dialog__cancel"
          data-delete-dialog-cancel
          @click="closeDeleteDayDialog"
        >
          {{ t("deleteDayModalCancel") }}
        </button>
        <button type="submit" class="confirm-delete-dialog__confirm" data-delete-dialog-confirm>
          {{ t("deleteDayModalConfirm") }}
        </button>
      </div>
    </form>
  </dialog>

  <main v-if="isLoginRoute" class="app-shell app-shell--blocked login-desktop">
    <section class="login-desktop__canvas">
      <div class="login-desktop__window" role="presentation">
        <div class="login-desktop__titlebar">
          <strong>{{ t("cloudSyncTitle") }}</strong>
          <span class="login-desktop__titlebar-buttons" aria-hidden="true">
            <span>_</span>
            <span>□</span>
            <span>x</span>
          </span>
        </div>

        <div class="login-desktop__body">
          <AppHeader
            :locale="locale"
            :is-saving-locale="isSavingLocale"
            :cloud-confirmed-username="cloudConfirmedUsername"
            :is-cloud-busy="isCloudSyncing"
            :show-logout="false"
            :auth-view="true"
            @locale-change="onLocaleChange"
          />

          <section v-if="profile" class="content-grid">
            <div class="grid-cell span-12">
              <CloudSyncPanel
                :locale="locale"
                :profile="profile"
                :cloud-username="cloudUsername"
                :cloud-confirmed-username="cloudConfirmedUsername"
                :has-saved-cloud-password="hasSavedCloudPassword"
                :is-cloud-busy="isCloudBusy"
                :cloud-status="cloudStatus"
                :cloud-last-synced-at="cloudLastSyncedAt"
                :cloud-error="cloudError"
                :supabase-configured="supabaseConfigured"
                :auth-view="true"
                @update:profile="profile = $event"
                @save="saveProfileAndHighlight"
                @update:cloud-username="setCloudUsername"
                @sync="cloudSyncNow($event)"
                @logout="cloudLogout"
              />
            </div>
          </section>
        </div>
      </div>
    </section>
  </main>

  <main v-else class="app-shell">
    <PaneScrubber :panes="mobilePanes" :aria-label="t('paneNavigation')" />

    <AppHeader
      :locale="locale"
      :is-saving-locale="isSavingLocale"
      :cloud-confirmed-username="cloudConfirmedUsername"
      :is-cloud-busy="isCloudSyncing"
      :show-logout="hasConfirmedCloudLogin"
      @locale-change="onLocaleChange"
      @logout="cloudLogout"
    />

    <p v-if="notice === 'queued'" class="notice-banner">
      {{ t("resultsQueued") }}
      <button class="notice-dismiss" @click="clearNotice">x</button>
    </p>

    <div v-if="primaryToast" class="status-toast-stack" aria-live="polite" aria-atomic="true">
      <Transition name="status-toast" mode="out-in">
        <div
          :key="primaryToast.id"
          class="status-toast"
          role="status"
        >
          <span class="status-toast__glyph spinning" aria-hidden="true"></span>
          <span class="status-toast__message">{{ primaryToast.message }}</span>
          <a
            v-if="primaryToast.action"
            class="status-toast__action"
            :href="primaryToast.action.href"
            @click="primaryToast.action.onClick?.()"
          >
            {{ primaryToast.action.label }}
          </a>
        </div>
      </transition>
    </div>

    <details
      v-if="profile"
      id="appSetupPanel"
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
          v-if="!hasConfirmedCloudLogin"
          :locale="locale"
          :profile="profile"
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
      </div>
    </details>

    <details
      v-if="profile"
      id="constantDataPanel"
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
          :estimated-lean-weight="estimatedLeanWeight"
          @update:profile="profile = $event"
          @save="saveProfileAndHighlight"
        />

	        <TdeeSummaryPanel
	          :locale="locale"
	          :tdee="tdee"
	          :selected-equation="profile.tdeeEquation"
	          :highlight-token="tdeeHighlightToken"
	          :is-updating="isSavingTdeeEquation"
	          @select-equation="
            saveTdeeEquation($event);
            tdeeHighlightToken += 1;
          "
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
          :analysis-error="formattedAnalysisError"
          :analysis-retry-model-label="analysisErrorRetryModelLabel"
          :analysis-retry-model-id="analysisErrorRetryModelId"
          :is-saving-weight="isSavingWeight"
          :is-saving-food-log="isSavingFoodLog"
          :food-instructions="profile.foodInstructions"
          :is-saving-food-instructions="isSavingFoodInstructions"
          @update:selected-date="selectedDate = $event"
          @update:current-weight="updateCurrentWeight"
          @update:food-log="updateCurrentFoodLog"
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
          :provider-id="provider"
          :provider-options="providerOptions"
          :is-analyzing="isAnalyzing"
          :is-stale="Boolean(currentEntry?.analysisStale)"
          :status-text="statusLabel((key: string) => t(key), currentEntry?.aiStatus ?? 'idle')"
          :correction-token="correctionNoticeToken"
          :analysis-error="formattedAnalysisError"
          :analysis-retry-model-label="analysisErrorRetryModelLabel"
          :analysis-retry-model-id="analysisErrorRetryModelId"
          @save-correction="saveFoodCorrectionInstructionAndRefresh"
          @save-correction-only="saveFoodCorrectionInstructionOnlyAndRefresh"
          @apply-correction="applyFoodCorrectionForCurrentEntry"
          @apply-meal-total="applyMealTotalCorrectionForCurrentEntry"
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
          :trendline="{ label: calorieTrendlineLabel, color: '#7a5ec8' }"
          :reference-lines="[
            { label: t('tdeeSummary'), value: tdee.selectedValue, color: '#9a7b24' },
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
          @save-calories="saveHistoryCalories"
          @save-weight="saveHistoryWeight"
          @delete-day="openDeleteDayDialog"
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
  position: static;
  transform: none;
  inline-size: min(32rem, calc(100vw - 2rem));
  display: grid;
  justify-items: center;
  gap: 0.7rem;
  padding: 1rem 1.15rem;
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  background: var(--panel);
  color: var(--text-primary);
  border-radius: 0;
  box-shadow: 10px 10px 0 rgba(0, 0, 0, 0.24);
  text-align: center;
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
  min-block-size: 100vh;
  background:
    linear-gradient(45deg, rgba(255, 255, 255, 0.06) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.06) 50%, rgba(255, 255, 255, 0.06) 75%, transparent 75%, transparent) 0 0 / 4px 4px,
    var(--bg);
}

.app-shell--blocked {
  min-block-size: 100vh;
}

.login-desktop {
  max-inline-size: none;
  padding: 24px;
  background:
    linear-gradient(45deg, rgba(255, 255, 255, 0.06) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.06) 50%, rgba(255, 255, 255, 0.06) 75%, transparent 75%, transparent) 0 0 / 4px 4px,
    var(--bg);
}

.login-desktop__canvas {
  min-block-size: calc(100vh - 48px);
  display: grid;
  place-items: center;
}

.login-desktop__window {
  inline-size: min(100%, 980px);
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  background: var(--panel);
  box-shadow: 10px 10px 0 rgba(0, 0, 0, 0.22);
}

.login-desktop__titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 7px;
  border-bottom: 2px solid #808080;
  background: #000080;
  color: #fff;
  font-size: 0.95rem;
}

.login-desktop__titlebar-buttons {
  display: inline-flex;
  gap: 4px;
  font-size: 0.78rem;
}

.login-desktop__titlebar-buttons span {
  min-inline-size: 18px;
  display: inline-grid;
  place-items: center;
  border: 2px solid #000;
  border-color: #dfdfdf #3f3f3f #3f3f3f #dfdfdf;
  background: var(--surface-1);
  color: var(--text-primary);
  line-height: 1;
}

.login-desktop__body {
  padding: 14px;
}

.login-desktop :deep(.header-shell--auth) {
  max-inline-size: none;
  margin: 0 0 12px;
  padding: 12px;
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  background: var(--panel);
  box-shadow: none;
}

.login-desktop :deep(.header-shell--auth .title) {
  font-size: 1.25rem;
}

.login-desktop :deep(.header-shell--auth .beta-pill),
.login-desktop :deep(.header-shell--auth .field-control),
.login-desktop :deep(.header-shell--auth select),
.login-desktop :deep(.cloud-panel--auth),
.login-desktop :deep(.cloud-panel--auth .status-pill),
.login-desktop :deep(.cloud-panel--auth .optional-pill),
.login-desktop :deep(.cloud-panel--auth button) {
  border-radius: 0;
  box-shadow: none;
}

.login-desktop :deep(.cloud-panel--auth) {
  max-inline-size: none;
  margin: 0;
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  background: var(--panel);
}

.login-desktop :deep(.cloud-panel--auth .panel-body) {
  padding: 12px;
}

.login-desktop :deep(.cloud-panel--auth .panel-header) {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.login-desktop :deep(.cloud-panel--auth .auth-block) {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.login-desktop :deep(.cloud-panel--auth input),
.login-desktop :deep(.cloud-panel--auth select) {
  border: 2px solid #000;
  border-color: #808080 #fff #fff #808080;
  background: var(--input-bg);
  color: var(--text-primary);
}

.login-desktop :deep(.cloud-panel--auth .cloud-actions) {
  justify-content: flex-start;
  padding-top: 2px;
}

.login-desktop :deep(.cloud-panel--auth button) {
  min-inline-size: 110px;
  border: 2px solid #000;
  border-color: #fff #3f3f3f #3f3f3f #fff;
  background: var(--surface-1);
  color: var(--text-primary);
}

.login-desktop :deep(.cloud-panel--auth button:disabled) {
  color: var(--text-muted);
}

.login-desktop :deep(.cloud-panel--auth .status-pill) {
  border: 2px solid #000;
  border-color: #808080 #fff #fff #808080;
  background: var(--surface-2);
  color: var(--text-primary);
}

@media (max-width: 720px) {
  .login-desktop {
    padding: 10px;
  }

  .login-desktop__canvas {
    min-block-size: calc(100vh - 20px);
  }

  .login-desktop__body {
    padding: 10px;
  }

  .login-desktop :deep(.cloud-panel--auth .auth-block) {
    grid-template-columns: 1fr;
  }
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
  border-block-end: 2px solid #808080;
  box-shadow: inset 0 -1px 0 #fff;
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
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  background: var(--panel);
  color: #7a0000;
  font-size: 0.88rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  box-shadow: none;
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
  background: var(--panel);
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  border-radius: var(--radius);
  box-shadow: none;
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
  padding: 0.6rem 0.8rem;
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  border-radius: 0;
  background: var(--panel);
  box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.22);
  color: var(--text-primary);
  pointer-events: auto;
}

.status-toast--error {
  background: var(--panel);
  color: #7a0000;
  border-inline-start-color: #7a0000;
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

.status-toast__glyph.spinning {
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

.confirm-delete-dialog {
  inline-size: min(30rem, calc(100vw - 2rem));
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  border-radius: 0;
  background: var(--panel);
  color: var(--text-primary);
  box-shadow: 10px 10px 0 rgba(0, 0, 0, 0.25);
  padding: 0;
}

.confirm-delete-dialog::backdrop {
  background: rgba(0, 0, 0, 0.28);
}

.confirm-delete-dialog__form {
  display: grid;
  gap: 0.9rem;
  padding: 1.05rem 1.15rem 1rem;
}

.confirm-delete-dialog__title {
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.2;
}

.confirm-delete-dialog__copy {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
}

.confirm-delete-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.7rem;
  flex-wrap: wrap;
}

.confirm-delete-dialog__cancel,
.confirm-delete-dialog__confirm {
  min-inline-size: 8.5rem;
}

.confirm-delete-dialog__confirm {
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  border-radius: 0;
  background: var(--panel);
  color: var(--text-primary);
  font: inherit;
  font-weight: 700;
  padding: 0.55rem 0.9rem;
  cursor: pointer;
}

.confirm-delete-dialog__confirm:hover {
  filter: none;
}

.custom-tdee-success-dialog__form {
  gap: 1rem;
}

.custom-tdee-success-dialog__stats {
  display: grid;
  gap: 0.45rem;
}

.custom-tdee-success-dialog__stat {
  margin: 0;
  color: var(--text-primary);
  line-height: 1.45;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.custom-tdee-success-dialog__stat-label {
  flex: 0 0 auto;
}

.custom-tdee-success-dialog__stat-value {
  min-inline-size: 0;
  unicode-bidi: isolate;
}

.custom-tdee-success-dialog__reasons {
  display: grid;
  gap: 0.5rem;
}

.custom-tdee-success-dialog__reasons-list {
  margin: 0;
  padding-inline-start: 1.2rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.custom-tdee-success-dialog__reasons-list li {
  overflow-wrap: anywhere;
}

.custom-tdee-success-dialog .confirm-delete-dialog__actions {
  justify-content: center;
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
    /* Position toast above the pane scrubber (~5rem tall) plus safe area. */
    inset-block-end: calc(5.5rem + env(safe-area-inset-bottom));
    justify-items: stretch;
  }

  .status-toast {
    max-inline-size: none;
    border-radius: 1rem;
  }

  .app-shell {
    padding: 10px;
    /* Respect device safe areas (notch, home indicator, rounded corners). */
    padding-block-start: max(10px, env(safe-area-inset-top));
    padding-block-end: calc(5rem + env(safe-area-inset-bottom));
    padding-inline-start: max(10px, env(safe-area-inset-left));
    padding-inline-end: max(10px, env(safe-area-inset-right));
  }

  :is(
      #dailyDeskPanel,
      #nutritionSummaryPanel,
      #graphCaloriesPanel,
      #historyPanel
    ) {
    scroll-margin-block-end: calc(5.5rem + env(safe-area-inset-bottom));
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
