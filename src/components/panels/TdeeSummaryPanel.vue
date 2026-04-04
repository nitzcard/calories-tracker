<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import FieldControl from "../base/FieldControl.vue";
import FormField from "../base/FormField.vue";
import type { AppLocale, TdeeEquation, TdeeSnapshot } from "../../types";
import { formatEntryDate } from "../../domain/entries";

const props = defineProps<{
  locale: AppLocale;
  tdee: TdeeSnapshot;
  selectedEquation: TdeeEquation;
  highlightToken?: number;
  isUpdating?: boolean;
  isSavingEquation?: boolean;
}>();

const isHighlighted = ref(false);
let highlightTimeout: ReturnType<typeof setTimeout> | null = null;
const { t } = useI18n();
const emit = defineEmits<{
  "select-equation": [value: TdeeEquation];
}>();

watch(
  () => props.highlightToken,
  (next, previous) => {
    if (!next || next === previous) {
      return;
    }

    isHighlighted.value = true;
    if (highlightTimeout) {
      clearTimeout(highlightTimeout);
    }
    highlightTimeout = setTimeout(() => {
      isHighlighted.value = false;
    }, 2800);
  },
);

const tdeeParts = [
  {
    labelKey: "tdeePartRestingLabel",
    termKey: "tdeePartRestingTerm",
    rangeKey: "tdeePartRestingRange",
    descKey: "tdeePartRestingDesc",
  },
  {
    labelKey: "tdeePartExerciseLabel",
    termKey: "tdeePartExerciseTerm",
    rangeKey: "tdeePartExerciseRange",
    descKey: "tdeePartExerciseDesc",
  },
  {
    labelKey: "tdeePartNeatLabel",
    termKey: "tdeePartNeatTerm",
    rangeKey: "tdeePartNeatRange",
    descKey: "tdeePartNeatDesc",
  },
  {
    labelKey: "tdeePartThermicLabel",
    termKey: "tdeePartThermicTerm",
    rangeKey: "tdeePartThermicRange",
    descKey: "tdeePartThermicDesc",
  },
] as const;

function formulaLabel(name: string) {
  const labels: Record<string, string> = {
    mifflinStJeor: "Mifflin-St Jeor",
    harrisBenedict: "Harris-Benedict",
    cunningham: "Cunningham",
  };

  return labels[name] ?? name;
}

function formulaExplain(name: string) {
  const key = `${name}Explain` as const;
  return t(key);
}

function formulaHref(name: string) {
  const urls: Record<string, string> = {
    mifflinStJeor: "https://pubmed.ncbi.nlm.nih.gov/2305711/",
    harrisBenedict: "https://en.wikipedia.org/wiki/Harris%E2%80%93Benedict_equation",
    cunningham: "https://pubmed.ncbi.nlm.nih.gov/25275434/",
  };

  return urls[name] ?? "#";
}

function weightSourceText(source: "estimated" | "deduced" | "logged" | null) {
  if (source === "estimated") {
    return t("weightSourceEstimated");
  }

  if (source === "deduced") {
    return t("weightSourceDeduced");
  }

  return t("weightSourceLogged");
}

const selectedEquationText = computed(() => {
  if (props.selectedEquation === "formulaAverage") {
    return t("formulaAverage");
  }

  if (props.selectedEquation === "observedTdee") {
    return t("observedTdee");
  }

  return formulaLabel(props.selectedEquation);
});
</script>

