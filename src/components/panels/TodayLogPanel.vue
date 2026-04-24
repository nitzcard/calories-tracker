<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import FieldControl from "../base/FieldControl.vue";
import FormField from "../base/FormField.vue";
import AnalysisSwitchSuggestion from "../shared/AnalysisSwitchSuggestion.vue";
import { formatEntryDate } from "../../domain/entries";
import type { AiProviderOption, AppLocale } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  selectedDate: string;
  currentWeight: string;
  foodLog: string;
  isAnalyzing: boolean;
  showModelSwitchPrompt?: boolean;
  suggestedModelLabel?: string | null;
  hasResults: boolean;
  isProfileReady: boolean;
  provider: string;
  providerOptions: AiProviderOption[];
  isSavingProvider: boolean;
  canSelectProvider: boolean;
  analyzeIssue: string;
  analysisError?: string | null;
  analysisRetryModelLabel?: string | null;
  analysisRetryModelId?: string | null;
  isSavingWeight: boolean;
  isSavingFoodLog: boolean;
  embedded?: boolean;
}>();

const { t } = useI18n();

const emit = defineEmits<{
  "update:selected-date": [value: string];
  "update:current-weight": [value: string];
  "update:food-log": [value: string];
  "save-weight": [value?: string];
  "save-draft": [value?: string];
  analyze: [];
  "provider-change": [provider: string];
  "accept-model-switch": [];
  "dismiss-model-switch": [];
  "retry-analysis-with-model": [provider: string];
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
      return t("missingGeminiKeyNotice");
    default:
      return "";
  }
});

const activeProvider = computed(() =>
  props.providerOptions.find((option) => option.id === props.provider),
);

const selectValue = computed(() => (props.canSelectProvider ? props.provider : ""));

