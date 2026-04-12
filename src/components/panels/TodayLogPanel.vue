<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
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
  analysisError?: string | null;
  isSavingWeight: boolean;
  isSavingFoodLog: boolean;
  embedded?: boolean;
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

// Slow-model notice: show after 8 seconds of continuous analysis.
const analysisElapsed = ref(0);
let analysisTimer: ReturnType<typeof setInterval> | null = null;

watch(
  () => props.isAnalyzing,
  (analyzing) => {
    if (analyzing) {
      analysisElapsed.value = 0;
      analysisTimer = setInterval(() => {
        analysisElapsed.value++;
      }, 1000);
    } else {
      if (analysisTimer) {
        clearInterval(analysisTimer);
        analysisTimer = null;
      }
      analysisElapsed.value = 0;
    }
  },
);

onUnmounted(() => {
  if (analysisTimer) {
    clearInterval(analysisTimer);
  }
});

const showSlowNotice = computed(() => props.isAnalyzing && analysisElapsed.value >= 8);
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
              @input="emit('update:selectedDate', ($event.target as HTMLInputElement).value)"
            />
	          </FormField>
	          <FormField :label="t('todayWeight')">
	            <div class="unit-field">
		              <FieldControl class="weight-control" :is-saving="isSavingWeight">
		                <input
		                  class="weight-input"
		                  type="number"
		                  step="0.1"
		                  min="0"
		                  dir="ltr"
		                  :value="currentWeight"
		                  @input="emit('update:currentWeight', ($event.target as HTMLInputElement).value)"
		                  @blur="emit('save-weight')"
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
        <p v-if="showSlowNotice" class="slow-notice">
          {{ t("analyzeSlowNotice") }}
        </p>
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
            @input="emit('update:selectedDate', ($event.target as HTMLInputElement).value)"
          />
	        </FormField>
	        <FormField :label="t('todayWeight')">
	          <div class="unit-field">
	            <FieldControl class="weight-control" :is-saving="isSavingWeight">
	              <input
	                class="weight-input"
	                type="number"
	                step="0.1"
	                min="0"
	                dir="ltr"
	                :value="currentWeight"
	                @input="emit('update:currentWeight', ($event.target as HTMLInputElement).value)"
	                @blur="emit('save-weight')"
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
      <p v-if="analysisError" class="analyze-error" dir="ltr">
        {{ analysisError }}
      </p>
      <p v-else-if="analyzeIssue" class="analyze-issue">
        {{ issueText }}
      </p>
      <p v-if="showSlowNotice" class="slow-notice">
        {{ t("analyzeSlowNotice") }}
      </p>
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
.unit-field {
  display: inline-flex;
  gap: var(--field-gap);
  align-items: center;
  inline-size: min(100%, max-content);
  max-inline-size: 100%;
}

.weight-control {
  flex: 0 0 auto;
}

.weight-control :deep(input) {
  inline-size: 8rem;
  max-inline-size: 8rem;
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

.analyze-error {
  margin: 6px 0 0;
  color: #fff1ef;
  max-inline-size: 46rem;
  display: inline-block;
  padding: 0.35rem 0.55rem;
  background: #7a3d36;
  border: 1px solid #4e221d;
  box-shadow: var(--bevel-raised);
  white-space: pre-wrap;
}

.slow-notice {
  margin: 6px 0 0;
  color: var(--text-muted);
  max-inline-size: 46rem;
  display: inline-block;
  padding: 0.35rem 0.55rem;
  background: color-mix(in srgb, #b87a1a 12%, var(--surface-2));
  border: 1px solid color-mix(in srgb, #b87a1a 50%, var(--border-strong));
  box-shadow: var(--bevel-raised);
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
