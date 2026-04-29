<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import HistoryCaloriesCell from "./HistoryCaloriesCell.vue";
import HistoryWeightCell from "./HistoryWeightCell.vue";
import type { AppLocale, DailyEntry } from "../../types";
import {
  chartDayTimestamp,
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
  baselineDate?: string | null;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  "save-calories": [date: string, calories: number | null];
  "save-weight": [date: string, weight: number | null];
  "delete-day": [date: string];
  "save-baseline": [date: string];
  "clear-baseline": [];
}>();

const baselineDraft = ref(props.baselineDate ?? "");

watch(
  () => props.baselineDate,
  (next) => {
    baselineDraft.value = next ?? "";
  },
  { immediate: true },
);

const sortedEntries = computed(() =>
  [...props.entries].sort((a, b) => b.date.localeCompare(a.date)),
);
const entriesWithCalories = computed(() =>
  sortedEntries.value.filter((entry) => {
    if (resolvedDailyCalories(entry) == null) {
      return false;
    }

    if (!props.baselineDate) {
      return true;
    }

    return entry.date >= props.baselineDate;
  }),
);
const cumulativeDelta = computed(() =>
  entriesWithCalories.value.reduce((sum, entry) => {
    const calories = resolvedDailyCalories(entry);
    if (calories == null || props.tdeeReference == null) {
      return sum;
    }

    return sum + (calories - props.tdeeReference);
  }, 0),
);
const rolling7dEntries = computed(() => {
  const anchorDate = entriesWithCalories.value[0]?.date;
  if (!anchorDate) {
    return [];
  }

  const cutoff = chartDayTimestamp(anchorDate) - 6 * 86400000;
  return entriesWithCalories.value.filter((entry) => chartDayTimestamp(entry.date) >= cutoff);
});
const rolling7dDelta = computed(() =>
  rolling7dEntries.value.reduce((sum, entry) => {
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

  const effectiveWeight =
    entry.weight ?? deducedWeightFromEntries(props.entries, entry.date);
  if (effectiveWeight == null) {
    return "-";
  }

  const remaining = Math.round(Math.max(0, effectiveWeight - props.targetWeightReference) * 7700);
  return String(remaining);
}

function deltaPartsFromDelta(delta: number) {
  const normalizedDelta = parseFloat(delta.toFixed(2));
  if (normalizedDelta === 0) {
    return { kind: "maintenance" as const, amount: null as number | null };
  }

  if (normalizedDelta < 0) {
    return { kind: "deficit" as const, amount: Math.abs(normalizedDelta) };
  }

  return { kind: "surplus" as const, amount: normalizedDelta };
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

const hasBaseline = computed(() => Boolean(props.baselineDate));
const baselineLabel = computed(() =>
  props.baselineDate ? formatEntryDate(props.baselineDate, props.locale) : "",
);

function updateBaseline(value: string) {
  baselineDraft.value = value;
  if (!value.trim()) {
    emit("clear-baseline");
    return;
  }

  emit("save-baseline", value);
}

</script>

<template>
  <BasePanel id="historyPanel" class="history-panel" :title="t('history')" :helper="t('historyHelper')" collapsible>
    <div class="history-toolbar">
      <label class="history-toolbar__field">
        <span>{{ t("historyResetFromDate") }}</span>
        <input
          type="date"
          :value="baselineDraft"
          data-testid="history-baseline-date"
          @input="updateBaseline(($event.target as HTMLInputElement).value)"
        />
        <small class="history-toolbar__helper">{{ t("historyResetHelper") }}</small>
      </label>
      <span v-if="hasBaseline" class="history-baseline-pill">
        {{ t("historyBaselineActive", { date: baselineLabel }) }}
      </span>
    </div>

    <div class="history-table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ t("date") }}</th>
            <th>{{ t("weightWithUnit") }}</th>
            <th class="calories-column">{{ t("calories") }}</th>
            <th class="numeric-pair">{{ t("caloriesRemainingToTarget") }}</th>
            <th>{{ t("deficitSurplus") }}</th>
            <th class="history-action-column" aria-label="Actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr class="summary-row">
            <td colspan="4">
              {{ t("allTimeDeficitSurplus") }}
            </td>
            <td class="delta-cell">
              <template v-if="tdeeReference != null">
                <span class="delta-inline">
                  <span class="delta-word">
                    {{ deltaLabel(summaryDeltaParts(cumulativeDelta).kind) }}
                  </span>
                  <span
                    v-if="summaryDeltaParts(cumulativeDelta).amount != null"
                    class="delta-num"
                    dir="ltr"
                    data-testid="history-all-time-delta"
                  >
                    {{ summaryDeltaParts(cumulativeDelta).amount }}
                  </span>
                </span>
              </template>
              <template v-else>-</template>
            </td>
            <td class="history-action-cell"></td>
          </tr>
          <tr class="summary-row summary-row--recent">
            <td colspan="4">
              {{ t("last7dDeficitSurplus") }}
            </td>
            <td class="delta-cell">
              <template v-if="tdeeReference != null">
                <span class="delta-inline">
                  <span class="delta-word">
                    {{ deltaLabel(summaryDeltaParts(rolling7dDelta).kind) }}
                  </span>
                  <span
                    v-if="summaryDeltaParts(rolling7dDelta).amount != null"
                    class="delta-num"
                    dir="ltr"
                    data-testid="history-last7d-delta"
                  >
                    {{ summaryDeltaParts(rolling7dDelta).amount }}
                  </span>
                </span>
              </template>
              <template v-else>-</template>
            </td>
            <td class="history-action-cell"></td>
          </tr>
        <tr v-for="entry in sortedEntries" :key="entry.date">
          <td>{{ formatEntryDate(entry.date, locale) }}</td>
          <td class="weight-cell">
            <HistoryWeightCell
              :value="entry.weight"
              :fallback-value="deducedWeightFromEntries(entries, entry.date)"
              :is-saving="Boolean(savingWeight[entry.date])"
              :input-test-id="`history-weight-${entry.date}`"
              @save="emit('save-weight', entry.date, $event)"
            />
          </td>
          <td class="calories-column">
            <div class="calories-inline" dir="ltr">
              <HistoryCaloriesCell
                :value="entry.manualCalories"
                :fallback-value="resolvedDailyCalories(entry)"
                :is-saving="Boolean(savingCalories[entry.date])"
                :input-test-id="`history-calories-${entry.date}`"
                @save="emit('save-calories', entry.date, $event)"
              />
              <small v-if="tdeeReference != null" class="tdee-footnote" dir="ltr">
                <span class="tdee-divider">/</span>
                <span class="tdee-value">{{ tdeeReference }}</span>
              </small>
            </div>
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
	          <td class="history-action-cell">
              <button
                class="history-delete-button"
                type="button"
                :data-delete-date="entry.date"
                :aria-label="`${t('deleteDay')} ${formatEntryDate(entry.date, locale)}`"
                @click="emit('delete-day', entry.date)"
              >
                <svg viewBox="0 0 24 24" class="history-delete-button__icon" aria-hidden="true">
                  <path
                    d="M9.75 3.75h4.5m-7.5 3h10.5m-9.75 0 .6 10.05c.05.84.746 1.5 1.588 1.5h4.624c.842 0 1.538-.66 1.588-1.5l.6-10.05m-6 2.55v6m3-6v6"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.7"
                  />
                </svg>
              </button>
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
        <div class="history-card__header">
          <div class="history-card__date">{{ formatEntryDate(entry.date, locale) }}</div>
          <button
            class="history-delete-button"
            type="button"
            :data-delete-date="entry.date"
            :aria-label="`${t('deleteDay')} ${formatEntryDate(entry.date, locale)}`"
            @click="emit('delete-day', entry.date)"
          >
            <svg viewBox="0 0 24 24" class="history-delete-button__icon" aria-hidden="true">
              <path
                d="M9.75 3.75h4.5m-7.5 3h10.5m-9.75 0 .6 10.05c.05.84.746 1.5 1.588 1.5h4.624c.842 0 1.538-.66 1.588-1.5l.6-10.05m-6 2.55v6m3-6v6"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.7"
              />
            </svg>
          </button>
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
            <div class="calories-card-inline" dir="ltr">
              <HistoryCaloriesCell
                :value="entry.manualCalories"
                :fallback-value="resolvedDailyCalories(entry)"
                :is-saving="Boolean(savingCalories[entry.date])"
                @save="emit('save-calories', entry.date, $event)"
              />
              <small v-if="tdeeReference != null" class="tdee-footnote">
                <span class="tdee-divider">/</span>
                <span class="tdee-value">{{ tdeeReference }}</span>
              </small>
            </div>
          </div>
        </div>
        <div class="history-card__row">
          <div class="k">{{ t("caloriesRemainingToTarget") }}</div>
          <div class="v numeric-pair"><span dir="ltr">{{ caloriesRemainingToTarget(entry) }}</span></div>
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

.history-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.85rem;
  margin-block-end: 1rem;
}

.history-toolbar__field {
  display: grid;
  gap: 0.35rem;
  min-inline-size: min(100%, 12rem);
  color: var(--text-muted);
  font-size: 0.9rem;
}

.history-toolbar__helper {
  color: var(--text-muted);
  font-size: 0.84rem;
  line-height: 1.35;
}

.history-baseline-pill {
  padding: 0.45rem 0.7rem;
  border-radius: 0.55rem;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
  color: var(--text-primary);
  font-size: 0.9rem;
  font-weight: 600;
}

.history-weight-strategy {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.7rem 1rem;
  margin: 0;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  box-shadow: var(--bevel-sunken);
}

.history-weight-strategy__legend {
  padding: 0 0.45rem;
  background: var(--panel);
  border-radius: 0.4rem;
  color: var(--text-muted);
  font-weight: 700;
}

.history-weight-strategy__helper {
  flex: 1 1 100%;
  color: var(--text-muted);
  font-size: 0.92rem;
  line-height: 1.3;
}

.history-weight-strategy__option {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
}

.history-cards {
  display: none;
}

.history-action-column,
.history-action-cell {
  width: 1%;
  white-space: nowrap;
}

.history-delete-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 2rem;
  block-size: 2rem;
  min-inline-size: 2rem;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--text-muted) 88%, transparent);
  box-shadow: none;
}

