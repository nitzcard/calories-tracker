<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import AppHeader from "./components/header/AppHeader.vue";
import AnalysisSwitchSuggestion from "./components/shared/AnalysisSwitchSuggestion.vue";
import { buildAnalysisErrorPresentation } from "./app/analysis-errors";
import { useThemePreference } from "./app/useThemePreference";
import { useDashboard } from "./app/useDashboard";
import { formatEntryDate } from "./domain/entries";
import type { ThemePreference } from "./types";
import LoginView from "./views/LoginView.vue";
import ProgressView from "./views/ProgressView.vue";
import SettingsView from "./views/SettingsView.vue";
import TodayView from "./views/TodayView.vue";

const dashboard = useDashboard();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

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
  progressTdeeReferences,
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

const tdeeHighlightToken = ref(0);
const correctionNoticeToken = ref(0);
const deleteDayDialogRef = ref<HTMLDialogElement | null>(null);
const deleteDayPendingDate = ref<string | null>(null);
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
const lastAnalyzingState = ref(false);

const isProfileReady = computed(() =>
  Boolean(profile.value?.age && profile.value?.height && profile.value?.activityFactor),
);
const hasEffectiveGeminiKey = computed(() =>
  Boolean((aiKeys.value.gemini || import.meta.env.VITE_GEMINI_API_KEY || "").trim()),
);
const hasConfirmedCloudLogin = computed(() => Boolean(cloudConfirmedUsername.value.trim()));
const showCloudLoginGate = computed(() => supabaseConfigured.value && !hasConfirmedCloudLogin.value);
const isLoginRoute = computed(() => route.name === "login");
const themePreference = computed<ThemePreference>(() => profile.value?.themePreference ?? "system");
useThemePreference(themePreference);
const navItems = computed(() => [
  {
    name: "today" as const,
    label: t("navToday"),
    iconPaths: [
      "M3.75 11.25 12 4.5l8.25 6.75",
      "M5.25 10.5v7.125c0 .621.504 1.125 1.125 1.125H9.75V13.5h4.5v5.25h3.375c.621 0 1.125-.504 1.125-1.125V10.5",
    ],
  },
  {
    name: "progress" as const,
    label: t("navProgress"),
    iconPaths: [
      "M4.5 18V9.75",
      "M9 18V6.75",
      "M13.5 18v-4.5",
      "M18 18V4.5",
    ],
  },
  {
    name: "settings" as const,
    label: t("navSettings"),
    iconPaths: [
      "M10.5 3.75h3",
      "M10.5 20.25h3",
      "M3.75 10.5v3",
      "M20.25 10.5v3",
      "m5.303 5.303 2.121 2.121",
      "m16.576 16.576 2.121 2.121",
      "m5.303 18.697 2.121-2.121",
      "m16.576 7.424 2.121-2.121",
      "M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z",
    ],
  },
]);
const currentNavItem = computed(() =>
  navItems.value.find((item) => item.name === route.name) ?? navItems.value[0],
);
const currentPageTitle = computed(() => {
  if (route.name === "progress") return t("progressTitle");
  if (route.name === "settings") return t("settingsTitle");
  return t("todayTitle");
});
const currentPageHelper = computed(() => {
  if (route.name === "progress") return t("progressHelper");
  if (route.name === "settings") return t("settingsHelper");
  return t("todayHelper");
});
const analysisErrorPresentation = computed(() =>
  buildAnalysisErrorPresentation(currentEntry.value?.aiError, locale.value, provider.value, providerOptions.value),
);
const analysisErrorRetryModelId = computed(() => analysisErrorPresentation.value.retryModelId);
const analysisErrorRetryModelLabel = computed(() => analysisErrorPresentation.value.retryModelLabel);
const formattedAnalysisError = computed(() => analysisErrorPresentation.value.message);
const deleteDayPendingLabel = computed(() =>
  deleteDayPendingDate.value ? formatEntryDate(deleteDayPendingDate.value, locale.value) : "",
);
const weightTrendlineLabel = computed(() => {
  const slope = computeTrendlineSlopePerDay(weightPoints.value);
  if (slope === null || !Number.isFinite(slope)) {
    return t("averageWeightChangePerDay");
  }

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

  const ys = caloriePoints.value
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
  const suffix =
    locale.value === "he"
      ? `${signedDelta} ${t("unitKcal")} מול TDEE`
      : `${signedDelta} ${t("unitKcal")} vs TDEE`;

  return `${base} (${suffix})`;
});

