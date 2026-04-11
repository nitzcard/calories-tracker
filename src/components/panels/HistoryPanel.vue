<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import HistoryCaloriesCell from "./HistoryCaloriesCell.vue";
import HistoryWeightCell from "./HistoryWeightCell.vue";
import type { AppLocale, DailyEntry } from "../../types";
import {
  deducedWeightFromEntries,
  formatEntryDate,
  resolvedDailyCalories,
} from "../../domain/entries";

const props = defineProps<{
  locale: AppLocale;
  entries: DailyEntry[];
  savingCalories: Record<string, boolean>;
  savingWeight: Record<string, boolean>;
  tdeeReference: number | null;
  targetWeightReference?: number | null;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  "save-calories": [date: string, calories: number | null];
  "save-weight": [date: string, weight: number | null];
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

function caloriesRemainingToTarget(entry: DailyEntry) {
  if (props.targetWeightReference == null) {
    return "-";
  }

  const effectiveWeight = entry.weight ?? deducedWeightFromEntries(props.entries, entry.date);
  if (effectiveWeight == null) {
    return "-";
  }

  const remaining = Math.round(Math.max(0, effectiveWeight - props.targetWeightReference) * 7700);
  return String(remaining);
}

function deltaPartsFromDelta(delta: number) {
  if (delta === 0) {
    return { kind: "maintenance" as const, amount: null as number | null };
  }

  if (delta < 0) {
    return { kind: "deficit" as const, amount: Math.abs(delta) };
  }

  return { kind: "surplus" as const, amount: delta };
}

function deficitOrSurplusParts(entry: DailyEntry) {
  const calories = resolvedDailyCalories(entry);
  if (calories == null || props.tdeeReference == null) {
    return { kind: "unknown" as const, amount: null as number | null };
  }

  return deltaPartsFromDelta(calories - props.tdeeReference);
}

function summaryDeltaParts(totalDelta: number) {
  return deltaPartsFromDelta(totalDelta);
}

function deltaLabel(kind: "deficit" | "surplus" | "maintenance" | "unknown") {
  if (kind === "deficit") return t("deficitLabel");
  if (kind === "surplus") return t("surplusLabel");
  if (kind === "maintenance") return t("maintenanceLabel");
  return "-";
}

</script>

<template>
  <BasePanel id="historyPanel" class="history-panel" :title="t('history')" :helper="t('historyHelper')" collapsible>
    <div class="history-table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ t("date") }}</th>
            <th>{{ t("weightWithUnit") }}</th>
            <th class="calories-column">{{ t("calories") }}</th>
            <th class="numeric-pair">{{ t("caloriesRemainingToTarget") }}</th>
            <th>{{ t("deficitSurplus") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr class="summary-row">
            <td colspan="4">{{ t("allTimeDeficitSurplus") }}</td>
            <td class="delta-cell">
              <template v-if="tdeeReference != null">
                <span class="delta-inline">
                  <span class="delta-word">
                    {{ deltaLabel(summaryDeltaParts(cumulativeDelta).kind) }}
                  </span>
                  <span v-if="summaryDeltaParts(cumulativeDelta).amount != null" class="delta-num" dir="ltr">
                    {{ summaryDeltaParts(cumulativeDelta).amount }}
                  </span>
                </span>
              </template>
              <template v-else>-</template>
            </td>
          </tr>
          <tr class="summary-row summary-row--recent">
            <td colspan="4">{{ t("last7dDeficitSurplus") }}</td>
            <td class="delta-cell">
              <template v-if="tdeeReference != null">
                <span class="delta-inline">
                  <span class="delta-word">
                    {{ deltaLabel(summaryDeltaParts(rolling7dDelta).kind) }}
                  </span>
                  <span v-if="summaryDeltaParts(rolling7dDelta).amount != null" class="delta-num" dir="ltr">
                    {{ summaryDeltaParts(rolling7dDelta).amount }}
                  </span>
                </span>
              </template>
              <template v-else>-</template>
            </td>
          </tr>
        <tr v-for="entry in sortedEntries" :key="entry.date">
          <td>{{ formatEntryDate(entry.date, locale) }}</td>
          <td class="weight-cell">
            <HistoryWeightCell
              :value="entry.weight"
              :fallback-value="deducedWeightFromEntries(entries, entry.date)"
              :is-saving="Boolean(savingWeight[entry.date])"
              @save="emit('save-weight', entry.date, $event)"
            />
          </td>
          <td class="calories-column">
            <HistoryCaloriesCell
              :value="entry.manualCalories"
              :fallback-value="resolvedDailyCalories(entry)"
              :is-saving="Boolean(savingCalories[entry.date])"
              @save="emit('save-calories', entry.date, $event)"
            />
            <small v-if="tdeeReference != null" class="tdee-footnote">/ {{ tdeeReference }}</small>
          </td>
	          <td class="numeric-pair">{{ caloriesRemainingToTarget(entry) }}</td>
	          <td class="delta-cell">
	            <template v-if="deficitOrSurplusParts(entry).kind !== 'unknown'">
	              <span class="delta-inline">
	                <span class="delta-word">{{ deltaLabel(deficitOrSurplusParts(entry).kind) }}</span>
	                <span
	                  v-if="deficitOrSurplusParts(entry).amount != null"
	                  class="delta-num"
	                  dir="ltr"
	                >
	                  {{ deficitOrSurplusParts(entry).amount }}
	                </span>
	              </span>
	            </template>
	            <template v-else>-</template>
	          </td>
	        </tr>
	      </tbody>
    </table>
  </div>

    <div class="history-cards" aria-label="History cards">
	      <div class="history-card summary-card">
	        <div class="history-card__title">{{ t("allTimeDeficitSurplus") }}</div>
	        <div class="history-card__value" v-if="tdeeReference != null">
	          <span class="delta-inline">
	            <span class="delta-word">{{ deltaLabel(summaryDeltaParts(cumulativeDelta).kind) }}</span>
	            <span
	              v-if="summaryDeltaParts(cumulativeDelta).amount != null"
	              class="delta-num"
	              dir="ltr"
	            >
	              {{ summaryDeltaParts(cumulativeDelta).amount }}
	            </span>
	          </span>
	        </div>
	        <div class="history-card__value" v-else>-</div>
	      </div>
	      <div class="history-card summary-card summary-card--recent">
	        <div class="history-card__title">{{ t("last7dDeficitSurplus") }}</div>
	        <div class="history-card__value" v-if="tdeeReference != null">
	          <span class="delta-inline">
	            <span class="delta-word">{{ deltaLabel(summaryDeltaParts(rolling7dDelta).kind) }}</span>
	            <span
	              v-if="summaryDeltaParts(rolling7dDelta).amount != null"
	              class="delta-num"
	              dir="ltr"
	            >
	              {{ summaryDeltaParts(rolling7dDelta).amount }}
	            </span>
	          </span>
	        </div>
	        <div class="history-card__value" v-else>-</div>
	      </div>

      <div v-for="entry in sortedEntries" :key="`card-${entry.date}`" class="history-card">
        <div class="history-card__row">
          <div class="k">{{ t("date") }}</div>
          <div class="v">{{ formatEntryDate(entry.date, locale) }}</div>
        </div>
        <div class="history-card__row">
          <div class="k">{{ t("weightWithUnit") }}</div>
          <div class="v">
            <HistoryWeightCell
              :value="entry.weight"
              :fallback-value="deducedWeightFromEntries(entries, entry.date)"
              :is-saving="Boolean(savingWeight[entry.date])"
              @save="emit('save-weight', entry.date, $event)"
            />
          </div>
        </div>
        <div class="history-card__row">
          <div class="k">{{ t("calories") }}</div>
          <div class="v v--calories">
            <HistoryCaloriesCell
              :value="entry.manualCalories"
              :fallback-value="resolvedDailyCalories(entry)"
              :is-saving="Boolean(savingCalories[entry.date])"
              @save="emit('save-calories', entry.date, $event)"
            />
            <small v-if="tdeeReference != null" class="tdee-footnote">/ {{ tdeeReference }}</small>
          </div>
        </div>
        <div class="history-card__row">
          <div class="k">{{ t("caloriesRemainingToTarget") }}</div>
          <div class="v numeric-pair">{{ caloriesRemainingToTarget(entry) }}</div>
        </div>
	        <div class="history-card__row">
	          <div class="k">{{ t("deficitSurplus") }}</div>
	          <div class="v">
	            <template v-if="deficitOrSurplusParts(entry).kind !== 'unknown'">
	              <span class="delta-inline">
	                <span class="delta-word">{{ deltaLabel(deficitOrSurplusParts(entry).kind) }}</span>
	                <span
	                  v-if="deficitOrSurplusParts(entry).amount != null"
	                  class="delta-num"
	                  dir="ltr"
	                >
	                  {{ deficitOrSurplusParts(entry).amount }}
	                </span>
	              </span>
	            </template>
	            <template v-else>-</template>
	          </div>
	        </div>
	      </div>
    </div>
  </BasePanel>
</template>

<style scoped>
.history-panel {
  grid-column: 1 / -1;
}

.history-table-wrap {
  overflow-x: auto;
}

.history-cards {
  display: none;
}

.numeric-pair {
  direction: ltr;
  text-align: left;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.weight-num {
  direction: ltr;
  unicode-bidi: isolate;
  font-variant-numeric: tabular-nums;
}

.delta-inline {
  display: inline-flex;
  align-items: baseline;
  gap: 0.55rem;
  white-space: nowrap;
}

.delta-num {
  font-variant-numeric: tabular-nums;
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

.calories-column {
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.tdee-footnote {
  display: block;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .history-table-wrap {
    display: none;
  }

  .history-cards {
    display: grid;
    gap: 8px;
  }

  .history-card {
    border: 1px solid var(--border);
    background: var(--surface-2);
    box-shadow: var(--bevel-raised);
    padding: 8px;
    display: grid;
    gap: 6px;
  }

  .summary-card {
    background: color-mix(in srgb, #6e5b28 16%, var(--surface));
    font-weight: 700;
  }

  .summary-card--recent {
    background: color-mix(in srgb, #3a5f7a 14%, var(--surface));
  }

  .history-card__row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .history-card__title {
    font-weight: 700;
  }

  .history-card__value {
    font-variant-numeric: tabular-nums;
  }

  .k {
    color: var(--text-muted);
    font-size: 0.85rem;
    flex: 0 0 auto;
  }

  .v {
    min-inline-size: 0;
    flex: 1 1 auto;
    text-align: end;
  }

  .v.numeric-pair {
    text-align: start;
  }

  .v--calories {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 4px;
    flex-wrap: nowrap;
  }

  .v--calories :deep(.field-control) {
    flex: 0 0 auto;
    max-inline-size: 6rem;
  }

  .v--calories .tdee-footnote {
    display: inline;
    white-space: nowrap;
    flex: 0 0 auto;
  }

  .delta-word {
    color: var(--text-primary);
  }

  .history-cards :deep(input[type="number"]) {
    max-inline-size: 8rem;
  }
}

@media (min-width: 641px) {
  /* Keep desktop history table dense. */
  .history-table-wrap :deep(th),
  .history-table-wrap :deep(td) {
    padding: 0.26rem 0.4rem;
    vertical-align: middle;
    line-height: 1.1;
  }

  .delta-cell {
    white-space: nowrap;
  }
}
</style>
