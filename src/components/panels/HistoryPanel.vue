<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import HistoryCaloriesCell from "./HistoryCaloriesCell.vue";
import type { AppLocale, DailyEntry } from "../../types";
import { formatEntryDate, resolvedDailyCalories } from "../../domain/entries";

const props = defineProps<{
  locale: AppLocale;
  entries: DailyEntry[];
  savingCalories: Record<string, boolean>;
  tdeeReference: number | null;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  "save-calories": [date: string, calories: number | null];
}>();

const sortedEntries = computed(() =>
  [...props.entries].sort((a, b) => b.date.localeCompare(a.date)),
);
const cumulativeDelta = computed(() =>
  sortedEntries.value.reduce((sum, entry) => {
    const calories = resolvedDailyCalories(entry);
    if (calories == null || props.tdeeReference == null) {
      return sum;
    }

    return sum + (calories - props.tdeeReference);
  }, 0),
);
const rolling7dDelta = computed(() =>
  sortedEntries.value.slice(0, 7).reduce((sum, entry) => {
    const calories = resolvedDailyCalories(entry);
    if (calories == null || props.tdeeReference == null) {
      return sum;
    }

    return sum + (calories - props.tdeeReference);
  }, 0),
);

function caloriesVsTdee(entry: DailyEntry) {
  const calories = resolvedDailyCalories(entry);
  if (calories == null || props.tdeeReference == null) {
    return "-";
  }

  return `${calories} / ${props.tdeeReference}`;
}

function deficitOrSurplus(entry: DailyEntry) {
  const calories = resolvedDailyCalories(entry);
  if (calories == null || props.tdeeReference == null) {
    return "-";
  }

  const delta = calories - props.tdeeReference;
  if (delta === 0) {
    return t("maintenanceLabel");
  }

  if (delta < 0) {
    return `${t("deficitLabel")} ${Math.abs(delta)}`;
  }

  return `${t("surplusLabel")} ${delta}`;
}

function cumulativeDeficitOrSurplus() {
  if (props.tdeeReference == null) {
    return "-";
  }

  if (cumulativeDelta.value === 0) {
    return t("maintenanceLabel");
  }

  if (cumulativeDelta.value < 0) {
    return `${t("deficitLabel")} ${Math.abs(cumulativeDelta.value)}`;
  }

  return `${t("surplusLabel")} ${cumulativeDelta.value}`;
}

function rolling7dDeficitOrSurplus() {
  if (props.tdeeReference == null) {
    return "-";
  }

  if (rolling7dDelta.value === 0) {
    return t("maintenanceLabel");
  }

  if (rolling7dDelta.value < 0) {
    return `${t("deficitLabel")} ${Math.abs(rolling7dDelta.value)}`;
  }

  return `${t("surplusLabel")} ${rolling7dDelta.value}`;
}
</script>

<template>
  <BasePanel class="history-panel" :title="t('history')" :helper="t('historyHelper')">
    <table>
      <thead>
        <tr>
          <th>{{ t("date") }}</th>
          <th>{{ t("weight") }}</th>
          <th>{{ t("calories") }}</th>
          <th class="numeric-pair">{{ t("caloriesVsTdee") }}</th>
          <th>{{ t("deficitSurplus") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr class="summary-row">
          <td colspan="4">{{ t("allTimeDeficitSurplus") }}</td>
          <td>{{ cumulativeDeficitOrSurplus() }}</td>
        </tr>
        <tr class="summary-row summary-row--recent">
          <td colspan="4">{{ t("last7dDeficitSurplus") }}</td>
          <td>{{ rolling7dDeficitOrSurplus() }}</td>
        </tr>
        <tr v-for="entry in sortedEntries" :key="entry.date">
          <td>{{ formatEntryDate(entry.date, locale) }}</td>
          <td>{{ entry.weight ?? "-" }}</td>
          <td>
            <HistoryCaloriesCell
              :value="entry.manualCalories"
              :fallback-value="resolvedDailyCalories(entry)"
              :is-saving="Boolean(savingCalories[entry.date])"
              @save="emit('save-calories', entry.date, $event)"
            />
          </td>
          <td class="numeric-pair">{{ caloriesVsTdee(entry) }}</td>
          <td>{{ deficitOrSurplus(entry) }}</td>
        </tr>
      </tbody>
    </table>
  </BasePanel>
</template>

<style scoped>
.history-panel {
  grid-column: 1 / -1;
}

.numeric-pair {
  direction: ltr;
  text-align: left;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.summary-row {
  background: color-mix(in srgb, #6e5b28 16%, var(--surface));
}

.summary-row td {
  font-weight: 700;
}

.summary-row--recent {
  background: color-mix(in srgb, #3a5f7a 14%, var(--surface));
}
</style>
