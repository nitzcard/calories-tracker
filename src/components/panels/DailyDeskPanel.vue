<script setup lang="ts">
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import FoodRulesPanel from "./FoodRulesPanel.vue";
import TodayLogPanel from "./TodayLogPanel.vue";
import type { AppLocale } from "../../types";
import type { AiProviderOption } from "../../types";

defineProps<{
  locale: AppLocale;
  selectedDate: string;
  currentWeight: string;
  foodLog: string;
  isAnalyzing: boolean;
  showModelSwitchPrompt?: boolean;
  suggestedModelLabel?: string | null;
  hasResults: boolean;
  isProfileReady: boolean;
  provider: string;
  providerOptions: AiProviderOption[];
  isSavingProvider: boolean;
  canSelectProvider: boolean;
  analyzeIssue: string;
  analysisError?: string | null;
  analysisRetryModelLabel?: string | null;
  analysisRetryModelId?: string | null;
  isSavingWeight: boolean;
  isSavingFoodLog: boolean;
  foodInstructions: string;
  isSavingFoodInstructions: boolean;
}>();

const emit = defineEmits<{
  "update:selected-date": [value: string];
  "update:current-weight": [value: string];
  "update:food-log": [value: string];
  "save-weight": [value?: string];
  "save-draft": [value?: string];
  analyze: [];
  "provider-change": [provider: string];
  "accept-model-switch": [];
  "dismiss-model-switch": [];
  "retry-analysis-with-model": [provider: string];
  "save-instructions": [value: string];
}>();

const { t } = useI18n();
</script>

<template>
  <BasePanel id="dailyDeskPanel" :title="t('dailyDesk')" :helper="t('dailyDeskHelper')" collapsible>
    <div class="daily-grid">
      <div class="subpanel">
        <h3 class="subhead">{{ t("whatIAte") }}</h3>
        <TodayLogPanel
          embedded
          :locale="locale"
          :selected-date="selectedDate"
          :current-weight="currentWeight"
          :food-log="foodLog"
          :is-analyzing="isAnalyzing"
          :show-model-switch-prompt="showModelSwitchPrompt"
          :suggested-model-label="suggestedModelLabel"
          :has-results="hasResults"
          :is-profile-ready="isProfileReady"
          :provider="provider"
          :provider-options="providerOptions"
          :is-saving-provider="isSavingProvider"
          :can-select-provider="canSelectProvider"
          :analyze-issue="analyzeIssue"
          :analysis-error="analysisError"
          :analysis-retry-model-label="analysisRetryModelLabel"
          :analysis-retry-model-id="analysisRetryModelId"
          :is-saving-weight="isSavingWeight"
          :is-saving-food-log="isSavingFoodLog"
          @update:selected-date="emit('update:selected-date', $event)"
          @update:current-weight="emit('update:current-weight', $event)"
          @update:food-log="emit('update:food-log', $event)"
          @save-weight="emit('save-weight', $event)"
          @save-draft="emit('save-draft', $event)"
          @provider-change="emit('provider-change', $event)"
          @analyze="emit('analyze')"
          @accept-model-switch="emit('accept-model-switch')"
          @dismiss-model-switch="emit('dismiss-model-switch')"
          @retry-analysis-with-model="emit('retry-analysis-with-model', $event)"
        />
      </div>
      <div class="subpanel">
        <h3 class="subhead">{{ t("foodRules") }}</h3>
        <FoodRulesPanel
          embedded
          :locale="locale"
          :instructions="foodInstructions"
          :is-saving="isSavingFoodInstructions"
          @save-instructions="emit('save-instructions', $event)"
        />
      </div>
    </div>
  </BasePanel>
</template>

<style scoped>
.daily-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--panel-gap);
  align-items: start;
}

.subpanel {
  display: grid;
  gap: var(--panel-gap);
  align-content: start;
  border: 1px solid var(--border);
  background: var(--surface-2);
  box-shadow: var(--bevel-sunken);
  padding: var(--space-3);
}

.subhead {
  color: var(--text-muted);
}

@media (max-width: 960px) {
  .daily-grid {
    grid-template-columns: 1fr;
  }
}
</style>
