<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import FieldControl from "../base/FieldControl.vue";
import FormField from "../base/FormField.vue";
import type { AppLocale, Profile } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  profile: Profile;
  cloudUsername: string;
  cloudConfirmedUsername?: string;
  hasSavedCloudPassword: boolean;
  isCloudBusy: boolean;
  cloudStatus: "idle" | "synced" | "failed";
  cloudLastSyncedAt: string;
  cloudError: string;
  supabaseConfigured: boolean;
  authView?: boolean;
}>();

const emit = defineEmits<{
  "update:cloud-username": [value: string];
  "update:profile": [profile: Profile];
  save: [profile: Profile];
  sync: [payload: { username: string; password?: string }];
  logout: [];
}>();

const { t } = useI18n();
const isOnline = ref(typeof navigator === "undefined" ? true : navigator.onLine);
const draftUsername = ref(props.cloudUsername);
const draftPassword = ref("");

watch(
  () => props.cloudUsername,
  (value) => {
    draftUsername.value = value;
  },
);

watch(
  () => props.hasSavedCloudPassword,
  (saved) => {
    if (saved) {
      draftPassword.value = "";
    }
  },
);

function onOnline() {
  isOnline.value = true;
}

function onOffline() {
  isOnline.value = false;
}

onMounted(() => {
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
});

onUnmounted(() => {
  window.removeEventListener("online", onOnline);
  window.removeEventListener("offline", onOffline);
});

const statusText = computed(() => {
  if (props.cloudStatus === "synced") return t("cloudSyncSuccess");
  if (props.cloudStatus === "failed") return t("cloudSyncFailed");
  return "";
});

const usernameNormalized = computed(() => draftUsername.value.trim().toLowerCase());
const confirmedNormalized = computed(() => (props.cloudConfirmedUsername ?? "").trim().toLowerCase());
const hasConfirmedUser = computed(() => Boolean(confirmedNormalized.value));
const draftDiffersFromConfirmed = computed(
  () =>
    hasConfirmedUser.value &&
    usernameNormalized.value.length > 0 &&
    confirmedNormalized.value !== usernameNormalized.value,
);
const isLoggedIn = computed(() => hasConfirmedUser.value && confirmedNormalized.value === usernameNormalized.value);
const canLogin = computed(
  () =>
    !props.isCloudBusy &&
    !isLoggedIn.value &&
    usernameNormalized.value.length >= 3 &&
    (Boolean(draftPassword.value.trim()) || props.hasSavedCloudPassword) &&
    props.supabaseConfigured &&
    isOnline.value,
);
const canSyncExistingUser = computed(
  () => !props.isCloudBusy && isLoggedIn.value && props.supabaseConfigured && isOnline.value,
);

function saveEmail(event: Event) {
  const email = (event.target as HTMLInputElement).value;
  const nextProfile = { ...props.profile, email };
  emit("update:profile", nextProfile);
  emit("save", nextProfile);
}

function syncNow() {
  emit("update:cloud-username", draftUsername.value);
  const password = draftPassword.value.trim();
  emit("sync", { username: draftUsername.value, password: password || undefined });
  draftPassword.value = "";
}

function syncExistingUser() {
  emit("update:cloud-username", draftUsername.value);
  emit("sync", { username: draftUsername.value, password: draftPassword.value.trim() || undefined });
  draftPassword.value = "";
}

function logout() {
  draftPassword.value = "";
  emit("logout");
}

function onSubmit() {
  if (canLogin.value) {
    syncNow();
    return;
  }

  if (canSyncExistingUser.value) {
    syncExistingUser();
  }
}
</script>

<template>
  <BasePanel
    :title="authView ? t('cloudLogin') : t('cloudSyncTitle')"
    :helper="t('cloudSyncHelper')"
    :class="{ 'cloud-panel--auth': authView }"
  >
    <div class="cloud-controls" :class="{ 'cloud-controls--auth': authView }">
      <form class="auth-block" @submit.prevent="onSubmit">
        <FormField :label="t('cloudUsername')" :reserve-helper-space="!authView">
          <FieldControl>
            <input
              type="text"
              :disabled="isCloudBusy"
              :value="draftUsername"
              autocomplete="username"
              @input="draftUsername = ($event.target as HTMLInputElement).value"
            />
          </FieldControl>
        </FormField>

        <FormField
          :label="t('cloudPassword')"
          :helper="hasSavedCloudPassword ? t('cloudPasswordSaved') : t('cloudPasswordHint')"
        >
          <FieldControl>
            <input
              type="password"
              autocomplete="current-password"
              :disabled="isCloudBusy || hasSavedCloudPassword"
              :value="draftPassword"
              :placeholder="hasSavedCloudPassword ? t('cloudPasswordSavedPlaceholder') : ''"
              @input="draftPassword = ($event.target as HTMLInputElement).value"
            />
          </FieldControl>
        </FormField>

        <FormField :helper="t('emailHelper')">
          <template #label>
            <span class="field-label-with-pill">
              <span>{{ t("email") }}</span>
              <span class="optional-pill">{{ t("optionalLabel") }}</span>
            </span>
          </template>
          <FieldControl>
            <input
              :value="profile.email ?? ''"
              type="email"
              inputmode="email"
              autocomplete="email"
              :placeholder="t('emailPlaceholder')"
              @input="saveEmail"
            />
          </FieldControl>
        </FormField>

        <div class="cloud-actions">
          <button
            type="submit"
            class="secondary-action"
            :disabled="!canLogin"
          >
            <span v-if="isCloudBusy" class="button-feedback" aria-hidden="true"></span>
            {{ t("cloudLogin") }}
          </button>

          <button
            v-if="isLoggedIn"
            type="button"
            class="secondary-action"
            :disabled="!canSyncExistingUser"
            @click="syncExistingUser"
          >
            <span v-if="isCloudBusy" class="button-feedback" aria-hidden="true"></span>
            {{ t("cloudSyncNow") }}
          </button>

          <button
            v-if="hasConfirmedUser"
            type="button"
            class="secondary-action logout-action"
            :disabled="isCloudBusy"
            @click="logout"
          >
            {{ t("cloudLogout") }}
          </button>
        </div>
      </form>
    </div>

    <p v-if="statusText" class="status-pill">
      {{ statusText }}
      <span v-if="cloudLastSyncedAt" class="muted">({{ cloudLastSyncedAt }})</span>
    </p>
    <p v-if="cloudError" class="status-pill status-pill--error" dir="ltr">
      <span class="status-pill__icon" aria-hidden="true">!</span>
      <span>{{ cloudError }}</span>
    </p>
    <p v-if="draftDiffersFromConfirmed" class="status-pill">{{ t("cloudUsernameNeedsSync") }}</p>
    <p v-if="!supabaseConfigured" class="status-pill">{{ t("cloudSupabaseMissing") }}</p>
  </BasePanel>
