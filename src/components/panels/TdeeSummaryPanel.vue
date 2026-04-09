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

	function onPick(value: TdeeEquation) {
	  emit("select-equation", value);
	}

  const promptCopied = ref(false);

  function buildTdeeAgentPrompt() {
    const p = props.profile;
    const currentWeight = p.estimatedWeight ?? props.tdee.formulaWeight ?? null;
    const targetWeight = p.targetWeight ?? null;
    const activity = (p.activityPrompt ?? "").trim();
    const sex = p.sex;
    const age = p.age ?? null;
    const heightCm = p.height ?? null;

    return [
      "You are a coach/nutrition assistant. Use up-to-date research and best practices (browse the web if you can) to estimate TDEE and set a calorie target for my goal.",
      "",
      "Inputs (metric):",
      `- Sex: ${sex}`,
      `- Age: ${age ?? "unknown"}`,
      `- Height: ${heightCm ?? "unknown"} cm`,
      `- Current weight: ${currentWeight ?? "unknown"} kg`,
      `- Target weight: ${targetWeight ?? "none"} kg`,
      "",
      "Activity / lifestyle:",
      activity ? `- ${activity}` : "- (not provided)",
      "",
      "What I want from you:",
      "1) Estimate my TDEE using at least Mifflin-St Jeor and (if possible) one alternative method; state assumptions (activity multiplier).",
      "2) If I gave a target weight, recommend a safe weekly loss/gain rate and a daily calorie target to reach it.",
      "3) Output one final number for: recommended daily calories (kcal/day), and show the calculation.",
      "4) Ask any critical clarifying questions only if needed; otherwise make conservative assumptions.",
    ].join("\n");
  }

  async function copyTdeePrompt() {
    const text = buildTdeeAgentPrompt();
    promptCopied.value = false;
    try {
      await navigator.clipboard.writeText(text);
      promptCopied.value = true;
      setTimeout(() => (promptCopied.value = false), 2000);
      return;
    } catch {
      // Fallback for older browsers / non-secure contexts.
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
        promptCopied.value = true;
        setTimeout(() => (promptCopied.value = false), 2000);
      } finally {
        document.body.removeChild(textarea);
      }
    }
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

      <div class="tdee-actions">
        <button class="secondary-action" @click="copyTdeePrompt">
          {{ promptCopied ? t("tdeePromptCopied") : t("tdeePromptCopy") }}
        </button>
      </div>

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
              <td class="calorie-cell">{{ profile.customTdee ?? "-" }}</td>
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
  inline-size: 14%;
}

.tdee-table th:nth-child(4),
.tdee-table td:nth-child(4) {
  inline-size: 59%;
}

.calorie-cell {
  font-weight: 700;
  white-space: nowrap;
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
</style>
