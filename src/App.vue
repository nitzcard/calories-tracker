<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "./components/base/BasePanel.vue";
import MetricChart from "./components/charts/MetricChart.vue";
import AppHeader from "./components/header/AppHeader.vue";
import ApiKeysPanel from "./components/panels/ApiKeysPanel.vue";
import DataTransferPanel from "./components/panels/DataTransferPanel.vue";
import FoodRulesPanel from "./components/panels/FoodRulesPanel.vue";
import HistoryPanel from "./components/panels/HistoryPanel.vue";
import InsightsPanel from "./components/panels/InsightsPanel.vue";
import NutritionSummaryPanel from "./components/panels/NutritionSummaryPanel.vue";
import ProfilePanel from "./components/panels/ProfilePanel.vue";
import TdeeSummaryPanel from "./components/panels/TdeeSummaryPanel.vue";
import TodayLogPanel from "./components/panels/TodayLogPanel.vue";
import { useDashboard } from "./app/useDashboard";

const dashboard = useDashboard();
const { t } = useI18n();

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
  statusLabel,
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
  saveFoodCorrection,
  exportData,
  importData,
  notice,
  clearNotice,
} = dashboard;

const appSetupOpen = ref(false);
const constantDataOpen = ref(false);
const didInitializePanels = ref(false);
const tdeeHighlightToken = ref(0);
const correctionNoticeToken = ref(0);
const isProfileReady = computed(
  () =>
    Boolean(
      profile.value?.age &&
        profile.value?.height &&
        profile.value?.activityPrompt.trim(),
    ),
);
const hasConfiguredGeminiKey = computed(() => Boolean(aiKeys.value.gemini.trim()));

watch(
  locale,
  (nextLocale) => {
    document.title = t("appTitle", 0, { locale: nextLocale });
  },
  { immediate: true },
);

watch(
  [isProfileReady, hasConfiguredGeminiKey],
  ([profileReady, geminiReady]) => {
    if (didInitializePanels.value) {
      return;
    }

    appSetupOpen.value = !geminiReady;
    constantDataOpen.value = !profileReady;
    didInitializePanels.value = true;
  },
  { immediate: true },
);

function onAppSetupToggle(event: Event) {
  const details = event.target as HTMLDetailsElement;
  appSetupOpen.value = details.open;
}

function onConstantDataToggle(event: Event) {
  const details = event.target as HTMLDetailsElement;
  constantDataOpen.value = details.open;
}

async function saveFoodCorrectionAndRefresh(
  foodId: string,
  foodName: string,
  grams: number | null,
  calories: number | null,
  caloriesPer100g: number | null,
) {
  await saveFoodCorrection(foodId, foodName, grams, calories, caloriesPer100g);
  correctionNoticeToken.value += 1;
}

async function saveActivityAndHighlight(activityPrompt: string) {
  await saveActivityPrompt(activityPrompt);
  tdeeHighlightToken.value += 1;
}

async function saveProfileAndHighlight(nextProfile?: typeof profile.value) {
  await saveProfileDraft(nextProfile ?? undefined);
  tdeeHighlightToken.value += 1;
}
</script>

<template>
  <main class="app-shell">
    <AppHeader
      :locale="locale"
      :theme-mode="themeMode"
      :provider="provider"
      :provider-options="providerOptions"
      :is-saving-locale="isSavingLocale"
      :is-saving-theme="isSavingTheme"
      :is-saving-provider="isSavingProvider"
      @locale-change="onLocaleChange"
      @theme-change="onThemeChange"
      @provider-change="onProviderChange"
    />

    <p v-if="notice === 'queued'" class="notice-banner">
      {{ t("resultsQueued") }}
      <button class="notice-dismiss" @click="clearNotice">x</button>
    </p>

    <details
      v-if="profile"
      class="panel constant-data-panel"
      :open="appSetupOpen"
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
            @export-data="exportData"
            @import-data="importData"
          />
        </div>
      </div>
    </details>

    <details
      v-if="profile"
      class="panel constant-data-panel"
      :open="constantDataOpen"
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
          :tdee="tdee"
          :selected-equation="profile.tdeeEquation"
          :highlight-token="tdeeHighlightToken"
          :is-updating="isSavingActivityPrompt || isSavingTdeeEquation"
          :is-saving-equation="isSavingTdeeEquation"
          @select-equation="
            saveTdeeEquation($event);
            tdeeHighlightToken += 1;
          "
        />

      </div>
    </details>

    <section v-if="profile" class="content-grid">
      <div class="grid-cell span-6">
        <TodayLogPanel
          :locale="locale"
          :selected-date="selectedDate"
          :current-weight="currentWeight"
          :food-log="currentFoodLog"
          :is-analyzing="isAnalyzing"
          :has-results="Boolean(currentEntry?.nutritionSnapshot)"
          :is-profile-ready="isProfileReady"
          :provider="provider"
          :analyze-issue="analyzeIssue"
          :is-saving-weight="isSavingWeight"
          :is-saving-food-log="isSavingFoodLog"
          @update:selected-date="selectedDate = $event"
          @update:current-weight="currentWeight = $event"
          @update:food-log="currentFoodLog = $event"
          @save-weight="saveWeightDraft"
          @save-draft="saveFoodDraft"
          @analyze="analyzeCurrentDay"
        />
      </div>

      <div class="grid-cell span-6">
        <FoodRulesPanel
          :locale="locale"
          :instructions="profile.foodInstructions"
          :is-saving="isSavingFoodInstructions"
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
          @save-correction="saveFoodCorrectionAndRefresh"
        />
      </div>

      <div class="grid-cell span-12">
        <InsightsPanel :locale="locale" :insights="nutritionInsights" />
      </div>

      <BasePanel class="grid-cell span-6" :title="t('graphCalories')">
        <MetricChart
          :locale="locale"
          :points="caloriePoints"
          :label="t('graphCalories')"
          :y-unit="t('unitKcal')"
          :reference-line="{
            label: t('tdeeSummary'),
            value: tdee.selectedValue,
            color: '#9a7b24',
          }"
        />
      </BasePanel>

      <BasePanel class="grid-cell span-6" :title="t('graphWeight')">
        <MetricChart :locale="locale" :points="weightPoints" :label="t('graphWeight')" :y-unit="t('unitKg')" />
      </BasePanel>

      <div class="grid-cell span-12">
        <HistoryPanel
          :locale="locale"
          :entries="entries"
          :saving-calories="savingHistoryCalories"
          :tdee-reference="tdee.selectedValue"
          @save-calories="saveHistoryCalories"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.app-shell {
  padding: var(--space-4);
  max-inline-size: 1400px;
  margin: 0 auto;
}

.constant-data-panel {
  margin-block-end: var(--space-3);
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
  align-items: stretch;
}

.grid-cell {
  min-inline-size: 0;
  display: grid;
}

.grid-cell > :deep(.panel) {
  block-size: 100%;
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

.constant-data-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--space-3);
  align-items: stretch;
  padding: 2px 12px 12px 12px;
}

.constant-data-grid > :deep(.panel) {
  grid-column: span 6;
  block-size: 100%;
}

.constant-data-full {
  grid-column: span 12;
  display: grid;
}

.constant-data-full > :deep(.panel) {
  block-size: 100%;
}

@media (min-width: 961px) {
  .constant-data-grid > :deep(.base-panel) {
    grid-template-rows: auto auto 1fr auto;
  }

  .constant-data-grid > :deep(textarea) {
    min-block-size: 12rem;
    block-size: 12rem;
  }
}

@media (max-width: 960px) {
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
