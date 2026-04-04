<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import FieldControl from "../base/FieldControl.vue";
import FormField from "../base/FormField.vue";
import type { AppLocale } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  selectedDate: string;
  currentWeight: string;
  foodLog: string;
  isAnalyzing: boolean;
  hasResults: boolean;
  isProfileReady: boolean;
  provider: string;
  analyzeIssue: string;
  isSavingWeight: boolean;
  isSavingFoodLog: boolean;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  "update:selectedDate": [value: string];
  "update:currentWeight": [value: string];
  "update:foodLog": [value: string];
  "save-weight": [];
  "save-draft": [];
  analyze: [];
}>();

const issueText = computed(() => {
  switch (props.analyzeIssue) {
    case "incomplete-profile":
      return t("completeProfileFirst");
    case "empty-food-log":
      return t("emptyFoodLogNotice");
    case "offline":
      return t("offlineAnalyzeIssue");
    case "missing-key":
      return missingKeyText(props.provider);
    default:
      return "";
  }
});

function missingKeyText(provider: string) {
  if (provider.startsWith("groq-")) {
    return t("missingGroqKeyNotice");
  }

  if (provider.startsWith("deepseek-")) {
    return t("missingDeepSeekKeyNotice");
  }

  if (provider.startsWith("kimi-")) {
    return t("missingKimiKeyNotice");
  }

  return t("missingGeminiKeyNotice");
}
</script>

<template>
  <BasePanel :title="t('whatIAte')" :helper="t('foodHelper')">

    <div class="log-intro">
      <p class="controls-meta">{{ t('todayLogMeta') }}</p>
      <div class="controls-grid">
        <FormField :label="t('date')">
          <input
            type="date"
            :value="selectedDate"
            @input="emit('update:selectedDate', ($event.target as HTMLInputElement).value)"
          />
        </FormField>
        <FormField :label="t('todayWeight')">
          <div class="weight-inline">
            <FieldControl :is-saving="isSavingWeight">
              <input
                class="weight-input"
                type="number"
                step="0.1"
                :value="currentWeight"
                @input="emit('update:currentWeight', ($event.target as HTMLInputElement).value)"
                @blur="emit('save-weight')"
              />
            </FieldControl>
            <span class="unit">{{ t("unitKg") }}</span>
          </div>
        </FormField>
      </div>
    </div>

    <FormField
      :label="t('whatIAte')"
      :helper="t('fieldAutosaveOnBlur')"
      stacked
    >
      <FieldControl as="textarea" :is-saving="isSavingFoodLog">
        <textarea
          :value="foodLog"
          :placeholder="t('foodPlaceholder')"
          @input="emit('update:foodLog', ($event.target as HTMLTextAreaElement).value)"
          @blur="emit('save-draft')"
        ></textarea>
      </FieldControl>
    </FormField>

    <div class="actions">
      <p class="helper-text">{{ t("analyzeHelper") }}</p>
      <div class="form-row">
        <button class="secondary-action" :disabled="isAnalyzing" @click="emit('save-draft')">
          {{ t("saveOnly") }}
        </button>
        <button class="primary-action" :disabled="isAnalyzing || !isProfileReady" @click="emit('analyze')">
          <span v-if="isAnalyzing" class="button-feedback" aria-hidden="true"></span>
          {{ isAnalyzing ? t("analyzingNow") : t("analyzeFood") }}
        </button>
        <a v-if="hasResults && !isAnalyzing" class="results-link" href="#nutritionSummaryPanel">
          {{ t("jumpToResults") }}
        </a>
      </div>
      <p v-if="analyzeIssue" class="analyze-issue">
        {{ issueText }}
      </p>
    </div>
  </BasePanel>
</template>

<style scoped>
.helper-text {
  color: var(--text-muted);
  margin: 0;
}

.controls-meta {
  color: var(--text-muted);
  margin: 0;
  font-size: 0.875rem;
}

.log-intro {
  display: grid;
  gap: var(--group-gap);
}

.controls-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--controls-min, 180px), 1fr));
  gap: var(--controls-gap, var(--group-gap));
  align-items: start;
}

.actions {
  display: grid;
  gap: var(--group-gap);
}
.weight-inline {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  inline-size: fit-content;
  max-inline-size: 100%;
}

.unit {
  padding: 0.26rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 0;
  background: var(--surface-2);
  box-shadow: var(--bevel-raised);
  color: var(--text-muted);
}

.weight-input {
  inline-size: min(100%, 8rem);
}

.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.primary-action {
  padding: 0.42rem 0.72rem;
  background: #2f6f77;
  color: #f7fbfc;
  border: 1px solid #163e44;
  box-shadow: var(--bevel-raised);
}

.primary-action:disabled {
  cursor: not-allowed;
  background: var(--surface-2);
  color: var(--text-muted);
  border-color: var(--border-strong);
}

.button-feedback {
  inline-size: 0.9rem;
  block-size: 0.9rem;
  border: 2px solid currentColor;
  border-inline-end-color: transparent;
  border-radius: 50%;
  display: inline-block;
  animation: spin 650ms linear infinite;
  margin-inline-end: 0.45rem;
  vertical-align: -0.1rem;
}

.results-link {
  white-space: nowrap;
}

.analyze-issue {
  margin: 6px 0 0;
  color: #fff1ef;
  max-inline-size: 46rem;
  display: inline-block;
  padding: 0.35rem 0.55rem;
  background: #7a3d36;
  border: 1px solid #4e221d;
  box-shadow: var(--bevel-raised);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
