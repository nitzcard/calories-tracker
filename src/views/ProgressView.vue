<script setup lang="ts">
import { useI18n } from "vue-i18n";
import BasePanel from "../components/base/BasePanel.vue";
import MetricChart from "../components/charts/MetricChart.vue";
import HistoryPanel from "../components/panels/HistoryPanel.vue";
import type { AppLocale, DailyEntry } from "../types";

defineProps<{
  locale: AppLocale;
  caloriePoints: Array<{ x: number; y: number | null }>;
  weightPoints: Array<{ x: number; y: number | null }>;
  calorieTrendlineLabel: string;
  weightTrendlineLabel: string;
  tdeeReference: number | null;
  targetWeightReference?: number | null;
  entries: DailyEntry[];
  savingHistoryCalories: Record<string, boolean>;
  savingHistoryWeight: Record<string, boolean>;
  historySummaryBaselineDate?: string | null;
}>();

const emit = defineEmits<{
  "save-calories": [date: string, calories: number | null];
  "save-weight": [date: string, weight: number | null];
  "delete-day": [date: string];
  "save-history-baseline": [date: string];
  "clear-history-baseline": [];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="route-stack">
    <div class="chart-grid">
      <BasePanel id="graphCaloriesPanel" class="chart-card" :title="t('graphCalories')" collapsible>
        <MetricChart
          :locale="locale"
          :points="caloriePoints"
          :label="t('graphCalories')"
          :y-unit="t('unitKcal')"
          :trendline="{ label: calorieTrendlineLabel, color: '#138f84' }"
          :reference-lines="[
            { label: t('tdeeSummary'), value: tdeeReference, color: '#5d9f8f' },
          ]"
        />
      </BasePanel>

      <BasePanel id="graphWeightPanel" class="chart-card" :title="t('graphWeight')" collapsible>
        <MetricChart
          :locale="locale"
          :points="weightPoints"
          :label="t('graphWeight')"
          :y-unit="t('unitKg')"
          :trendline="{ label: weightTrendlineLabel, color: '#138f84' }"
        />
      </BasePanel>
    </div>

    <HistoryPanel
      :locale="locale"
      :entries="entries"
      :saving-calories="savingHistoryCalories"
      :saving-weight="savingHistoryWeight"
      :tdee-reference="tdeeReference"
      :target-weight-reference="targetWeightReference"
      :baseline-date="historySummaryBaselineDate"
      @save-calories="(...args) => emit('save-calories', ...args)"
      @save-weight="(...args) => emit('save-weight', ...args)"
      @delete-day="emit('delete-day', $event)"
      @save-baseline="emit('save-history-baseline', $event)"
      @clear-baseline="emit('clear-history-baseline')"
    />
  </section>
</template>

<style scoped>
.route-stack {
  display: grid;
  gap: 1rem;
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.chart-card {
  min-inline-size: 0;
}

@media (max-width: 900px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
}
</style>
