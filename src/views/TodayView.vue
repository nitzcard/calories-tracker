<script setup lang="ts">
import TodayLogPanel from "../components/panels/TodayLogPanel.vue";
import NutritionSummaryPanel from "../components/panels/NutritionSummaryPanel.vue";
import FoodRulesPanel from "../components/panels/FoodRulesPanel.vue";
import type {
  AiProviderOption,
  AppLocale,
  DailyEntry,
  NutritionTotals,
  Profile,
} from "../types";

defineProps<{
  locale: AppLocale;
  selectedDate: string;
  currentWeight: string;
  currentFoodLog: string;
  isAnalyzing: boolean;
  showModelSwitchPrompt?: boolean;
  suggestedModelLabel?: string | null;
  isProfileReady: boolean;
  provider: string;
  providerOptions: AiProviderOption[];
  isSavingProvider: boolean;
  canSelectProvider: boolean;
  analyzeIssue: string;
  statusText: string;
  formattedAnalysisError: string | null;
  analysisErrorRetryModelLabel?: string | null;
  analysisErrorRetryModelId?: string | null;
  isSavingWeight: boolean;
  isSavingFoodLog: boolean;
  currentEntry?: DailyEntry;
  profile?: Profile | null;
  correctionNoticeToken: number;
  isSavingFoodInstructions: boolean;
}>();

const emit = defineEmits<{
  "update:selected-date": [value: string];
  "update:current-weight": [value: string];
  "update:food-log": [value: string];
  "save-weight": [value?: string];
  "save-draft": [value?: string];
  "save-instructions": [value: string];
  analyze: [];
  "provider-change": [provider: string];
  "accept-model-switch": [];
  "dismiss-model-switch": [];
  "retry-analysis-with-model": [provider: string];
  "save-correction": [
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
  ];
  "save-correction-only": [
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
  ];
  "apply-correction": [
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
  ];
  "apply-meal-total": [mealId: string, totals: NutritionTotals];
}>();
</script>

<template>
  <section class="today-board">
    <div class="today-input-card">
      <section id="dailyDeskPanel">
        <TodayLogPanel
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
          :can-select-provider="canSelectProvider"
          :analyze-issue="analyzeIssue"
          :analysis-error="formattedAnalysisError"
          :analysis-retry-model-label="analysisErrorRetryModelLabel"
          :analysis-retry-model-id="analysisErrorRetryModelId"
          :is-saving-weight="isSavingWeight"
          :is-saving-food-log="isSavingFoodLog"
          @update:selected-date="emit('update:selected-date', $event)"
          @update:current-weight="emit('update:current-weight', $event)"
          @update:food-log="emit('update:food-log', $event)"
          @save-weight="emit('save-weight', $event)"
          @save-draft="emit('save-draft', $event)"
          @analyze="emit('analyze')"
          @accept-model-switch="emit('accept-model-switch')"
          @dismiss-model-switch="emit('dismiss-model-switch')"
          @retry-analysis-with-model="emit('retry-analysis-with-model', $event)"
          @provider-change="emit('provider-change', $event)"
        />
      </section>
    </div>

    <div class="today-side-rail">
      <FoodRulesPanel
        v-if="profile"
        :locale="locale"
        :instructions="profile.foodInstructions"
        :is-saving="isSavingFoodInstructions"
        @save-instructions="emit('save-instructions', $event)"
      />
    </div>

    <NutritionSummaryPanel
      class="today-summary-card"
      :locale="locale"
      :entry="currentEntry"
      :profile="profile"
      :provider-id="provider"
      :provider-options="providerOptions"
      :is-analyzing="isAnalyzing"
      :is-stale="Boolean(currentEntry?.analysisStale)"
      :status-text="statusText"
      :correction-token="correctionNoticeToken"
      :analysis-error="formattedAnalysisError"
      :analysis-retry-model-label="analysisErrorRetryModelLabel"
      :analysis-retry-model-id="analysisErrorRetryModelId"
      @save-correction="(...args) => emit('save-correction', ...args)"
      @save-correction-only="(...args) => emit('save-correction-only', ...args)"
      @apply-correction="(...args) => emit('apply-correction', ...args)"
      @apply-meal-total="(...args) => emit('apply-meal-total', ...args)"
      @retry-analysis-with-model="emit('retry-analysis-with-model', $event)"
    />
  </section>
</template>

<style scoped>
.today-board {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(18rem, 0.92fr);
  gap: 1rem;
  align-items: start;
  max-inline-size: 76rem;
}

.today-board > * {
  min-inline-size: 0;
}

.today-side-rail {
  display: grid;
  gap: 1rem;
  align-items: start;
}

.today-summary-card {
  grid-column: 1 / -1;
}

@media (max-width: 980px) {
  .today-board {
    grid-template-columns: 1fr;
    max-inline-size: none;
  }
}
</style>