function computeTrendlineSlopePerDay(points: Array<{ x: number; y: number | null }>) {
  const numeric = points.filter(
    (point): point is { x: number; y: number } =>
      typeof point.y === "number" && Number.isFinite(point.y),
  );
  if (numeric.length < 2) {
    return null;
  }

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
  return denominator === 0 ? null : numerator / denominator;
}

function openFoodRulesFromToast() {
  void router.replace({ name: "settings" }).then(() => {
    requestAnimationFrame(() => {
      const textarea = document.getElementById("food-rules-textarea");
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.focus();
        textarea.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
  });
}

function openResultsFromToast() {
  void router.replace({ name: "today" }).then(() => {
    requestAnimationFrame(() => {
      const resultsPanel = document.getElementById("nutritionSummaryPanel");
      if (!(resultsPanel instanceof HTMLElement)) {
        return;
      }

      resultsPanel.scrollIntoView({ block: "start", behavior: "smooth" });
      resultsPanel.focus?.({ preventScroll: true });
    });
  });
}

function goToToday() {
  if (route.name === "today") {
    return;
  }

  void router.replace({ name: "today" });
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
      ? { id: "sync-active", kind: "cloud" as const, message: `💾☁️ ${t("toastLocalCloudSyncing")}` }
      : cloudActive
        ? { id: "cloud-active", kind: "cloud" as const, message: `☁️ ${t("toastCloudSyncing")}` }
        : localActive
          ? { id: "local-active", kind: "local" as const, message: `💾 ${t("toastLocalSaving")}` }
          : null;

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
    items.push({
      ...activeToast,
      message: transientToast.value?.message ? `${activeToast.message} • ${transientToast.value.message}` : activeToast.message,
      action: transientToast.value?.action,
    });
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
    document.title = t("appTitle");
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

    if (!shouldShowLogin && (routeName === "login" || routeName === "root")) {
      await router.replace({ name: "today" });
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
  [isAnalyzing, () => currentEntry.value?.aiStatus, () => currentEntry.value?.nutritionSnapshot],
  ([analyzing, status, snapshot]) => {
    const wasAnalyzing = lastAnalyzingState.value;
    lastAnalyzingState.value = analyzing;

    if (analyzing || !wasAnalyzing) {
      return;
    }

    if (status === "done" && snapshot) {
      showTransientToast("local", t("resultsUpdated"), {
        duration: 7000,
        action: {
          label: t("jumpToResults"),
          href: "#nutritionSummaryPanel",
          onClick: openResultsFromToast,
        },
      });
    }
  },
  { immediate: true },
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

async function saveThemePreference(nextTheme: ThemePreference) {
  if (!profile.value) return;
  profile.value = { ...profile.value, themePreference: nextTheme };
  await saveProfileDraft(profile.value);
}

async function saveHistorySummaryBaseline(date: string) {
  if (!profile.value) return;
  profile.value = { ...profile.value, historySummaryBaselineDate: date || null };
  await saveProfileDraft(profile.value);
}

async function clearHistorySummaryBaseline() {
  if (!profile.value) return;
  profile.value = { ...profile.value, historySummaryBaselineDate: null };
  await saveProfileDraft(profile.value);
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

  <LoginView
    v-if="isLoginRoute && profile"
    :locale="locale"
    :theme-preference="themePreference"
    :is-saving-locale="isSavingLocale"
    :cloud-confirmed-username="cloudConfirmedUsername"
    :is-cloud-busy="isCloudSyncing"
    :profile="profile"
    :cloud-username="cloudUsername"
    :has-saved-cloud-password="hasSavedCloudPassword"
    :cloud-status="cloudStatus"
    :cloud-last-synced-at="cloudLastSyncedAt"
    :cloud-error="cloudError"
    :supabase-configured="supabaseConfigured"
    @locale-change="onLocaleChange"
    @theme-change="saveThemePreference"
    @update:profile="profile = $event"
    @save-profile="saveProfileAndHighlight"
    @update:cloud-username="setCloudUsername"
    @sync="cloudSyncNow($event)"
    @logout="cloudLogout"
  />

  <main v-else-if="profile" class="app-shell">
    <div v-if="primaryToast" class="status-toast-stack" aria-atomic="true">
      <Transition name="status-toast" mode="out-in">
        <div
          :key="primaryToast.id"
          class="status-toast"
          :class="`status-toast--${primaryToast.kind}`"
          :role="primaryToast.kind === 'error' ? 'alert' : 'status'"
          :aria-live="primaryToast.kind === 'error' ? 'assertive' : 'polite'"
        >
          <span
            class="status-toast__glyph"
            :class="{ spinning: primaryToast.kind !== 'error', 'status-toast__glyph--error': primaryToast.kind === 'error' }"
            aria-hidden="true"
          >
            {{ primaryToast.kind === 'error' ? "!" : "" }}
          </span>
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
      </Transition>
    </div>

    <AppHeader
      :locale="locale"
      :is-saving-locale="isSavingLocale"
      :cloud-confirmed-username="cloudConfirmedUsername"
      :theme-preference="themePreference"
      :is-cloud-busy="isCloudSyncing"
      :show-logout="hasConfirmedCloudLogin"
      @locale-change="onLocaleChange"
      @theme-change="saveThemePreference"
      @go-today="goToToday"
      @logout="cloudLogout"
    />

    <div class="app-chrome">
      <div class="workspace-header">
        <nav class="shell-nav shell-nav--desktop" :aria-label="t('appSections')">
          <button
            v-for="item in navItems"
            :key="item.name"
            type="button"
            class="shell-nav__item"
            :data-active="route.name === item.name ? 'true' : 'false'"
            @click="router.replace({ name: item.name })"
          >
            <span class="shell-nav__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="shell-nav__icon-svg">
                <path
                  v-for="segment in item.iconPaths"
                  :key="segment"
                  :d="segment"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.75"
                />
              </svg>
            </span>
            <span class="shell-nav__label">{{ item.label }}</span>
          </button>
        </nav>

        <section class="page-hero">
          <div class="page-hero__copy">
            <div class="page-hero__headline">
              <div class="page-hero__badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" class="page-hero__badge-icon">
                  <path
                    v-for="segment in currentNavItem.iconPaths"
                    :key="segment"
                    :d="segment"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.85"
                  />
                </svg>
              </div>

              <h2 class="page-hero__title">{{ currentPageTitle }}</h2>
            </div>
            <p class="page-hero__helper">{{ currentPageHelper }}</p>
          </div>
        </section>
      </div>

      <p v-if="notice === 'queued'" class="notice-banner">
        <span>{{ t("resultsQueued") }}</span>
        <button class="notice-dismiss" @click="clearNotice">×</button>
      </p>

      <div class="app-main">

        <TodayView
          v-if="route.name !== 'progress' && route.name !== 'settings'"
          :locale="locale"
          :selected-date="selectedDate"
          :current-weight="currentWeight"
          :current-food-log="currentFoodLog"
          :is-analyzing="isAnalyzing"
          :show-model-switch-prompt="showModelSwitchPrompt"
          :suggested-model-label="suggestedModelLabel"
          :is-profile-ready="isProfileReady"
          :provider="provider"
          :provider-options="providerOptions"
          :is-saving-provider="isSavingProvider"
          :can-select-provider="hasEffectiveGeminiKey"
          :analyze-issue="analyzeIssue"
          :status-text="statusLabel((key: string) => t(key), currentEntry?.aiStatus ?? 'idle')"
          :formatted-analysis-error="formattedAnalysisError"
          :analysis-error-retry-model-label="analysisErrorRetryModelLabel"
          :analysis-error-retry-model-id="analysisErrorRetryModelId"
          :is-saving-weight="isSavingWeight"
          :is-saving-food-log="isSavingFoodLog"
          :current-entry="currentEntry"
          :profile="profile"
          :correction-notice-token="correctionNoticeToken"
          :is-saving-food-instructions="isSavingFoodInstructions"
          @update:selected-date="selectedDate = $event"
          @update:current-weight="updateCurrentWeight"
          @update:food-log="updateCurrentFoodLog"
          @save-weight="saveWeightDraft"
          @save-draft="saveFoodDraft"
          @save-instructions="saveFoodInstructions"
          @analyze="analyzeCurrentDay"
          @accept-model-switch="acceptSuggestedModelSwitch"
          @dismiss-model-switch="dismissSuggestedModelSwitch"
          @retry-analysis-with-model="retryAnalysisWithModel"
          @provider-change="onProviderChange"
          @save-correction="saveFoodCorrectionInstructionAndRefresh"
          @save-correction-only="saveFoodCorrectionInstructionOnlyAndRefresh"
          @apply-correction="applyFoodCorrectionForCurrentEntry"
          @apply-meal-total="applyMealTotalCorrectionForCurrentEntry"
        />

        <ProgressView
          v-else-if="route.name === 'progress'"
          :locale="locale"
          :calorie-points="caloriePoints"
          :weight-points="weightPoints"
          :calorie-trendline-label="calorieTrendlineLabel"
          :weight-trendline-label="weightTrendlineLabel"
          :tdee-references="progressTdeeReferences"
          :target-weight-reference="tdee.targetWeight"
          :entries="entries"
          :saving-history-calories="savingHistoryCalories"
          :saving-history-weight="savingHistoryWeight"
          :history-summary-baseline-date="profile.historySummaryBaselineDate"
          @save-calories="saveHistoryCalories"
          @save-weight="saveHistoryWeight"
          @delete-day="openDeleteDayDialog"
          @save-history-baseline="saveHistorySummaryBaseline"
          @clear-history-baseline="clearHistorySummaryBaseline"
        />

        <SettingsView
          v-else
          :locale="locale"
          :profile="profile"
          :estimated-lean-weight="estimatedLeanWeight"
          :tdee="tdee"
          :is-saving-tdee-equation="isSavingTdeeEquation"
          :keys="aiKeys"
          :saving-ai-key-field="savingAiKeyField"
          :tdee-highlight-token="tdeeHighlightToken"
          @update:profile="profile = $event"
          @save-profile="saveProfileAndHighlight"
          @select-equation="
            saveTdeeEquation($event);
            tdeeHighlightToken += 1;
          "
          @save-ai-key="saveAiKey"
        />
      </div>

      <nav class="shell-nav shell-nav--mobile" :aria-label="t('appSections')">
        <button
          v-for="item in navItems"
          :key="item.name"
          type="button"
          class="shell-nav__item"
          :data-active="route.name === item.name ? 'true' : 'false'"
          @click="router.replace({ name: item.name })"
        >
          <span class="shell-nav__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="shell-nav__icon-svg">
              <path
                v-for="segment in item.iconPaths"
                :key="segment"
                :d="segment"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.75"
              />
            </svg>
          </span>
          <span class="shell-nav__label">{{ item.label }}</span>
        </button>
      </nav>
    </div>
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
  border: 1px solid var(--border);
  background: var(--surface-1);
  border-radius: var(--radius-lg);
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.28);
  text-align: center;
  pointer-events: auto;
}

.global-analyzing-spinner {
  inline-size: 1.35rem;
  block-size: 1.35rem;
  border: 2px solid color-mix(in srgb, var(--accent) 24%, transparent);
  border-inline-end-color: var(--accent);
  border-radius: 50%;
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
  max-inline-size: 82rem;
  margin: 0 auto;
  padding: clamp(0.8rem, 1.8vw, 1.5rem);
  padding-block-end: calc(6rem + env(safe-area-inset-bottom));
  min-block-size: 100vh;
}

.app-chrome {
  display: grid;
  gap: 0.9rem;
}

.workspace-header {
  display: grid;
  gap: 0.85rem;
}

.shell-nav {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.shell-nav__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 0.74rem 1rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-weight: 700;
  letter-spacing: 0.01em;
  transition:
    background 180ms ease,
    color 180ms ease,
    border-color 180ms ease,
  box-shadow 180ms ease;
}

.shell-nav__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 1.2rem;
  block-size: 1.2rem;
  color: currentColor;
  flex: 0 0 auto;
}

.shell-nav__icon-svg {
  inline-size: 100%;
  block-size: 100%;
}

.shell-nav__item:hover,
.shell-nav__item:focus-visible {
  border-color: color-mix(in srgb, var(--border-strong) 72%, transparent);
  background: color-mix(in srgb, var(--surface-2) 90%, white 10%);
  color: var(--text-primary);
}

.shell-nav__label {
  color: inherit;
  font-size: 0.92rem;
}

.shell-nav__item[data-active="true"] {
  border-color: color-mix(in srgb, var(--accent) 34%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 14%, var(--surface-1)),
    color-mix(in srgb, var(--accent) 6%, var(--surface-1))
  );
  color: var(--accent-strong);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 6%, transparent),
    0 8px 18px color-mix(in srgb, var(--accent) 8%, transparent);
}

