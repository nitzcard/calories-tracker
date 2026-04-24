<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import type { AppLocale, TdeeEquation, TdeeSnapshot } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  tdee: TdeeSnapshot;
  selectedEquation: TdeeEquation;
  highlightToken?: number;
  isUpdating?: boolean;
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
  const notes: Record<string, string> = {
    mifflinStJeor: t("mifflinStJeorExplain"),
    harrisBenedict: t("harrisBenedictExplain"),
    cunningham: t("cunninghamExplain"),
  };

  return notes[name] ?? "";
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

function onPick(value: TdeeEquation) {
  emit("select-equation", value);
}

function observedEmptyText() {
  if (props.tdee.observedReason === "insufficient_span") {
    return t("observedTdeeEmptyInsufficientSpan", {
      minDays: props.tdee.observedMinDays,
      spanDays: props.tdee.observedDaySpanDays ?? 0,
    });
  }
  if (props.tdee.observedReason === "out_of_range") {
    return t("observedTdeeEmptyOutOfRange");
  }
  // Default: not enough valid days (or missing info).
  return t("observedTdeeEmptyInsufficientEntries", {
    minEntries: props.tdee.observedMinEntries,
    count: props.tdee.observedValidEntryCount,
  });
}

function formatObservedRangeDate(date: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
  }).format(new Date(`${date}T00:00:00`));
}

function observedTdeeExplainHref() {
  return "https://www.google.com/search?q=observed+tdee+equation+reddit&rlz=1C5GCEM_en&oq=observed+tdee+equation+reddit&gs_lcrp=EgZjaHJvbWUyCQgAEEUYORigATIHCAEQIRigATIHCAIQIRigATIGCAMQIRgV0gEINTU3MWowajSoAgOwAgHxBZ2TZ5I-sSdr&sourceid=chrome&ie=UTF-8";
}
</script>