<template>
  <BasePanel
    :class="isHighlighted ? 'tdee-panel--highlighted' : ''"
    :title="t('tdeeSummary')"
    :helper="t('tdeeHelper')"
  >
    <div class="tdee-controls">
      <FormField :label="t('tdeeEquation')">
        <FieldControl as="select" :is-saving="isSavingEquation">
          <select
            :value="selectedEquation"
            @change="emit('select-equation', ($event.target as HTMLSelectElement).value as TdeeEquation)"
          >
            <option value="formulaAverage">{{ t("formulaAverage") }}</option>
            <option value="mifflinStJeor">Mifflin-St Jeor</option>
            <option value="harrisBenedict">Harris-Benedict</option>
            <option value="cunningham">Cunningham</option>
            <option value="observedTdee">{{ t("observedTdee") }}</option>
          </select>
        </FieldControl>
      </FormField>
      <p class="tdee-reference-helper">
        {{ t("tdeeEquationHelper") }}:
        <strong>{{ selectedEquationText }}</strong>
      </p>
    </div>

    <div class="tdee-explainer">
      <strong>{{ t("tdeePartsTitle") }}</strong>
      <div class="tdee-parts-list">
        <div v-for="part in tdeeParts" :key="part.labelKey" class="tdee-part-row">
          <div class="tdee-part-heading">
            <div class="tdee-part-labels">
              <span class="tdee-part-name">{{ t(part.labelKey) }}</span>
              <span class="tdee-part-term" dir="ltr">{{ t(part.termKey) }}</span>
            </div>
            <span class="tdee-part-range" dir="ltr">{{ t(part.rangeKey) }}</span>
          </div>
          <div class="tdee-part-desc">{{ t(part.descKey) }}</div>
        </div>
      </div>
      <small class="tdee-parts-note">{{ t("tdeePartsNote") }}</small>
    </div>

    <div class="table-wrap" :class="{ 'is-updating': isUpdating }">
      <table class="tdee-table" :class="{ 'is-updating': isUpdating }">
        <thead>
          <tr>
            <th>{{ t("tdeeSource") }}</th>
            <th>{{ t("tdeeCalories") }}</th>
            <th>{{ t("tdeeFrom") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>{{ t("observedTdee") }}</strong></td>
            <td class="calorie-cell">{{ tdee.observedTdee ?? "-" }}</td>
            <td>
              {{ t("observedTdeeExplain") }}
              <span v-if="tdee.observedFromDate && tdee.observedToDate">
                <br />
                {{ t("observedTdeeRange") }}:
                {{ formatEntryDate(tdee.observedFromDate, locale) }} -
                {{ formatEntryDate(tdee.observedToDate, locale) }}
              </span>
            </td>
          </tr>
          <tr>
            <td><strong>{{ t("formulasTdee") }}</strong></td>
            <td class="calorie-cell">{{ tdee.formulaTdeeAverage ?? "-" }}</td>
            <td>
              {{ t("formulasTdeeExplain") }}
              <span v-if="tdee.formulaWeight !== null">
                <br />
                {{ t("formulaWeightUsed") }}:
                {{ tdee.formulaWeight }}
                {{ t("unitKg") }}
                ({{ weightSourceText(tdee.formulaWeightSource) }})
              </span>
              <span v-if="tdee.activityMultiplier !== null">
                <br />
                {{ t("activityMultiplierLabel") }}:
                {{ tdee.activityMultiplier }}
              </span>
            </td>
          </tr>
          <tr v-for="(value, name) in tdee.formulaBreakdown" :key="name">
            <td>
              <a class="formula-link" :href="formulaHref(name)" target="_blank" rel="noreferrer">
                {{ formulaLabel(name) }}
              </a>
            </td>
            <td class="calorie-cell">{{ value }}</td>
            <td>{{ formulaExplain(name) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </BasePanel>
</template>

<style scoped>
.tdee-controls {
  display: grid;
  gap: var(--group-gap);
  margin-block-end: 10px;
}

.tdee-reference-helper {
  color: var(--text-muted);
}

.tdee-explainer {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 72%, var(--panel));
}

.tdee-parts-list {
  display: grid;
  gap: 0.55rem;
}

.tdee-part-row {
  display: grid;
  gap: 0.15rem;
  padding-inline-start: 0.2rem;
}

.tdee-part-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.8rem;
}

.tdee-part-labels {
  display: grid;
  gap: 0.05rem;
}

.tdee-part-name {
  font-weight: 600;
}

.tdee-part-term {
  color: var(--text-muted);
  font-size: 0.88rem;
}

.tdee-part-range {
  color: var(--text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.tdee-part-desc {
  color: var(--text-muted);
  line-height: 1.4;
}

.tdee-parts-note {
  color: var(--text-muted);
  margin: 0;
  line-height: 1.35;
}

.formula-link {
  justify-self: start;
}

.stat-helper {
  color: var(--text-muted);
  margin: 0;
  line-height: 1.3;
}

.table-wrap {
  margin-block-start: 10px;
}

.table-wrap.is-updating {
  position: relative;
  animation: highlight-tdee-table 1.2s ease-in-out infinite alternate;
}

.table-wrap.is-updating::after {
  content: "";
  position: absolute;
  inset: 0;
  border: 2px solid rgba(191, 162, 70, 0.9);
  pointer-events: none;
}

.tdee-table {
  inline-size: 100%;
  table-layout: fixed;
}

.tdee-table.is-updating {
  background: color-mix(in srgb, #bfa246 8%, var(--panel));
}

.tdee-table th:nth-child(1),
.tdee-table td:nth-child(1) {
  inline-size: 24%;
}

.tdee-table th:nth-child(2),
.tdee-table td:nth-child(2) {
  inline-size: 14%;
}

.tdee-table th:nth-child(3),
.tdee-table td:nth-child(3) {
  inline-size: 62%;
}

.calorie-cell {
  font-weight: 700;
  white-space: nowrap;
}

:deep(.tdee-panel--highlighted) {
  animation: highlight-tdee 2.8s ease-out;
}

@keyframes highlight-tdee {
  0% {
    box-shadow:
      var(--bevel-raised),
      0 0 0 3px rgba(191, 162, 70, 0.9);
    background: color-mix(in srgb, #bfa246 14%, var(--panel));
  }

  100% {
    box-shadow: var(--bevel-raised);
    background: var(--panel);
  }
}

@keyframes highlight-tdee-table {
  from {
    box-shadow:
      var(--bevel-raised),
      0 0 0 1px rgba(191, 162, 70, 0.55);
  }

  to {
    box-shadow:
      var(--bevel-raised),
      0 0 0 3px rgba(191, 162, 70, 0.88);
  }
}
</style>
