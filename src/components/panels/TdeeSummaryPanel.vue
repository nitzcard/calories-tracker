<script setup lang="ts">
import { computed, ref, watch } from "vue";
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

const { t } = useI18n();
const emit = defineEmits<{
  "select-equation": [value: TdeeEquation];
}>();

const isHighlighted = ref(false);
let highlightTimeout: ReturnType<typeof setTimeout> | null = null;

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

function formulaMathLabel(name: string) {
  const labels: Record<string, string> = {
    mifflinStJeor: "TDEE equals (10 times weight plus 6.25 times height minus 5 times age plus sex offset) times activity factor",
    harrisBenedict: "TDEE equals resting energy estimate times activity factor",
    cunningham: "TDEE equals (500 plus 22 times lean body mass) times activity factor",
  };

  return labels[name] ?? "TDEE equation";
}

function formulaHref(name: string) {
  const urls: Record<string, string> = {
    mifflinStJeor: "https://pubmed.ncbi.nlm.nih.gov/2305711/",
    harrisBenedict: "https://en.wikipedia.org/wiki/Harris%E2%80%93Benedict_equation",
    cunningham: "https://pubmed.ncbi.nlm.nih.gov/25275434/",
  };

  return urls[name] ?? "#";
}

function observedTdeeExplainHref() {
  return "https://www.google.com/search?q=observed+tdee+equation";
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

const formulaCards = computed(() =>
  Object.entries(props.tdee.formulaBreakdown).map(([name, value]) => ({
    id: name as TdeeEquation,
    value,
    label: formulaLabel(name),
    explain: formulaExplain(name),
    href: formulaHref(name),
    isSelected: props.selectedEquation === name,
  })),
);
</script>

<template>
  <BasePanel :class="['tdee-panel', { 'tdee-panel--highlighted': isHighlighted }]" :title="t('tdeeSummary')"
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

    <section class="tdee-card-grid" :class="{ 'is-updating': isUpdating }">
      <article
        class="tdee-card tdee-card--observed"
        :data-selected="selectedEquation === 'observedTdee' ? 'true' : 'false'"
      >
        <label class="tdee-card__radio-row">
          <input
            type="radio"
            name="tdeeEquation"
            :checked="selectedEquation === 'observedTdee'"
            @change="emit('select-equation', 'observedTdee')"
          />
          <span class="tdee-card__eyebrow">{{ t("observedTdee") }}</span>
        </label>

        <div class="tdee-card__main">
          <a class="tdee-card__title" :href="observedTdeeExplainHref()" target="_blank" rel="noreferrer">
            {{ t("observedTdee") }}
          </a>
          <strong class="tdee-card__value" dir="ltr">{{ tdee.observedTdee ?? "-" }}</strong>
        </div>

        <div v-if="tdee.observedFromDate && tdee.observedToDate" class="tdee-card__meta" dir="ltr">
          {{ formatObservedRangeDate(tdee.observedFromDate, locale) }} -
          {{ formatObservedRangeDate(tdee.observedToDate, locale) }}
        </div>

        <div class="tdee-card__body">
          <div class="tdee-card__equation" dir="ltr">
            <math
              class="math-equation"
              xmlns="http://www.w3.org/1998/Math/MathML"
              :aria-label="`${t('observedTdeeFormulaLabel')} equals ${t('observedTdeeFormulaAverage')} minus ((${t('observedTdeeFormulaLastWeight')} minus ${t('observedTdeeFormulaFirstWeight')}) times 7700) divided by ${t('observedTdeeFormulaDays')}`"
            >
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
          <p v-if="tdee.observedTdee == null" class="tdee-card__muted">{{ observedEmptyText() }}</p>
          <p v-else class="tdee-card__muted">{{ t("formulaReferenceExplain") }}</p>
        </div>
      </article>

      <article
        v-for="card in formulaCards"
        :key="card.id"
        class="tdee-card"
        :data-selected="card.isSelected ? 'true' : 'false'"
      >
        <label class="tdee-card__radio-row">
          <input
            type="radio"
            name="tdeeEquation"
            :checked="card.isSelected"
            @change="emit('select-equation', card.id)"
          />
          <span class="tdee-card__eyebrow">{{ t("formulaAverage") }}</span>
        </label>

        <div class="tdee-card__main">
          <a class="tdee-card__title" :href="card.href" target="_blank" rel="noreferrer">
            {{ card.label }}
          </a>
          <strong class="tdee-card__value" dir="ltr">{{ card.value ?? "-" }}</strong>
        </div>

        <div class="tdee-card__body">
          <div class="tdee-card__equation" dir="ltr">
            <math
              v-if="card.id === 'mifflinStJeor'"
              class="math-equation math-equation--compact"
              xmlns="http://www.w3.org/1998/Math/MathML"
              :aria-label="formulaMathLabel(card.id)"
            >
              <mrow>
                <mtext>TDEE</mtext>
                <mo>=</mo>
                <mo>(</mo>
                <mn>10</mn>
                <mi>W</mi>
                <mo>+</mo>
                <mn>6.25</mn>
                <mi>H</mi>
                <mo>−</mo>
                <mn>5</mn>
                <mi>A</mi>
                <mo>+</mo>
                <mi>S</mi>
                <mo>)</mo>
                <mo>×</mo>
                <mi>AF</mi>
              </mrow>
            </math>
            <math
              v-else-if="card.id === 'harrisBenedict'"
              class="math-equation math-equation--compact"
              xmlns="http://www.w3.org/1998/Math/MathML"
              :aria-label="formulaMathLabel(card.id)"
            >
              <mrow>
                <mtext>TDEE</mtext>
                <mo>=</mo>
                <mtext>BMR</mtext>
                <mo>×</mo>
                <mi>AF</mi>
              </mrow>
            </math>
            <math
              v-else
              class="math-equation math-equation--compact"
              xmlns="http://www.w3.org/1998/Math/MathML"
              :aria-label="formulaMathLabel(card.id)"
            >
              <mrow>
                <mtext>TDEE</mtext>
                <mo>=</mo>
                <mo>(</mo>
                <mn>500</mn>
                <mo>+</mo>
                <mn>22</mn>
                <mi>LBM</mi>
                <mo>)</mo>
                <mo>×</mo>
                <mi>AF</mi>
              </mrow>
            </math>
          </div>
          <p class="tdee-card__muted">{{ card.explain }}</p>
          <p v-if="card.isSelected && tdee.formulaWeight !== null" class="tdee-card__meta" dir="ltr">
            {{ t("formulaWeightUsed") }}: {{ tdee.formulaWeight }} {{ t("unitKg") }}
            ({{ weightSourceText(tdee.formulaWeightSource) }})
          </p>
          <p v-if="card.isSelected && tdee.activityMultiplier !== null" class="tdee-card__meta" dir="ltr">
            {{ t("activityMultiplierLabel") }}: {{ tdee.activityMultiplier }}
          </p>
        </div>
      </article>
    </section>
  </BasePanel>
</template>

<style scoped>
.tdee-panel {
  align-self: start;
}

.tdee-panel--highlighted :deep(.panel__body),
.tdee-panel--highlighted :deep(.panel) {
  animation: tdeeHighlight 2.4s ease-out 1;
}

@keyframes tdeeHighlight {
  0% {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent);
  }
  100% {
    box-shadow: none;
  }
}

