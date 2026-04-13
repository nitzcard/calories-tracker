<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import FieldControl from "../base/FieldControl.vue";
import FormField from "../base/FormField.vue";
import type { AppLocale, ThemeMode } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  themeMode: ThemeMode;
  isSavingLocale: boolean;
  isSavingTheme: boolean;
  cloudMode: "offline" | "cloud";
  cloudConfirmedUsername: string;
  isCloudBusy: boolean;
}>();

const emit = defineEmits<{
  "locale-change": [locale: AppLocale];
  "theme-change": [themeMode: ThemeMode];
}>();

const { t } = useI18n();

const syncIndicator = computed(() => {
  const normalized = props.cloudConfirmedUsername.trim();
  if (props.cloudMode === "cloud") {
    if (normalized) return t("syncIndicatorCloud");
    return t("syncIndicatorCloudPending");
  }
  return t("syncIndicatorLocal");
});

const showCloudIndicator = computed(() => props.cloudMode === "cloud" && Boolean(props.cloudConfirmedUsername.trim()));
const showCloudPending = computed(
  () => props.cloudMode === "cloud" && !Boolean(props.cloudConfirmedUsername.trim()),
);
const confirmedUserTag = computed(() => {
  const user = props.cloudConfirmedUsername.trim();
  return user ? `${user}` : "";
});
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
            :class="{ busy: isCloudBusy }"
            aria-hidden="true"
            title="sync status"
          >
            ●
          </span>
          {{ syncIndicator }}
          <span v-if="confirmedUserTag" class="sync-user" dir="ltr">{{ confirmedUserTag }}</span>
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
              <option value="jasmine">{{ t("jasmine") }}</option>
              <option value="cs16">{{ t("cs16") }}</option>
              <option value="steam">{{ t("steam") }}</option>
              <option value="cyberpunk-2077">{{ t("cyberpunk2077") }}</option>
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

.sync-user {
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.82em;
  opacity: 0.95;
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

.live-dot.busy {
  animation-duration: 520ms;
}

/* Radar-like blip when cloud is connected. */
.sync-pill.cloud .live-dot {
  animation: liveBlink 980ms ease-in-out infinite;
}

@keyframes liveBlink {
  0% {
    opacity: 0.12;
    text-shadow: none;
    transform: scale(0.9);
  }
  55% {
    opacity: 1;
    text-shadow: 0 0 6px rgba(74, 222, 128, 0.75);
    transform: scale(1.15);
  }
  100% {
    opacity: 0.18;
    text-shadow: none;
    transform: scale(0.95);
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