<template>
  <BasePanel :class="isHighlighted ? 'tdee-panel--highlighted' : ''" :title="t('tdeeSummary')"
    :helper="t('tdeeHelper')">
    <details class="tdee-explainer">
      <summary class="tdee-explainer__summary">
        <strong>{{ t("tdeePartsTitle") }}</strong>
      </summary>
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
    </details>

    <div class="table-container">
      <div class="table-wrap" :class="{ 'is-updating': isUpdating }">
        <table class="tdee-table" :class="{ 'is-updating': isUpdating }">
          <thead>
            <tr>
              <th class="pick-col"></th>
              <th>{{ t("tdeeSource") }}</th>
              <th>{{ t("tdeeCalories") }}</th>
              <th>{{ t("tdeeFrom") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="pick-col">
                <input type="radio" name="tdeeEquation" :checked="selectedEquation === 'observedTdee'"
                  @change="onPick('observedTdee')" />
              </td>
              <td>
                <a class="formula-link observed-tdee-source-link" :href="observedTdeeExplainHref()" target="_blank"
                  rel="noreferrer">
                  {{ t("observedTdee") }}
                </a>
                <div v-if="tdee.observedFromDate && tdee.observedToDate" class="helper-text observed-tdee-range"
                  dir="ltr">
                  {{ formatObservedRangeDate(tdee.observedFromDate, locale) }} -
                  {{ formatObservedRangeDate(tdee.observedToDate, locale) }}
                </div>
              </td>
              <td class="calorie-cell">{{ tdee.observedTdee ?? "-" }}</td>
              <td>
                <div class="tdee-source-helper" dir="ltr">
                  <math class="math-equation" xmlns="http://www.w3.org/1998/Math/MathML"
                    :aria-label="`${t('observedTdeeFormulaLabel')} equals ${t('observedTdeeFormulaAverage')} minus ((${t('observedTdeeFormulaLastWeight')} minus ${t('observedTdeeFormulaFirstWeight')}) times 7700) divided by ${t('observedTdeeFormulaDays')}`">
                    <mrow>
                      <mtext>{{ t("observedTdeeFormulaLabel") }}</mtext>
                      <mo>=</mo>
                      <mtext>{{ t("observedTdeeFormulaAverage") }}</mtext>
                      <mo>−</mo>
                      <mfrac>
                        <mrow>
                          <mo>(</mo>
                          <mtext>{{ t("observedTdeeFormulaLastWeight") }}</mtext>
                          <mo>−</mo>
                          <mtext>{{ t("observedTdeeFormulaFirstWeight") }}</mtext>
                          <mo>)</mo>
                          <mo>×</mo>
                          <mn>7700</mn>
                        </mrow>
                        <mtext>{{ t("observedTdeeFormulaDays") }}</mtext>
                      </mfrac>
                    </mrow>
                  </math>
                </div>
                <span v-if="tdee.observedTdee == null">
                  <br />
                  <em class="muted">{{ observedEmptyText() }}</em>
                </span>
              </td>
            </tr>
            <tr v-for="(value, name) in tdee.formulaBreakdown" :key="name">
              <td class="pick-col">
                <input type="radio" name="tdeeEquation" :checked="selectedEquation === (name as TdeeEquation)"
                  @change="onPick(name as TdeeEquation)" />
              </td>
              <td>
                <a class="formula-link" :href="formulaHref(name)" target="_blank" rel="noreferrer">
                  {{ formulaLabel(name) }}
                </a>
              </td>
              <td class="calorie-cell">{{ value ?? "-" }}</td>
              <td>
                {{ formulaExplain(name) }}
                <span v-if="selectedEquation === (name as TdeeEquation) && tdee.formulaWeight !== null"
                  class="tdee-formula-meta" dir="ltr">
                  <br />
                  {{ t("formulaWeightUsed") }}:
                  {{ tdee.formulaWeight }} {{ t("unitKg") }}
                  ({{ weightSourceText(tdee.formulaWeightSource) }})
                </span>
                <span v-if="selectedEquation === (name as TdeeEquation) && tdee.activityMultiplier !== null"
                  class="tdee-formula-meta" dir="ltr">
                  <br />
                  {{ t("activityMultiplierLabel") }}: {{ tdee.activityMultiplier }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="tdee-cards">
      <div class="tdee-card">
        <div class="tdee-card__header">
          <input type="radio" name="tdeeEquationMobile" :checked="selectedEquation === 'observedTdee'"
            @change="onPick('observedTdee')" class="tdee-card__radio" />
          <a class="formula-link tdee-card__title" :href="observedTdeeExplainHref()" target="_blank" rel="noreferrer">
            {{ t("observedTdee") }}
          </a>
        </div>
        <div class="tdee-card__content">
          <div class="tdee-card__row">
            <div class="tdee-card__label">{{ t("tdeeCalories") }}</div>
            <div class="tdee-card__value">{{ tdee.observedTdee ?? "-" }}</div>
          </div>
          <div class="tdee-card__helper">
            <div class="tdee-source-helper" dir="ltr">
              <math class="math-equation" xmlns="http://www.w3.org/1998/Math/MathML"
                :aria-label="`${t('observedTdeeFormulaLabel')} equals ${t('observedTdeeFormulaAverage')} minus ((${t('observedTdeeFormulaLastWeight')} minus ${t('observedTdeeFormulaFirstWeight')}) times 7700) divided by ${t('observedTdeeFormulaDays')}`">
                <mrow>
                  <mtext>{{ t("observedTdeeFormulaLabel") }}</mtext>
                  <mo>=</mo>
                  <mtext>{{ t("observedTdeeFormulaAverage") }}</mtext>
                  <mo>−</mo>
                  <mfrac>
                    <mrow>
                      <mo>(</mo>
                      <mtext>{{ t("observedTdeeFormulaLastWeight") }}</mtext>
                      <mo>−</mo>
                      <mtext>{{ t("observedTdeeFormulaFirstWeight") }}</mtext>
                      <mo>)</mo>
                      <mo>×</mo>
                      <mn>7700</mn>
                    </mrow>
                    <mtext>{{ t("observedTdeeFormulaDays") }}</mtext>
                  </mfrac>
                </mrow>
              </math>
            </div>
            <span v-if="tdee.observedTdee == null">
              <br />
              <em class="muted">{{ observedEmptyText() }}</em>
            </span>
            <div v-if="tdee.observedFromDate && tdee.observedToDate" class="helper-text observed-tdee-range" dir="ltr">
              {{ formatObservedRangeDate(tdee.observedFromDate, locale) }} -
              {{ formatObservedRangeDate(tdee.observedToDate, locale) }}
            </div>
          </div>
        </div>
      </div>

      <div v-for="(value, name) in tdee.formulaBreakdown" :key="`card-${name}`" class="tdee-card">
        <div class="tdee-card__header">
          <input type="radio" name="tdeeEquationMobile" :checked="selectedEquation === (name as TdeeEquation)"
            @change="onPick(name as TdeeEquation)" class="tdee-card__radio" />
          <a class="formula-link tdee-card__title" :href="formulaHref(name)" target="_blank" rel="noreferrer">
            {{ formulaLabel(name) }}
          </a>
        </div>
        <div class="tdee-card__content">
          <div class="tdee-card__row">
            <div class="tdee-card__label">{{ t("tdeeCalories") }}</div>
            <div class="tdee-card__value">{{ value ?? "-" }}</div>
          </div>
          <div class="tdee-card__helper">
            {{ formulaExplain(name) }}
            <span v-if="selectedEquation === (name as TdeeEquation) && tdee.formulaWeight !== null"
              class="tdee-formula-meta" dir="ltr">
              <br />
              {{ t("formulaWeightUsed") }}:
              {{ tdee.formulaWeight }} {{ t("unitKg") }}
              ({{ weightSourceText(tdee.formulaWeightSource) }})
            </span>
            <span v-if="selectedEquation === (name as TdeeEquation) && tdee.activityMultiplier !== null"
              class="tdee-formula-meta" dir="ltr">
              <br />
              {{ t("activityMultiplierLabel") }}: {{ tdee.activityMultiplier }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </BasePanel>
</template>

<style scoped>
.tdee-explainer {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 72%, var(--panel));
}

.tdee-explainer__summary {
  cursor: pointer;
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

.tdee-actions {
  margin-block-start: 8px;
  display: flex;
  justify-content: flex-start;
}

.math-equation {
  display: inline-block;
  padding: 10px;
  font-family: "Times New Roman", Georgia, serif;
  font-size: 1.12em;
  font-weight: 400;
  color: var(--text-primary);
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

.table-container {
  margin-block-start: 10px;
}

.tdee-cards {
  display: none;
}

.table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
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
  table-layout: auto;
}

.tdee-table.is-updating {
  background: color-mix(in srgb, #bfa246 8%, var(--panel));
}

.pick-col {
  text-align: center;
}

.tdee-custom-input {
  flex: 1 1 auto;
  inline-size: 100%;
  min-inline-size: 5.25rem;
  max-inline-size: 100%;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tdee-custom-cell {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-inline-size: 0;
  max-inline-size: 100%;
}

.tdee-custom-calc {
  flex: 0 0 auto;
  min-inline-size: 3.1rem;
  block-size: 2.05rem;
  padding: 0 0.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.12rem;
  font-size: 0.92rem;
  line-height: 1;
  background: var(--surface-1);
  color: var(--text-primary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--bevel-raised);
}

.tdee-custom-calc.is-busy {
  opacity: 0.85;
}

.tdee-custom-calc:disabled {
  opacity: 0.65;
}

.tdee-loading-dots {
  display: inline-flex;
  align-items: center;
  min-inline-size: 1.05rem;
}

.tdee-loading-dots>span {
  display: inline-block;
  opacity: 0.28;
  animation: tdee-loading-dot 1.1s steps(1, end) infinite;
}

.tdee-loading-dots>span:nth-child(2) {
  animation-delay: 0.18s;
}

.tdee-loading-dots>span:nth-child(3) {
  animation-delay: 0.36s;
}

.tdee-formula-meta {
  display: inline-flex;
  align-items: baseline;
  gap: 0.2rem;
  white-space: nowrap;
}

.helper-text {
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.4;
}

.observed-tdee-range {
  font-size: 0.8rem;
  margin-block-start: 0.2rem;
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

@keyframes tdee-loading-dot {

  0%,
  100% {
    opacity: 0.28;
  }

  50% {
    opacity: 1;
  }
}

@media (max-width: 640px) {
  .table-container {
    display: none;
  }

  .tdee-cards {
    display: grid;
    gap: 10px;
    margin-block-start: 10px;
  }

  .tdee-card {
    border: 1px solid var(--border);
    background: var(--surface-2);
    box-shadow: var(--bevel-raised);
    padding: 10px;
    display: grid;
    gap: 8px;
  }

  .tdee-card__header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tdee-card__radio {
    flex: 0 0 auto;
  }

  .tdee-card__title {
    flex: 1 1 auto;
    font-size: 1rem;
  }

  .tdee-card__content {
    display: grid;
    gap: 6px;
    padding-inline-start: 30px;
  }

  .tdee-card__row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .tdee-card__label {
    color: var(--text-muted);
    font-size: 0.85rem;
    flex: 0 0 auto;
  }

  .tdee-card__value {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    flex: 1 1 auto;
    text-align: end;
  }

  .tdee-card__helper {
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .helper-text {
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .tdee-source-helper {
    color: var(--text-muted);
    font-size: inherit;
    line-height: 1.4;
    display: grid;
    gap: 0.2rem;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .observed-tdee-source-link {
    display: inline-block;
    color: var(--text-primary);
    font-weight: 700;
    font-size: 1em;
    text-decoration: none;
    width: fit-content;
  }

  .observed-tdee-source-link:hover {
    color: var(--text-primary);
    text-decoration: underline;
    text-underline-offset: 0.12em;
  }

  .observed-tdee-range {
    font-size: 0.8rem;
    margin-block-start: 0.2rem;
  }

  .math-equation {
    display: block;
    font-size: 0.76em;
    max-inline-size: 100%;
    overflow-x: auto;
  }

  .tdee-custom-cell-mobile {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    justify-content: flex-end;
  }

  .tdee-custom-cell-mobile .tdee-custom-input {
    flex: 1 1 auto;
    min-inline-size: 5rem;
    max-inline-size: 8rem;
  }

  .tdee-custom-cell-mobile .tdee-custom-calc {
    flex: 0 0 auto;
  }
}
</style>
