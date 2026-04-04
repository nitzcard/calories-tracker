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
      <h1>{{ t("appTitle") }}</h1>
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

.controls-grid {
  display: grid;
  grid-template-columns: minmax(130px, 150px) minmax(130px, 150px) minmax(220px, 260px);
  gap: var(--controls-gap);
  align-items: start;
  inline-size: auto;
  justify-content: end;
}

.provider-field {
  min-inline-size: 220px;
}

.provider-field :deep(select) {
  max-inline-size: 100%;
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
    grid-template-columns: 1fr;
  }

  .provider-field {
    min-inline-size: 0;
  }

  .copy {
    max-inline-size: none;
  }
}
</style>
