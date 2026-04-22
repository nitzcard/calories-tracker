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
  "update:cloudUsername": [value: string];
  "update:profile": [profile: Profile];
  save: [profile: Profile];
  sync: [payload: { username: string; password?: string }];
  logout: [];
}>();

const { t } = useI18n();
const isOnline = ref(typeof navigator === "undefined" ? true : navigator.onLine);
const draftUsername = ref(props.cloudUsername);
const draftPassword = ref("");
let profileSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let latestProfileToSave: Profile | null = null;
const PROFILE_SAVE_DEBOUNCE_MS = 2000;

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
const usernameTooShort = computed(() => usernameNormalized.value.length > 0 && usernameNormalized.value.length < 3);
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

function scheduleProfileSave(nextProfile: Profile) {
  latestProfileToSave = nextProfile;
  if (profileSaveTimeout) clearTimeout(profileSaveTimeout);
  profileSaveTimeout = setTimeout(() => {
    if (!latestProfileToSave) return;
    emit("save", latestProfileToSave);
    profileSaveTimeout = null;
  }, PROFILE_SAVE_DEBOUNCE_MS);
}

function saveEmail(event: Event) {
  const email = (event.target as HTMLInputElement).value;
  const nextProfile = { ...props.profile, email };
  emit("update:profile", nextProfile);
  scheduleProfileSave(nextProfile);
}

function syncNow() {
  emit("update:cloudUsername", draftUsername.value);
  const password = draftPassword.value.trim();
  emit("sync", { username: draftUsername.value, password: password || undefined });
  draftPassword.value = "";
}

function syncExistingUser() {
  emit("update:cloudUsername", draftUsername.value);
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
  <BasePanel :title="t('cloudSyncTitle')" :helper="t('cloudSyncHelper')" :class="{ 'cloud-panel--auth': authView }">
    <div class="cloud-controls" :class="{ 'cloud-controls--auth': authView }">
      <form class="auth-block" @submit.prevent="onSubmit">
        <FormField :label="t('cloudUsername')" reserve-helper-space>
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

        <FormField v-if="!authView" :helper="t('emailHelper')">
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
    <p v-if="cloudError" class="status-pill status-pill--error" dir="ltr">{{ cloudError }}</p>
    <p v-if="draftDiffersFromConfirmed" class="status-pill">{{ t("cloudUsernameNeedsSync") }}</p>
    <p v-if="!supabaseConfigured" class="status-pill">{{ t("cloudSupabaseMissing") }}</p>
  </BasePanel>
</template>

<style scoped>
.cloud-panel--auth {
  inline-size: min(100%, 46rem);
  margin: 0 auto;
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
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.cloud-panel--auth .cloud-actions {
  grid-column: 1 / -1;
  justify-content: flex-end;
  padding-top: 0.25rem;
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
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 0.78rem;
  line-height: 1;
  box-shadow: var(--bevel-raised);
}

.logout-action {
  background: color-mix(in srgb, #7c2d2d 14%, var(--surface-1));
  border-color: color-mix(in srgb, #7c2d2d 55%, var(--border-strong));
}

.logout-action:hover {
  background: color-mix(in srgb, #7c2d2d 18%, var(--surface-1));
}

.status-pill {
  margin: 8px 0 0;
  padding: 0.28rem 0.45rem;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  box-shadow: var(--bevel-sunken);
  color: var(--text-muted);
}

.status-pill--error {
  border-color: #7c2d2d;
  background: #f0c6c3;
  color: #651c1c;
  font-weight: 700;
}

.muted {
  color: var(--text-muted);
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
</style>