.app-main {
  min-inline-size: 0;
}

.page-hero {
  display: grid;
  gap: 0.72rem;
  padding: 1rem 1.1rem;
  border: 1px solid color-mix(in srgb, var(--border-strong) 76%, transparent);
  border-radius: calc(var(--radius-lg) + 0.04rem);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 92%, transparent), color-mix(in srgb, var(--surface-2) 94%, transparent));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 18px 40px rgba(8, 24, 24, 0.08);
}

.page-hero__copy {
  min-inline-size: 0;
}

.page-hero__headline {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.85rem;
}

.page-hero__title {
  margin: 0;
  font-size: clamp(1.22rem, 1.9vw, 1.62rem);
  line-height: 1.05;
  letter-spacing: -0.03em;
}

.page-hero__helper {
  margin: 0.42rem 0 0;
  color: var(--text-muted);
  max-inline-size: 40rem;
  line-height: 1.55;
}

.page-hero__badge {
  display: grid;
  place-items: center;
  inline-size: 2.65rem;
  block-size: 2.65rem;
  border-radius: 0.82rem;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--surface-1)), color-mix(in srgb, var(--accent-strong) 12%, var(--surface-2)));
  color: var(--accent-strong);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 24%, transparent),
    0 12px 22px color-mix(in srgb, var(--accent) 10%, transparent);
  flex: 0 0 auto;
}