</template>

<style scoped>
.cloud-panel--auth {
  inline-size: 100%;
  margin: 0;
  padding: clamp(1.05rem, 2.4vw, 1.45rem);
  border-color: color-mix(in srgb, var(--accent) 18%, var(--border-strong));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 98%, transparent), color-mix(in srgb, var(--surface-2) 64%, var(--surface-1)));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 24px 70px rgba(8, 24, 24, 0.14);
}

.cloud-panel--auth :deep(.section-header) {
  padding-block-end: 0.15rem;
  border-block-end: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
}

.cloud-panel--auth :deep(.section-header h2) {
  font-size: 1.25rem;
  letter-spacing: 0;
}

.cloud-panel--auth :deep(.helper-text) {
  max-inline-size: 27rem;
}

.cloud-controls {
  display: grid;
  gap: 8px;
  margin-block-start: 10px;
}

.cloud-controls--auth {
  margin-block-start: 0;
}

.auth-block :deep(.helper-slot) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cloud-actions {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: 8px;
  min-inline-size: 0;
}

.auth-block {
  display: grid;
  column-gap: 12px;
  row-gap: 8px;
}

.auth-block > * {
  min-inline-size: 0;
}

.auth-block :deep(.field-control) {
  inline-size: 100%;
}

@media (min-width: 860px) {
  .auth-block {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
  }

  .cloud-actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 859px) {
  .auth-block {
    grid-template-columns: 1fr;
  }
}

.cloud-panel--auth .auth-block {
  grid-template-columns: 1fr;
  gap: 0.82rem;
}

.cloud-panel--auth .auth-block :deep(input) {
  inline-size: 100%;
  max-inline-size: none;
}

.cloud-panel--auth .auth-block :deep(.helper-slot) {
  white-space: normal;
  overflow: visible;
  min-block-size: 0;
  line-height: 1.35;
}

.cloud-panel--auth .cloud-actions {
  grid-column: auto;
  justify-content: stretch;
  padding-top: 0.25rem;
}

.cloud-panel--auth .cloud-actions > button {
  flex: 1 1 100%;
  inline-size: 100%;
  max-inline-size: none;
  justify-content: center;
  min-block-size: 2.85rem;
  font-weight: 800;
}

.cloud-panel--auth .cloud-actions > button[type="submit"] {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border-strong));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 20%, var(--surface-1)),
    color-mix(in srgb, var(--accent) 12%, var(--surface-1))
  );
}

.cloud-panel--auth .status-pill {
  margin-top: 0.75rem;
}

@media (max-width: 720px) {
  .cloud-panel--auth .auth-block {
    grid-template-columns: 1fr;
  }
}

.field-label-with-pill {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.optional-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.35rem;
  border: 1px solid #000;
  border-color: var(--border-color);
  background: var(--surface-1);
  color: var(--text-muted);
  font-size: 0.78rem;
  line-height: 1;
  box-shadow: none;
}

.logout-action {
  background: var(--surface-1);
}

.logout-action:hover {
  background: var(--surface-1);
}

.status-pill {
  margin: 8px 0 0;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.58rem 0.68rem;
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface-2) 86%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.status-pill--error {
  border-color: var(--status-toast-error-border);
  background: var(--status-toast-error-bg);
  color: var(--status-toast-error-text);
  font-weight: 700;
}

.status-pill__icon {
  display: inline-grid;
  place-items: center;
  inline-size: 1.25rem;
  block-size: 1.25rem;
  flex: 0 0 auto;
  border-radius: 999px;
  background: color-mix(in srgb, var(--status-toast-error-text) 14%, var(--surface-1));
  color: var(--status-toast-error-text);
  font-size: 0.82rem;
  font-weight: 900;
  line-height: 1;
}

.muted {
  color: var(--text-muted);
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

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