const showAnalyzingNotice = computed(() => props.isAnalyzing);
const showModelSwitchAction = computed(
  () => Boolean(props.showModelSwitchPrompt && props.suggestedModelLabel),
);
const showAnalysisRetryAction = computed(
  () => Boolean(props.analysisError && props.analysisRetryModelLabel && props.analysisRetryModelId),
);
const localizedSelectedDate = computed(() =>
  formatEntryDate(props.selectedDate, props.locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
);
</script>

<template>
  <BasePanel
    v-if="!embedded"
    id="todayLogPanel"
    :title="t('whatIAte')"
    :helper="t('foodHelper')"
    collapsible
  >
    <div class="today-log-content">
      <div class="log-intro">
        <p class="controls-meta">{{ t('todayLogMeta') }}</p>
        <div class="controls-grid">
          <FormField :label="t('date')">
            <input
              type="date"
              :value="selectedDate"
              @input="emit('update:selected-date', ($event.target as HTMLInputElement).value)"
            />
            <p class="localized-date">{{ localizedSelectedDate }}</p>
	          </FormField>
          <FormField :label="t('todayWeight')" :helper="t('weightHelper')">
	            <div class="unit-field">
		              <FieldControl class="weight-control" :is-saving="isSavingWeight">
		                <input
		                  class="weight-input"
		                  type="number"
		                  step="0.1"
		                  min="0"
		                  dir="ltr"
		                  :value="currentWeight"
		                  @input="emit('update:current-weight', ($event.target as HTMLInputElement).value)"
		                  @blur="emit('save-weight', ($event.target as HTMLInputElement).value)"
		                />
	              </FieldControl>
	              <span class="field-unit">{{ t("unitKg") }}</span>
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
            @input="emit('update:food-log', ($event.target as HTMLTextAreaElement).value)"
            @blur="emit('save-draft', ($event.target as HTMLTextAreaElement).value)"
          ></textarea>
        </FieldControl>
      </FormField>

      <div class="actions">
        <div class="provider-field">
          <FormField
            :label="t('analysisModelLabel')"
            :helper="canSelectProvider ? activeProvider?.helper : t('analysisModelNeedsGeminiKey')"
          >
            <FieldControl as="select" :is-saving="isSavingProvider">
              <select
                class="provider-select"
                :value="selectValue"
                :disabled="!canSelectProvider"
                @change="emit('provider-change', ($event.target as HTMLSelectElement).value)"
              >
                <option v-if="!canSelectProvider" value=""></option>
                <option v-for="option in providerOptions" :key="option.id" :value="option.id">
                  {{ option.label }}
                </option>
              </select>
            </FieldControl>
          </FormField>
        </div>

        <p class="helper-text">{{ t("analyzeHelper") }}</p>
        <div class="form-row">
          <button class="secondary-action" :disabled="isAnalyzing" @click="emit('save-draft', foodLog)">
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
        <div v-else-if="analysisError" class="analyze-error" dir="ltr">
          <p>{{ analysisError }}</p>
          <p v-if="showAnalysisRetryAction" class="analyze-error__retry">
            <span>{{ t("analysisRetrySuggestionPrefix") }}</span>
            <a
              class="inline-action-link"
              href="#"
              @click.prevent="emit('retry-analysis-with-model', analysisRetryModelId ?? '')"
            >
              {{ analysisRetryModelLabel }}
            </a>
            <span>{{ t("analysisRetrySuggestionInstead") }}</span>
          </p>
        </div>
        <div v-if="showAnalyzingNotice" class="analysis-notice" role="status" aria-live="polite">
          <span class="analysis-notice__spinner" aria-hidden="true"></span>
          <div class="analysis-notice__copy">
            <strong>{{ t("analysisInProgressTitle") }}</strong>
            <AnalysisSwitchSuggestion
              v-if="(showModelSwitchAction && suggestedModelLabel)"
              :model-label="suggestedModelLabel"
              @accept="emit('accept-model-switch')"
            />
            <p v-else>{{ t("analyzeSlowNotice") }}</p>
          </div>
        </div>
      </div>
    </div>
  </BasePanel>

  <div v-else class="today-log-content">

    <div class="log-intro">
      <p class="controls-meta">{{ t('todayLogMeta') }}</p>
      <div class="controls-grid">
        <FormField :label="t('date')">
          <input
            type="date"
            :value="selectedDate"
            @input="emit('update:selected-date', ($event.target as HTMLInputElement).value)"
          />
          <p class="localized-date">{{ localizedSelectedDate }}</p>
	        </FormField>
	        <FormField :label="t('todayWeight')" :helper="t('weightHelper')">
	          <div class="unit-field">
	            <FieldControl class="weight-control" :is-saving="isSavingWeight">
	                <input
	                  class="weight-input"
	                  type="number"
	                  step="0.1"
	                  min="0"
	                  dir="ltr"
	                  :value="currentWeight"
	                  @input="emit('update:current-weight', ($event.target as HTMLInputElement).value)"
	                  @blur="emit('save-weight', ($event.target as HTMLInputElement).value)"
	                />
	            </FieldControl>
	            <span class="field-unit">{{ t("unitKg") }}</span>
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
          @input="emit('update:food-log', ($event.target as HTMLTextAreaElement).value)"
          @blur="emit('save-draft', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
      </FieldControl>
    </FormField>

    <div class="actions">
      <div class="provider-field">
        <FormField
          :label="t('analysisModelLabel')"
          :helper="canSelectProvider ? activeProvider?.helper : t('analysisModelNeedsGeminiKey')"
        >
          <FieldControl as="select" :is-saving="isSavingProvider">
            <select
              class="provider-select"
              :value="selectValue"
              :disabled="!canSelectProvider"
              @change="emit('provider-change', ($event.target as HTMLSelectElement).value)"
            >
              <option v-if="!canSelectProvider" value=""></option>
              <option v-for="option in providerOptions" :key="option.id" :value="option.id">
                {{ option.label }}
              </option>
            </select>
          </FieldControl>
        </FormField>
      </div>

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
      <div v-if="analysisError" class="analyze-error" dir="ltr">
        <p>{{ analysisError }}</p>
        <p v-if="showAnalysisRetryAction" class="analyze-error__retry">
          <span>{{ t("analysisRetrySuggestionPrefix") }}</span>
          <a
            class="inline-action-link"
            href="#"
            @click.prevent="emit('retry-analysis-with-model', analysisRetryModelId ?? '')"
          >
            {{ analysisRetryModelLabel }}
          </a>
          <span>{{ t("analysisRetrySuggestionInstead") }}</span>
        </p>
      </div>
      <p v-else-if="analyzeIssue" class="analyze-issue">
        {{ issueText }}
      </p>
      <div v-if="showAnalyzingNotice" class="analysis-notice" role="status" aria-live="polite">
        <span class="analysis-notice__spinner" aria-hidden="true"></span>
        <div class="analysis-notice__copy">
          <strong>{{ t("analysisInProgressTitle") }}</strong>
          <AnalysisSwitchSuggestion
            v-if="showModelSwitchAction && suggestedModelLabel"
            :model-label="suggestedModelLabel"
            @accept="emit('accept-model-switch')"
          />
          <p v-else>{{ t("analyzeSlowNotice") }}</p>
        </div>
      </div>
    </div>
  </div>
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

.localized-date {
  margin: 0.35rem 0 0;
  color: var(--text-muted);
  font-size: 0.82rem;
  line-height: 1.35;
}

.today-log-content {
  display: grid;
  gap: var(--panel-gap);
}

.log-intro {
  display: grid;
  gap: var(--group-gap);
}

.controls-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--controls-gap, var(--group-gap));
  align-items: start;
}