.page-hero__badge-icon {
  inline-size: 1.18rem;
  block-size: 1.18rem;
}

.shell-nav--desktop {
  position: sticky;
  inset-block-start: 0.8rem;
  z-index: 30;
  justify-content: flex-start;
  flex-wrap: wrap;
  inline-size: fit-content;
  max-inline-size: 100%;
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: calc(var(--radius) + 0.04rem);
  background: color-mix(in srgb, var(--surface-1) 94%, transparent);
  padding: 0.38rem;
  box-shadow: 0 14px 30px rgba(8, 24, 24, 0.08);
  backdrop-filter: blur(18px);
}

.shell-nav--desktop .shell-nav__icon {
  display: none;
}

.shell-nav--mobile {
  display: none;
}

.notice-banner {
  margin: 0;
  padding: 0.7rem 0.85rem;
  background: color-mix(in srgb, var(--accent) 8%, var(--surface-1));
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.notice-dismiss {
  min-inline-size: 2rem;
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
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--status-toast-local-border);
  border-radius: var(--radius);
  background: var(--status-toast-local-bg);
  color: var(--status-toast-local-text);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
  pointer-events: auto;
}

.status-toast--local {
  border-color: var(--status-toast-local-border);
  background: var(--status-toast-local-bg);
  color: var(--status-toast-local-text);
}

