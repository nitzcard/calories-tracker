<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { AppLocale } from "../../types";

defineProps<{
  locale: AppLocale;
  selectedDate: string;
  currentWeight: string;
  weightUnit: string;
  statusText: string;
}>();

const emit = defineEmits<{
  "update:selectedDate": [value: string];
  "update:currentWeight": [value: string];
  "save-weight": [];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="panel">
    <div class="section-header">
      <div>
        <h2>{{ t("todayWeight") }}</h2>
        <p class="helper-text">{{ t("weightHelper") }}</p>
      </div>
      <input
        class="date-input"
        :value="selectedDate"
        type="date"
        @change="emit('update:selectedDate', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="form-row form-row--entry">
      <div class="weight-box">
        <input
          class="weight-input"
          :value="currentWeight"
          type="number"
          inputmode="decimal"
          :placeholder="t('weight')"
          @input="emit('update:currentWeight', ($event.target as HTMLInputElement).value)"
          @blur="emit('save-weight')"
        />
        <span class="unit-pill">{{ weightUnit }}</span>
      </div>
    </div>
    <p class="helper-text">{{ t("weightAutosave") }}</p>
    <p class="status-line">{{ statusText }}</p>
  </section>
</template>

<style scoped>
.helper-text,
.status-line {
  color: var(--text-muted);
  margin: 0;
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

.date-input {
  inline-size: auto;
  min-inline-size: 11.5rem;
}

.weight-box {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.weight-input {
  inline-size: 8rem;
  max-inline-size: 8rem;
}

.unit-pill {
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.9rem;
}

@media (max-width: 960px) {
  .section-header,
  .form-row {
    flex-direction: column;
    align-items: stretch;
  }

  .weight-box {
    inline-size: 100%;
  }

  .weight-input {
    inline-size: 100%;
    max-inline-size: none;
  }
}
</style>
