<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
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
  "go-today": [];
  logout: [];
}>();

const { t } = useI18n();

const syncIndicator = computed(() => {
  const normalized = props.cloudConfirmedUsername.trim();
  return normalized ? t("syncIndicatorCloud") : t("syncIndicatorCloudPending");
});

const showCloudIndicator = computed(() => props.cloudConfirmedUsername.trim());
const showCloudPending = computed(() => !props.cloudConfirmedUsername.trim());
const confirmedUserTag = computed(() => props.cloudConfirmedUsername.trim());
</script>

<template>
  <header class="header-shell panel" :class="{ 'header-shell--auth': authView }">
    <div class="copy">
      <button
        v-if="!authView"
        type="button"
        class="title-row title-row--action"
        @click="emit('go-today')"
      >
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="brand-mark__svg">
            <path d="M5.5 17.5V11.75" />
            <path d="M10.5 17.5V8.5" />
            <path d="M15.5 17.5v-3.75" />
            <path d="M4.75 8.75 9.25 12l4-5 5 2.25" />
            <path d="m16.5 8.75 1.75.5-.5 1.75" />
          </svg>
        </div>
        <div class="brand-copy">
          <h1 class="title">{{ t("appTitle") }}</h1>
          <p class="helper-text">{{ t("appSubtitle") }}</p>
        </div>
      </button>

      <div v-else class="title-row">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="brand-mark__svg">
            <path d="M5.5 17.5V11.75" />
            <path d="M10.5 17.5V8.5" />
            <path d="M15.5 17.5v-3.75" />
            <path d="M4.75 8.75 9.25 12l4-5 5 2.25" />
            <path d="m16.5 8.75 1.75.5-.5 1.75" />
          </svg>
        </div>
        <div class="brand-copy">
          <h1 class="title">{{ t("appTitle") }}</h1>
          <p class="helper-text">{{ t("appSubtitle") }}</p>
        </div>
      </div>

      <div class="copy-utilities">
        <div class="locale-control" :aria-label="t('language')">
          <div class="locale-switch" :class="{ 'is-saving': isSavingLocale }" role="group" :aria-label="t('language')">
            <button
              type="button"
              class="locale-switch__option"
              :data-active="locale === 'en' ? 'true' : 'false'"
              :disabled="isSavingLocale"
              aria-label="English"
              title="English"
              @click="emit('locale-change', 'en')"
            >
              <span class="locale-switch__flag" aria-hidden="true">🇺🇸</span>
            </button>
            <button
              type="button"
              class="locale-switch__option"
              :data-active="locale === 'he' ? 'true' : 'false'"
              :disabled="isSavingLocale"
              aria-label="עברית"
              title="עברית"
              @click="emit('locale-change', 'he')"
            >
              <span class="locale-switch__flag" aria-hidden="true">🇮🇱</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <button
        v-if="showLogout && !authView"
        type="button"
        class="toolbar-button toolbar-button--logout"
        :disabled="isCloudBusy"
        @click="emit('logout')"
      >
        {{ t("cloudLogout") }}
      </button>

      <div class="meta-row">
        <span
          class="sync-status"
          :class="{ 'sync-status--cloud': showCloudIndicator, 'sync-status--pending': showCloudPending }"
        >
          <span class="live-dot" :class="{ busy: isCloudBusy }" aria-hidden="true" title="sync status">●</span>
          <span class="sync-label">{{ syncIndicator }}</span>
          <span v-if="confirmedUserTag" class="sync-user" dir="ltr">{{ confirmedUserTag }}</span>
        </span>

        <a
          v-if="!authView"
          class="toolbar-link"
          href="https://github.com/nitzcard/calories-tracker/issues"
          target="_blank"
          rel="noreferrer"
        >
          {{ t("feedbackLabel") }}
        </a>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.9rem 1rem;
  align-items: center;
  margin-block-end: var(--space-3);
  padding: 0.8rem 1rem;
  border-radius: calc(var(--radius) + 0.1rem);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 95%, transparent), color-mix(in srgb, var(--surface-2) 82%, transparent));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 16px 38px rgba(8, 24, 24, 0.08);
}

.header-shell--auth {
  max-inline-size: 56rem;
  margin: 0 auto;
  padding: clamp(1rem, 2vw, 1.45rem);
}

.copy {
  display: grid;
  gap: 0.7rem;
  min-inline-size: 0;
}

.copy-utilities {
  display: flex;
  justify-content: flex-start;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-inline-size: 0;
}

.title-row--action {
  inline-size: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: start;
  cursor: pointer;
}

.title-row--action:hover .title,
.title-row--action:hover .helper-text {
  color: var(--text-primary);
}

.title-row--action:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 64%, white 36%);
  outline-offset: 4px;
  border-radius: var(--radius-sm);
}