.history-delete-button:hover,
.history-delete-button:focus-visible {
  background: color-mix(in srgb, var(--required-outline) 10%, var(--surface-2));
  color: color-mix(in srgb, var(--required-outline) 72%, var(--text-primary));
}

.history-delete-button__icon {
  inline-size: 1rem;
  block-size: 1rem;
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

.calories-inline {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: nowrap;
  white-space: nowrap;
  unicode-bidi: isolate;
}

.calories-inline :deep(.field-control) {
  flex: 0 1 8.5rem;
  min-inline-size: 7.5rem;
}

.calories-inline :deep(input[type="number"]) {
  inline-size: 100%;
  max-inline-size: none;
}

.tdee-footnote {
  color: var(--text-muted);
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: baseline;
  gap: 0.32rem;
  unicode-bidi: isolate;
}

.tdee-divider {
  font-size: 0.92rem;
}

.tdee-value {
  font-size: 1.2rem;
  line-height: 1;
}

@media (max-width: 640px) {
  .history-toolbar {
    align-items: stretch;
  }

  .history-toolbar__field,
  .history-toolbar__actions {
    inline-size: 100%;
  }

  .history-table-wrap {
    display: none;
  }

  .history-cards {
    display: grid;
    gap: 8px;
  }

  .history-card {
    border: 1px solid color-mix(in srgb, var(--border-strong) 68%, transparent);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 96%, transparent), color-mix(in srgb, var(--surface-2) 94%, transparent));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 10px 24px rgba(8, 24, 24, 0.08);
    border-radius: calc(var(--radius) + 0.08rem);
    padding: 0.9rem 0.95rem;
    display: grid;
    gap: 0.72rem;
  }

  .summary-card {
    background:
      linear-gradient(180deg, color-mix(in srgb, #6e5b28 15%, var(--surface-1)), color-mix(in srgb, #6e5b28 11%, var(--surface-2)));
    font-weight: 700;
  }

  .summary-card--recent {
    background:
      linear-gradient(180deg, color-mix(in srgb, #3a5f7a 14%, var(--surface-1)), color-mix(in srgb, #3a5f7a 10%, var(--surface-2)));
  }

  .history-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.85rem;
    padding-block-end: 0.15rem;
    border-block-end: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
  }

  .history-card__date {
    font-weight: 760;
    font-size: 0.98rem;
    letter-spacing: -0.01em;
  }

  .history-card__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-block: 0.08rem;
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
    font-weight: 600;
  }

  .v {
    min-inline-size: 0;
    flex: 1 1 auto;
    text-align: end;
  }

  .history-cards .numeric-pair {
    direction: inherit;
    text-align: end;
  }

  .v--calories {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 4px;
    flex-wrap: nowrap;
    unicode-bidi: isolate;
  }

  .calories-card-inline {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    flex-wrap: nowrap;
    white-space: nowrap;
    unicode-bidi: isolate;
    min-inline-size: 0;
  }

  .v--calories :deep(.field-control) {
    flex: 1 1 8.5rem;
    min-inline-size: 7.5rem;
    max-inline-size: none;
  }

  .v--calories :deep(input[type="number"]) {
    inline-size: 100%;
    max-inline-size: none;
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
