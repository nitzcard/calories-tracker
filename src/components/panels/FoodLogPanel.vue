<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { AppLocale } from "../../types";

defineProps<{
  locale: AppLocale;
  foodLog: string;
  isAnalyzing: boolean;
}>();

const emit = defineEmits<{
  "update:foodLog": [value: string];
  "save-draft": [];
  analyze: [];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="panel">
    <div class="section-header">
      <div>
        <h2>{{ t("whatIAte") }}</h2>
        <p class="helper-text">{{ t("foodHelper") }}</p>
      </div>
    </div>
    <textarea
      :value="foodLog"
      :placeholder="t('foodPlaceholder')"
      @input="emit('update:foodLog', ($event.target as HTMLTextAreaElement).value)"
      @blur="emit('save-draft')"
    ></textarea>
    <p class="helper-text helper-text--after">{{ t("analyzeHelper") }}</p>
    <div class="form-row form-row--entry">
      <button class="primary-action" :disabled="isAnalyzing" @click="emit('analyze')">
        <span v-if="isAnalyzing" class="button-feedback" aria-hidden="true"></span>
        {{ isAnalyzing ? t("analyzingNow") : t("analyzeFood") }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.helper-text {
  color: var(--text-muted);
  margin: 0;
}

.helper-text--after {
  margin-block-start: 8px;
}

.section-header,
.form-row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.form-row {
  margin-block-start: 10px;
}

.primary-action {
  padding: 0.42rem 0.72rem;
  background: #0a6f63;
  color: white;
  border: 1px solid #065248;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
  transition:
    transform 120ms ease,
    background-color 120ms ease,
    box-shadow 120ms ease,
    filter 120ms ease;
}

.primary-action:hover:not(:disabled) {
  background: #0d7d70;
}

.primary-action:focus-visible {
  outline: 2px solid color-mix(in srgb, #0a6f63 60%, white);
  outline-offset: 2px;
}

.primary-action:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: none;
}

.primary-action:disabled {
  cursor: progress;
  opacity: 0.82;
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

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 960px) {
  .section-header,
  .form-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