.brand-mark {
  display: grid;
  place-items: center;
  inline-size: 2.55rem;
  block-size: 2.55rem;
  flex: 0 0 auto;
  border-radius: 0.72rem;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 88%, white 12%), color-mix(in srgb, var(--accent-strong) 88%, black 12%));
  box-shadow: 0 12px 28px color-mix(in srgb, var(--accent) 18%, transparent);
}

.brand-mark__svg {
  inline-size: 1.2rem;
  block-size: 1.2rem;
  color: white;
}

.brand-mark__svg path {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.brand-copy {
  display: grid;
  gap: 0.18rem;
  min-inline-size: 0;
}

.title {
  margin: 0;
  color: color-mix(in srgb, var(--text-primary) 84%, white 16%);
  font-weight: 780;
  line-height: 1.1;
  font-size: clamp(1rem, 1.3vw, 1.14rem);
  letter-spacing: -0.02em;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.08);
}

.toolbar {
  display: grid;
  gap: 0.65rem;
  justify-items: end;
  inline-size: fit-content;
  max-inline-size: 100%;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.55rem;
  flex-wrap: wrap;
  min-inline-size: 0;
  max-inline-size: 100%;
}

.toolbar-link,
.toolbar-button {
  padding: 0.45rem 0.7rem;
  min-block-size: 0;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  background: color-mix(in srgb, var(--surface-1) 88%, transparent);
  color: var(--text-muted);
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  border-radius: var(--radius-sm);
}

.toolbar-link:hover,
.toolbar-button:hover {
  color: var(--text-primary);
  border-color: color-mix(in srgb, var(--border) 72%, transparent);
  background: color-mix(in srgb, var(--surface-2) 82%, transparent);
}

.toolbar-button--logout {
  padding: 0.28rem 0.5rem;
  border-color: transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.79rem;
  font-weight: 600;
  box-shadow: none;
}

.toolbar-button--logout:hover,
.toolbar-button--logout:focus-visible {
  color: color-mix(in srgb, var(--text-primary) 88%, white 12%);
  border-color: transparent;
  background: color-mix(in srgb, var(--surface-2) 72%, transparent);
}

.sync-status {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  color: var(--text-muted);
  font-size: 0.84rem;
  font-weight: 600;
  white-space: nowrap;
  padding: 0.42rem 0.68rem;
  border: 1px solid color-mix(in srgb, var(--border-strong) 72%, transparent);
  border-radius: calc(var(--radius-sm) + 0.08rem);
  background: color-mix(in srgb, var(--surface-2) 82%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.sync-label {
  color: var(--text-primary);
}

.sync-user {
  color: var(--accent-strong);
  font-weight: 700;
  font-size: 0.82em;
}

.sync-status--cloud .sync-label {
  color: color-mix(in srgb, var(--accent-strong) 22%, var(--text-primary));
}

.sync-status--pending .sync-label {
  color: color-mix(in srgb, #8b5b00 82%, var(--text-primary));
}

.live-dot {
  font-size: 0.9em;
  line-height: 1;
  color: #a3a3a3;
  opacity: 0.75;
}

.sync-status--cloud .live-dot {
  color: #0ea568;
  animation: liveBlink 980ms ease-in-out infinite;
}

.sync-status--pending .live-dot {
  color: #b18400;
}

.live-dot.busy {
  animation-duration: 520ms;
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

.helper-text {
  color: var(--text-muted);
  margin: 0;
  max-inline-size: 32rem;
  line-height: 1.4;
  font-size: 0.88rem;
}

.locale-control {
  display: inline-flex;
  align-items: center;
  min-inline-size: 0;
}

.locale-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.24rem;
  padding: 0.22rem;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: calc(var(--radius-sm) + 0.14rem);
  background: color-mix(in srgb, var(--surface-1) 90%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.locale-switch.is-saving {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
}

.locale-switch__option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 2.4rem;
  block-size: 2.2rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: calc(var(--radius-sm) - 0.04rem);
  background: transparent;
  box-shadow: none;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}

.locale-switch__option[data-active="true"] {
  border-color: color-mix(in srgb, var(--accent) 24%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 16%, var(--surface-1)),
    color-mix(in srgb, var(--accent) 9%, var(--surface-1))
  );
}

.locale-switch__flag {
  font-size: 1.1rem;
  line-height: 1;
}

@media (max-width: 960px) {
  .header-shell {
    grid-template-columns: 1fr;
    align-items: start;
    padding: 0.78rem 0.9rem;
  }

  .toolbar {
    inline-size: 100%;
    min-inline-size: 0;
    justify-items: stretch;
  }

  .locale-control {
    margin-inline-start: 0;
  }

  .meta-row {
    justify-content: flex-start;
  }
}
</style>
