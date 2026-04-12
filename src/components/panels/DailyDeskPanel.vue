<script setup lang="ts">
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import FoodRulesPanel from "./FoodRulesPanel.vue";
import TodayLogPanel from "./TodayLogPanel.vue";
import type { AppLocale } from "../../types";

defineProps<{
  locale: AppLocale;
  selectedDate: string;
  currentWeight: string;
  foodLog: string;
  isAnalyzing: boolean;
  isFallingBackToLite?: boolean;
  hasResults: boolean;
  isProfileReady: boolean;
  provider: string;
  analyzeIssue: string;
  analysisError?: string | null;
  isSavingWeight: boolean;
  isSavingFoodLog: boolean;
  foodInstructions: string;
  isSavingFoodInstructions: boolean;
}>();

const emit = defineEmits<{
  "update:selectedDate": [value: string];
  "update:currentWeight": [value: string];
  "update:foodLog": [value: string];
  "save-weight": [];
  "save-draft": [];
  analyze: [];
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
          :is-falling-back-to-lite="isFallingBackToLite"
          :has-results="hasResults"
          :is-profile-ready="isProfileReady"
          :provider="provider"
          :analyze-issue="analyzeIssue"
          :analysis-error="analysisError"
          :is-saving-weight="isSavingWeight"
          :is-saving-food-log="isSavingFoodLog"
          @update:selected-date="emit('update:selectedDate', $event)"
          @update:current-weight="emit('update:currentWeight', $event)"
          @update:food-log="emit('update:foodLog', $event)"
          @save-weight="emit('save-weight')"
          @save-draft="emit('save-draft')"
          @analyze="emit('analyze')"
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
