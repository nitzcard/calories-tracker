<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import FieldControl from "../base/FieldControl.vue";
import FormField from "../base/FormField.vue";
import type { AiProviderOption, AppLocale, ThemeMode } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  themeMode: ThemeMode;
  provider: string;
  providerOptions: AiProviderOption[];
  isSavingLocale: boolean;
  isSavingTheme: boolean;
  isSavingProvider: boolean;
}>();

const emit = defineEmits<{
  "locale-change": [locale: AppLocale];
  "theme-change": [themeMode: ThemeMode];
  "provider-change": [provider: string];
}>();

const activeProvider = computed(() =>
  props.providerOptions.find((option) => option.id === props.provider),
);

const { t } = useI18n();
</script>

<template>
  <header class="header-shell panel">
    <div class="copy">
      <h1 class="title">
        <span>{{ t("appTitle") }}</span>
        <span class="beta-pill">{{ t("beta") }}</span>
        <a
          class="feedback-pill"
          href="https://github.com/nitzcard/calories-tracker/issues"
          target="_blank"
          rel="noreferrer"
        >
          {{ t("feedbackLabel") }}
        </a>
      </h1>
      <p>{{ t("appSubtitle") }}</p>
      <p class="helper-text">{{ t("headerHelper") }}</p>
    </div>
    <div class="toolbar">
      <div class="controls-grid">
        <FormField :label="t('language')">
          <FieldControl as="select" :is-saving="isSavingLocale">
            <select
              :value="locale"
              @change="
                emit('locale-change', ($event.target as HTMLSelectElement).value as AppLocale)
              "
            >
              <option value="en">English</option>
              <option value="he">עברית</option>
            </select>
          </FieldControl>
        </FormField>
        <FormField :label="t('theme')">
          <FieldControl as="select" :is-saving="isSavingTheme">
            <select
              :value="themeMode"
              @change="
                emit('theme-change', ($event.target as HTMLSelectElement).value as ThemeMode)
              "
            >
              <option value="system">{{ t("system") }}</option>
              <option value="light">{{ t("light") }}</option>
              <option value="dark">{{ t("dark") }}</option>
              <option value="purple-dark">{{ t("purpleDark") }}</option>
            </select>
          </FieldControl>
        </FormField>
        <FormField class="provider-field" :label="t('provider')" :helper="activeProvider?.helper">
          <FieldControl as="select" :is-saving="isSavingProvider">
            <select
              :value="provider"
              @change="emit('provider-change', ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="option in providerOptions" :key="option.id" :value="option.id">
                {{ option.label }}
              </option>
            </select>
          </FieldControl>
        </FormField>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header-shell {
  display: flex;
  justify-content: space-between;
  gap: var(--panel-gap);
  align-items: start;
  margin-block-end: var(--space-3);
}

.copy {
  display: grid;
  gap: var(--field-gap);
  max-inline-size: 42rem;
}

.toolbar {
  display: grid;
  gap: var(--group-gap);
  justify-items: end;
  inline-size: fit-content;
  max-inline-size: 100%;
}

.title {
  display: inline-flex;
  gap: 0.5rem;
  align-items: baseline;
}

.beta-pill {
  padding: 0 0.28rem;
  border: 1px solid var(--border);
  background: var(--surface-2);
  box-shadow: var(--bevel-raised);
  color: var(--text-muted);
  font-size: 0.84rem;
  font-weight: 700;
  text-transform: uppercase;
}

.feedback-pill {
  padding: 0 0.35rem;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 20%, var(--surface-2));
  box-shadow: var(--bevel-raised);
  color: var(--text-primary);
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.feedback-pill:hover {
  text-decoration: underline;
}

.controls-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--controls-gap);
  align-items: start;
  justify-content: flex-end;
}

.controls-grid :deep(.field) {
  inline-size: var(--compact-control-inline-size);
  max-inline-size: 100%;
}

.controls-grid :deep(select) {
  /* Keep the header controls readable even when option labels are long. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.helper-text {
  color: var(--text-muted);
  margin: 0;
  max-inline-size: 46rem;
}

@media (max-width: 960px) {
  .header-shell {
    flex-direction: column;
  }

  .toolbar {
    inline-size: 100%;
    min-inline-size: 0;
    justify-items: stretch;
  }

  .controls-grid {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
  }

  .copy {
    max-inline-size: none;
  }

  .controls-grid :deep(select) {
    max-inline-size: none;
  }

  .controls-grid :deep(.field) {
    inline-size: 100%;
  }
}
</style>
