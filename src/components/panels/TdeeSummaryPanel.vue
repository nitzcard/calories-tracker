<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
	import type { AppLocale, Profile, TdeeEquation, TdeeSnapshot } from "../../types";
	import { formatEntryDate } from "../../domain/entries";

	const props = defineProps<{
	  locale: AppLocale;
    profile: Profile;
	  tdee: TdeeSnapshot;
	  selectedEquation: TdeeEquation;
	  highlightToken?: number;
	  isUpdating?: boolean;
    isCalculatingCustomTdee?: boolean;
	}>();

const isHighlighted = ref(false);
let highlightTimeout: ReturnType<typeof setTimeout> | null = null;
const { t } = useI18n();
const emit = defineEmits<{
  "select-equation": [value: TdeeEquation];
  "calculate-custom-tdee": [];
  "update:profile": [profile: Profile];
  save: [profile: Profile];
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

	function onPick(value: TdeeEquation) {
	  emit("select-equation", value);
	}

  const customTdeeDraft = ref("");
  let customTdeeSaveTimeout: ReturnType<typeof setTimeout> | null = null;
  const CUSTOM_TDEE_DEBOUNCE_MS = 2000;

  function parseCustomTdeeDraft(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed);
  }

  watch(
    () => props.profile.customTdee,
    (next) => {
      customTdeeDraft.value = next != null ? String(next) : "";
    },
    { immediate: true },
  );

  function scheduleCustomTdeeSave(nextProfile: Profile) {
    if (customTdeeSaveTimeout) {
      clearTimeout(customTdeeSaveTimeout);
    }
    customTdeeSaveTimeout = setTimeout(() => {
      emit("save", nextProfile);
      customTdeeSaveTimeout = null;
    }, CUSTOM_TDEE_DEBOUNCE_MS);
  }

  function onCustomTdeeInput(event: Event) {
    const raw = (event.target as HTMLInputElement).value;
    customTdeeDraft.value = raw;
    const nextValue = parseCustomTdeeDraft(raw);
    const nextProfile = { ...props.profile, customTdee: nextValue };
    emit("update:profile", nextProfile);
    scheduleCustomTdeeSave(nextProfile);
  }

  function onCustomTdeeBlur() {
    const nextValue = parseCustomTdeeDraft(customTdeeDraft.value);
    const nextProfile = { ...props.profile, customTdee: nextValue };
    emit("update:profile", nextProfile);
    if (customTdeeSaveTimeout) {
      clearTimeout(customTdeeSaveTimeout);
      customTdeeSaveTimeout = null;
    }
    emit("save", nextProfile);
  }

  function calculateCustomTdee() {
    if (props.isCalculatingCustomTdee) return;
    if (customTdeeSaveTimeout) {
      clearTimeout(customTdeeSaveTimeout);
      customTdeeSaveTimeout = null;
    }
    emit("calculate-custom-tdee");
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
</script>

	<template>
	  <BasePanel
	    :class="isHighlighted ? 'tdee-panel--highlighted' : ''"
	    :title="t('tdeeSummary')"
	    :helper="t('tdeeHelper')"
	  >
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
                <input
                  type="radio"
                  name="tdeeEquation"
                  :checked="selectedEquation === 'custom'"
                  @change="onPick('custom')"
                />
              </td>
              <td><strong>{{ t("customTdee") }}</strong></td>
              <td class="calorie-cell calorie-cell--custom">
                <div class="tdee-custom-cell">
                  <input
                    class="tdee-custom-input"
                    type="number"
                    step="1"
                    min="0"
                    :value="customTdeeDraft"
                    placeholder="-"
                    @input="onCustomTdeeInput"
                    @blur="onCustomTdeeBlur"
                    @keydown.enter.prevent="onCustomTdeeBlur"
                  />
                  <button
                    class="tdee-custom-calc"
                    :class="{ 'is-busy': Boolean(isCalculatingCustomTdee) }"
                    :disabled="Boolean(isCalculatingCustomTdee)"
                    type="button"
                    :title="isCalculatingCustomTdee ? t('tdeePromptCalculating') : t('tdeePromptCalculate')"
                    :aria-label="isCalculatingCustomTdee ? t('tdeePromptCalculating') : t('tdeePromptCalculate')"
                    @click="calculateCustomTdee"
                  >
                    {{ isCalculatingCustomTdee ? t("tdeeCalcShortBusy") : t("tdeeCalcShort") }}
                  </button>
                </div>
              </td>
              <td>
                {{ t("customTdeeRowHelper") }}
              </td>
            </tr>
		          <tr>
	            <td class="pick-col">
	              <input
	                type="radio"
                name="tdeeEquation"
                :checked="selectedEquation === 'observedTdee'"
                @change="onPick('observedTdee')"
              />
            </td>
	            <td><strong>{{ t("observedTdee") }}</strong></td>
	            <td class="calorie-cell">{{ tdee.observedTdee ?? "-" }}</td>
	            <td>
	              {{ t("observedTdeeExplain") }}
	              <span v-if="tdee.observedTdee == null">
	                <br />
	                <em class="muted">{{ observedEmptyText() }}</em>
	              </span>
	              <span v-if="tdee.observedFromDate && tdee.observedToDate">
	                <br />
	                {{ t("observedTdeeRange") }}:
	                {{ formatEntryDate(tdee.observedFromDate, locale) }} -
                {{ formatEntryDate(tdee.observedToDate, locale) }}
              </span>
            </td>
          </tr>
          <tr v-for="(value, name) in tdee.formulaBreakdown" :key="name">
            <td class="pick-col">
              <input
                type="radio"
                name="tdeeEquation"
                :checked="selectedEquation === (name as TdeeEquation)"
                @change="onPick(name as TdeeEquation)"
              />
            </td>
            <td>
              <a class="formula-link" :href="formulaHref(name)" target="_blank" rel="noreferrer">
                {{ formulaLabel(name) }}
              </a>
            </td>
            <td class="calorie-cell">{{ value }}</td>
            <td>
              {{ formulaExplain(name) }}
              <span v-if="selectedEquation === (name as TdeeEquation) && tdee.formulaWeight !== null">
                <br />
                {{ t("formulaWeightUsed") }}:
                {{ tdee.formulaWeight }} {{ t("unitKg") }}
                ({{ weightSourceText(tdee.formulaWeightSource) }})
              </span>
              <span v-if="selectedEquation === (name as TdeeEquation) && tdee.activityMultiplier !== null">
                <br />
                {{ t("activityMultiplierLabel") }}: {{ tdee.activityMultiplier }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
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
  table-layout: fixed;
  min-inline-size: 600px;
}

.tdee-table.is-updating {
  background: color-mix(in srgb, #bfa246 8%, var(--panel));
}

.pick-col {
  inline-size: 3.25rem;
  text-align: center;
}

.tdee-table th:nth-child(2),
.tdee-table td:nth-child(2) {
  inline-size: 24%;
}

.tdee-table th:nth-child(3),
.tdee-table td:nth-child(3) {
  inline-size: 26%;
}

.tdee-table th:nth-child(4),
.tdee-table td:nth-child(4) {
  inline-size: 47%;
}

.calorie-cell {
  font-weight: 700;
  white-space: nowrap;
}

.calorie-cell--custom {
  white-space: normal;
}

.tdee-custom-input {
  flex: 1 1 auto;
  inline-size: 100%;
  min-inline-size: 5.25rem;
  max-inline-size: 100%;
  box-sizing: border-box;
  padding: 0.18rem 0.3rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  box-shadow: var(--bevel-sunken);
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
  animation: status-toast-spin 0.85s linear infinite;
}

.tdee-custom-calc:disabled {
  opacity: 0.65;
}

.tdee-table td {
  overflow-wrap: anywhere;
  word-break: normal;
}

.tdee-table td:nth-child(4) {
  line-height: 1.35;
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

@media (max-width: 640px) {
  .tdee-table {
    min-inline-size: 550px;
  }

  .tdee-custom-calc {
    min-inline-size: 2.8rem;
    font-size: 0.85rem;
    padding: 0 0.3rem;
  }

  .tdee-custom-input {
    min-inline-size: 4.5rem;
  }
}
</style>