.status-toast--cloud {
  border-color: var(--status-toast-cloud-border);
  background: var(--status-toast-cloud-bg);
  color: var(--status-toast-cloud-text);
}

.status-toast--error {
  border-color: var(--status-toast-error-border);
  background: var(--status-toast-error-bg);
  color: var(--status-toast-error-text);
}

.status-toast__glyph {
  inline-size: 1.1rem;
  block-size: 1.1rem;
  border-radius: 999px;
  border: 2px solid currentColor;
  border-inline-end-color: transparent;
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  font-size: 0.72rem;
  font-weight: 900;
  line-height: 1;
  opacity: 0.92;
}

.status-toast__glyph.spinning {
  animation: status-toast-spin 0.85s linear infinite;
}

.status-toast__glyph--error {
  border-color: currentColor;
  border-inline-end-color: currentColor;
  background: color-mix(in srgb, currentColor 12%, transparent);
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
  to { transform: rotate(360deg); }
}

.confirm-delete-dialog {
  inline-size: min(30rem, calc(100vw - 2rem));
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  color: var(--text-primary);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.3);
  padding: 0;
}

.confirm-delete-dialog::backdrop {
  background: rgba(15, 23, 42, 0.4);
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
  color: var(--text-muted);
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

@media (max-width: 960px) {
  .status-toast-stack {
    inset-inline-start: 0.75rem;
    inset-inline-end: 0.75rem;
    inset-block-end: calc(5.75rem + env(safe-area-inset-bottom));
    justify-items: stretch;
  }

  .status-toast {
    max-inline-size: none;
  }

  .page-hero {
    gap: 0.8rem;
    padding: 0.9rem 1rem;
  }

  .shell-nav--desktop {
    display: none;
  }

  .shell-nav--mobile {
    position: fixed;
    inset-inline: 0;
    inset-block-end: 0;
    z-index: 35;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    padding:
      0.35rem
      max(0.45rem, env(safe-area-inset-left))
      calc(0.45rem + env(safe-area-inset-bottom))
      max(0.45rem, env(safe-area-inset-right));
    border-top: 1px solid color-mix(in srgb, var(--border-strong) 76%, transparent);
    background: color-mix(in srgb, var(--surface-1) 94%, transparent);
    box-shadow: 0 -12px 30px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(24px);
  }

  .shell-nav--mobile .shell-nav__item {
    display: grid;
    justify-items: center;
    align-content: center;
    position: relative;
    gap: 0.24rem;
    min-inline-size: 0;
    min-block-size: 3.9rem;
    padding: 0.62rem 0.25rem 0.48rem;
    border: none;
    border-radius: 0.95rem;
    background: transparent;
    box-shadow: none;
  }

  .page-hero__badge {
    inline-size: 2.45rem;
    block-size: 2.45rem;
  }

  .shell-nav--mobile .shell-nav__item::before {
    content: "";
    position: absolute;
    inset-inline: 20%;
    inset-block-start: 0.08rem;
    block-size: 0.18rem;
    border-radius: 999px;
    background: transparent;
    transition: background-color 180ms ease, transform 180ms ease;
  }

  .shell-nav--mobile .shell-nav__icon {
    inline-size: 1.22rem;
    block-size: 1.22rem;
  }

  .shell-nav--mobile .shell-nav__item[data-active="true"] {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    color: var(--accent-strong);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent);
  }

  .shell-nav--mobile .shell-nav__item[data-active="true"] .shell-nav__icon {
    transform: translateY(-0.5px);
  }

  .shell-nav--mobile .shell-nav__item[data-active="true"]::before {
    background: currentColor;
  }

  .shell-nav--mobile .shell-nav__label {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.015em;
  }
}
</style>
