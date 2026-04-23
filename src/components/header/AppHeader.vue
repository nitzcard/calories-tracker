<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import FieldControl from "../base/FieldControl.vue";
import FormField from "../base/FormField.vue";
import type { AppLocale } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  isSavingLocale: boolean;
  cloudConfirmedUsername: string;
  isCloudBusy: boolean;
  showLogout?: boolean;
  authView?: boolean;
}>();

const emit = defineEmits<{
  "locale-change": [locale: AppLocale];
  logout: [];
}>();

const { t } = useI18n();

const syncIndicator = computed(() => {
  const normalized = props.cloudConfirmedUsername.trim();
  if (normalized) return t("syncIndicatorCloud");
  return t("syncIndicatorCloudPending");
});

const showCloudIndicator = computed(() => props.cloudConfirmedUsername.trim());
const showCloudPending = computed(() => !props.cloudConfirmedUsername.trim());
const confirmedUserTag = computed(() => {
  const user = props.cloudConfirmedUsername.trim();
  return user ? `${user}` : "";
});
</script>

<template>
  <header class="header-shell panel" :class="{ 'header-shell--auth': authView }">
    <div class="copy">
      <div class="title-row">
        <h1 class="title">
          <span>{{ t("appTitle") }}</span>
        </h1>
        <span class="beta-pill">{{ t("beta") }}</span>
      </div>
      <div class="meta-row">
        <span
          class="sync-pill"
          :class="{ cloud: showCloudIndicator, pending: showCloudPending }"
        >
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
          v-if="!authView"
          class="feedback-pill"
          href="https://github.com/nitzcard/calories-tracker/issues"
          target="_blank"
          rel="noreferrer"
        >
          {{ t("feedbackLabel") }}
        </a>
        <button
          v-if="showLogout && !authView"
          type="button"
          class="logout-pill"
          :disabled="isCloudBusy"
          @click="emit('logout')"
        >
          {{ t("cloudLogout") }}
        </button>
      </div>
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

.header-shell--auth {
  max-inline-size: 58rem;
  margin: 0 auto;
  padding: clamp(1rem, 2vw, 1.5rem);
  align-items: start;
}

.copy {
  display: grid;
  gap: var(--field-gap);
  max-inline-size: 42rem;
}

.header-shell--auth .copy {
  max-inline-size: 44rem;
}

.toolbar {
  display: grid;
  gap: var(--group-gap);
  justify-items: end;
  inline-size: fit-content;
  max-inline-size: 100%;
}

.header-shell--auth .toolbar {
  align-self: start;
}

.title {
  color: var(--accent);
  font-weight: 700;
  line-height: 1.1;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.beta-pill {
  padding: 0.1rem 0.38rem;
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  background: var(--chip-bg);
  box-shadow: none;
  color: var(--chip-text);
  font-size: 0.84rem;
  font-weight: 700;
  text-transform: uppercase;
  white-space: nowrap;
}

.feedback-pill {
  padding: 0.18rem 0.45rem;
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  background: var(--chip-bg);
  box-shadow: none;
  color: var(--chip-text);
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.logout-pill {
  padding: 0.18rem 0.52rem;
  min-block-size: 0;
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  background: var(--chip-bg);
  box-shadow: none;
  color: var(--chip-text);
  font-size: 0.84rem;
  font-weight: 700;
  white-space: nowrap;
}

.feedback-pill:hover {
  text-decoration: underline;
}

.sync-pill {
  padding: 0.18rem 0.48rem;
  border: 2px solid #000;
  border-color: #fff #808080 #808080 #fff;
  background: var(--chip-bg);
  box-shadow: none;
  color: var(--chip-text);
  font-size: 0.84rem;
  font-weight: 700;
  white-space: nowrap;
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
}

.sync-user {
  color: inherit;
  font-weight: 600;
  font-size: 0.82em;
  opacity: 1;
}

.sync-pill.cloud {
  color: var(--chip-cloud-text);
  background: var(--chip-cloud-bg);
}

.sync-pill.pending {
  color: var(--chip-pending-text);
  background: var(--chip-pending-bg);
}

.live-dot {
  font-size: 0.9em;
  line-height: 1;
  color: #a3a3a3;
  opacity: 0.75;
}

.sync-pill.cloud .live-dot {
  color: #008000;
}

.sync-pill.pending .live-dot {
  color: #8a6d00;
}

.live-dot.busy {
  animation-duration: 520ms;
}

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

.controls-grid :deep(.field-control) {
  inline-size: 100%;
}

.controls-grid :deep(select) {
  /* Keep the header controls readable even when option labels are long. */
  --field-select-inline-size: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.helper-text {
  color: var(--text-muted);
  margin: 0;
  max-inline-size: 46rem;
}

.header-shell--auth .title {
  font-size: clamp(1.4rem, 2vw, 1.8rem);
}

.header-shell--auth :deep(.field) {
  inline-size: min(12rem, 100%);
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
    inline-size: 100%;
    min-inline-size: 0;
  }

  .meta-row {
    gap: 0.35rem;
  }

  .controls-grid :deep(select) {
    max-inline-size: none;
  }

  .controls-grid :deep(.field) {
    inline-size: 100%;
  }
}
</style>