.controls-grid :deep(.field) {
  inline-size: var(--compact-control-inline-size);
  max-inline-size: 100%;
}

.actions {
  display: grid;
  gap: var(--group-gap);
}

.provider-field {
  inline-size: 100%;
  max-inline-size: 100%;
}

.provider-field :deep(.field-control) {
  inline-size: 100%;
}

.provider-select {
  display: block;
  inline-size: 100%;
  max-inline-size: none;
}

.unit-field {
  display: flex;
  gap: var(--field-gap);
  align-items: center;
  inline-size: 100%;
  min-inline-size: 0;
}

.weight-control {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.weight-control :deep(input) {
  inline-size: 100%;
  max-inline-size: 100%;
  min-inline-size: 0;
}

.field-unit {
  padding: 0.26rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 0;
  background: var(--surface-2);
  box-shadow: var(--bevel-raised);
  color: var(--text-muted);
  white-space: nowrap;
}

.weight-input {
  inline-size: 100%;
  min-inline-size: 0;
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
  border: 1px solid currentColor;
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

.analyze-error {
  margin: 6px 0 0;
  color: #7a0000;
  max-inline-size: 46rem;
  display: inline-block;
  padding: 0.35rem 0.55rem;
  background: var(--panel);
  border: 1px solid #000;
  border-color: #808080 #fff #fff #808080;
  border-inline-start-color: #7a0000;
  border-inline-start-width: 6px;
  box-shadow: none;
  white-space: pre-wrap;
}

.analyze-error__retry {
  margin: 0.35rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: baseline;
}

.inline-action-link {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 0.12em;
  cursor: pointer;
}

.analysis-notice {
  margin: 6px auto 0;
  inline-size: min(100%, 42rem);
  display: grid;
  justify-items: center;
  gap: 0.7rem;
  padding: 0.95rem 1rem;
  color: var(--text-primary);
  text-align: center;
  border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border-strong));
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-1) 90%, var(--accent) 10%) 0%,
      color-mix(in srgb, var(--surface-2) 95%, var(--accent) 5%) 100%
    );
  box-shadow: var(--bevel-raised);
}

.analysis-notice--fallback {
  border-color: color-mix(in srgb, var(--accent) 36%, var(--border-strong));
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-1) 86%, var(--accent) 14%) 0%,
      color-mix(in srgb, var(--surface-2) 92%, var(--accent) 8%) 100%
    );
}

.analysis-notice__spinner {
  inline-size: 1.15rem;
  block-size: 1.15rem;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
  border-inline-end-color: var(--accent);
  border-radius: 50%;
  animation: spin 850ms linear infinite;
}

.analysis-notice__copy {
  display: grid;
  gap: 0.24rem;
  justify-items: center;
}

.analysis-notice__copy strong {
  line-height: 1.2;
}

.analysis-notice__copy p {
  color: var(--text-muted);
  max-inline-size: 34rem;
  line-height: 1.4;
}

@media (max-width: 640px) {
  .controls-grid {
    flex-direction: column;
    align-items: stretch;
  }

  .controls-grid :deep(.field) {
    inline-size: 100%;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