.tdee-explainer {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface-2) 88%, transparent);
  padding: 0.85rem 1rem;
}

.tdee-explainer__summary {
  cursor: pointer;
}

.tdee-parts-list {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.9rem;
}

.tdee-part-row {
  display: grid;
  gap: 0.3rem;
}

.tdee-part-heading {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.tdee-part-labels {
  display: flex;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.tdee-part-name {
  font-weight: 700;
}

.tdee-part-term,
.tdee-part-range,
.tdee-parts-note,
.tdee-part-desc,
.tdee-card__muted,
.tdee-card__meta {
  color: var(--text-muted);
}

.tdee-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.tdee-card {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface-1) 92%, transparent);
  box-shadow: var(--bevel-raised);
}

.tdee-card[data-selected="true"] {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  background: color-mix(in srgb, var(--accent) 5%, var(--surface-1));
}

.tdee-card--observed {
  grid-column: 1 / -1;
}

.tdee-card__radio-row {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-weight: 700;
}

.tdee-card__eyebrow {
  font-size: 0.82rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.tdee-card__main {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: start;
}

.tdee-card__title {
  color: inherit;
  font-size: 1.05rem;
  font-weight: 700;
  text-decoration: none;
}

.tdee-card__title:hover {
  text-decoration: underline;
}

.tdee-card__value {
  font-size: clamp(1.45rem, 3vw, 2.1rem);
  line-height: 1;
}

.tdee-card__body {
  display: grid;
  gap: 0.45rem;
}

.tdee-card__equation {
  display: flex;
  justify-content: flex-start;
}

.math-equation {
  display: inline-block;
  max-inline-size: 100%;
  overflow-x: auto;
  padding: 0.55rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface-2) 84%, transparent);
  color: var(--text-primary);
  font-family: "STIX Two Text", "Times New Roman", Georgia, serif;
  font-size: 1rem;
  line-height: 1.15;
}

.math-equation--compact {
  font-size: 0.94rem;
}

@media (max-width: 900px) {
  .tdee-card-grid {
    grid-template-columns: 1fr;
  }

  .tdee-card--observed {
    grid-column: auto;
  }
}
</style>
