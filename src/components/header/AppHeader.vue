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
  cloudMode: "offline" | "cloud";
  cloudConfirmedUsername: string;
  isCloudBusy: boolean;
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

const syncIndicator = computed(() => {
  const normalized = props.cloudConfirmedUsername.trim();
  if (props.cloudMode === "cloud") {
    if (normalized) return t("syncIndicatorCloud", { username: normalized });
    return t("syncIndicatorCloudPending");
  }
  return t("syncIndicatorLocal");
});

const showCloudIndicator = computed(() => props.cloudMode === "cloud" && Boolean(props.cloudConfirmedUsername.trim()));
const showCloudPending = computed(
  () => props.cloudMode === "cloud" && !Boolean(props.cloudConfirmedUsername.trim()),
);
</script>

<template>
  <header class="header-shell panel">
    <div class="copy">
      <h1 class="title">
        <span>{{ t("appTitle") }}</span>
        <span class="beta-pill">{{ t("beta") }}</span>
        <span class="sync-pill" :class="{ cloud: showCloudIndicator, pending: showCloudPending }">
          <span
            class="live-dot"
            :class="{ blinking: isCloudBusy }"
            aria-hidden="true"
            title="sync status"
          >
            ●
          </span>
          {{ syncIndicator }}
        </span>
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
  flex-wrap: wrap;
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

.sync-pill {
  padding: 0 0.35rem;
  border: 1px solid var(--border);
  background: var(--surface-2);
  box-shadow: var(--bevel-raised);
  color: var(--text-muted);
  font-size: 0.84rem;
  font-weight: 700;
  white-space: nowrap;
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
}

.sync-pill.cloud {
  color: var(--text-primary);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
}

.sync-pill.pending {
  border-color: color-mix(in srgb, #eab308 60%, var(--border));
  background: color-mix(in srgb, #eab308 12%, var(--surface-2));
}

.live-dot {
  font-size: 0.9em;
  line-height: 1;
  color: #a3a3a3;
  opacity: 0.75;
}

.sync-pill.cloud .live-dot {
  color: #4ade80;
}

.sync-pill.pending .live-dot {
  color: #eab308;
}

.live-dot.blinking {
  animation: liveBlink 850ms ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .live-dot.blinking {
    animation: none;
  }
}

@keyframes liveBlink {
  0%,
  100% {
    opacity: 0.2;
  }
  50% {
    opacity: 1;
  }
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
