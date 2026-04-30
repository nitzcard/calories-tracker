<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../components/base/BasePanel.vue";
import MetricChart from "../components/charts/MetricChart.vue";
import HistoryPanel from "../components/panels/HistoryPanel.vue";
import type { AppLocale, ChartScope, DailyEntry } from "../types";

const props = defineProps<{
  locale: AppLocale;
  caloriePoints: Array<{ x: number; y: number | null }>;
  weightPoints: Array<{ x: number; y: number | null }>;
  calorieTrendlineLabel: string;
  weightTrendlineLabel: string;
  tdeeReferences: Record<ChartScope, number | null>;
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
const calorieScope = ref<ChartScope>("all");
const weightScope = ref<ChartScope>("all");
const activeTdeeReference = computed(() => props.tdeeReferences[calorieScope.value] ?? null);
const scopedCaloriePoints = computed(() => scopePoints(props.caloriePoints, calorieScope.value));
const scopedCalorieTrendlineLabel = computed(() => {
  const base = t("trendLine");
  const tdeeValue = activeTdeeReference.value;
  if (typeof tdeeValue !== "number" || !Number.isFinite(tdeeValue)) {
    return base;
  }

  const ys = scopedCaloriePoints.value
    .map((point) => point.y)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!ys.length) {
    return base;
  }

  const averageCalories = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const roundedDelta = Math.round(averageCalories - tdeeValue);
  const normalizedDelta = Object.is(roundedDelta, -0) ? 0 : roundedDelta;
  const formatter = new Intl.NumberFormat(props.locale === "he" ? "he-IL" : "en-US", {
    maximumFractionDigits: 0,
  });
  const signedDelta = `${normalizedDelta > 0 ? "+" : ""}${formatter.format(normalizedDelta)}`;
  const suffix =
    props.locale === "he"
      ? `${signedDelta} ${t("unitKcal")} מול TDEE`
      : `${signedDelta} ${t("unitKcal")} vs TDEE`;

  return `${base} (${suffix})`;
});

function normalizeTimestamp(value: number) {
  return value > 1e12 ? Math.floor(value / 1000) : value;
}

function scopePoints(
  points: Array<{ x: number; y: number | null }>,
  scope: ChartScope,
) {
  if (scope === "all") {
    return points;
  }

  const normalized = points
    .map((point) => ({ ...point, x: normalizeTimestamp(point.x) }))
    .sort((left, right) => left.x - right.x);
  const anchor = normalized.at(-1)?.x;
  if (!anchor) {
    return points;
  }

  const days = scope === "7d" ? 7 : 30;
  const min = anchor - (days - 1) * 24 * 60 * 60 - 12 * 60 * 60;
  return normalized.filter((point) => point.x >= min && point.x <= anchor);
}
</script>

<template>
  <section class="route-stack">
    <div class="chart-grid">
      <BasePanel id="graphCaloriesPanel" class="chart-card" :title="t('graphCalories')" collapsible>
        <MetricChart
          :locale="locale"
          :points="caloriePoints"
          :scope="calorieScope"
          :label="t('graphCalories')"
          :y-unit="t('unitKcal')"
          :trendline="{ label: scopedCalorieTrendlineLabel, color: '#138f84' }"
          :reference-lines="[
            { label: t('tdeeSummary'), value: activeTdeeReference, color: '#5d9f8f' },
          ]"
          @update:scope="calorieScope = $event"
        />
      </BasePanel>

      <BasePanel id="graphWeightPanel" class="chart-card" :title="t('graphWeight')" collapsible>
        <MetricChart
          :locale="locale"
          :points="weightPoints"
          :scope="weightScope"
          :label="t('graphWeight')"
          :y-unit="t('unitKg')"
          :trendline="{ label: weightTrendlineLabel, color: '#138f84' }"
          @update:scope="weightScope = $event"
        />
      </BasePanel>
    </div>

    <HistoryPanel
      :locale="locale"
      :entries="entries"
      :saving-calories="savingHistoryCalories"
      :saving-weight="savingHistoryWeight"
      :tdee-reference="activeTdeeReference"
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
