<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import FormField from "../base/FormField.vue";
import type { AppLocale } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  cloudMode: "offline" | "cloud";
  cloudUsername: string;
  cloudConfirmedUsername?: string;
  isCloudBusy: boolean;
  cloudStatus: "idle" | "synced" | "failed";
  cloudLastSyncedAt: string;
  cloudError: string;
  supabaseConfigured: boolean;
}>();

const emit = defineEmits<{
  "update:cloudMode": [value: "offline" | "cloud"];
  "update:cloudUsername": [value: string];
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
const usernameTooShort = computed(
  () => props.cloudMode === "cloud" && usernameNormalized.value.length > 0 && usernameNormalized.value.length < 3,
);
const confirmedNormalized = computed(() => (props.cloudConfirmedUsername ?? "").trim().toLowerCase());
const hasConfirmedUser = computed(() => Boolean(confirmedNormalized.value));
const draftDiffersFromConfirmed = computed(
  () =>
    hasConfirmedUser.value &&
    usernameNormalized.value.length > 0 &&
    confirmedNormalized.value !== usernameNormalized.value,
);
const isLoggedIn = computed(() => hasConfirmedUser.value && confirmedNormalized.value === usernameNormalized.value);

function syncNow() {
  // Only commit the username when the user explicitly approves sync.
  emit("update:cloudUsername", draftUsername.value);
  emit("sync", { username: draftUsername.value, password: draftPassword.value });
  draftPassword.value = "";
}

function syncExistingUser() {
  emit("update:cloudUsername", draftUsername.value);
  emit("sync", { username: draftUsername.value, password: draftPassword.value.trim() || undefined });
}

function logout() {
  draftPassword.value = "";
  emit("logout");
}
</script>

<template>
  <BasePanel :title="t('cloudSyncTitle')" :helper="t('cloudSyncHelper')">
    <div class="cloud-controls">
      <FormField :label="t('cloudMode')">
        <select
          :value="cloudMode"
          @change="emit('update:cloudMode', ($event.target as HTMLSelectElement).value as 'offline' | 'cloud')"
        >
          <option value="offline">{{ t("cloudModeOffline") }}</option>
          <option value="cloud">{{ t("cloudModeCloud") }}</option>
        </select>
      </FormField>

      <div class="auth-block" :class="{ 'auth-block--disabled': cloudMode !== 'cloud' }">
        <FormField :label="t('cloudUsername')">
          <input
            :disabled="cloudMode !== 'cloud' || isLoggedIn"
            :value="draftUsername"
            autocomplete="username"
            @input="draftUsername = ($event.target as HTMLInputElement).value"
          />
        </FormField>

        <FormField :label="t('cloudPassword')" :helper="cloudMode === 'cloud' ? t('cloudPasswordHint') : ''">
          <input
            type="password"
            autocomplete="current-password"
            :disabled="cloudMode !== 'cloud' || isCloudBusy"
            :value="draftPassword"
            @input="draftPassword = ($event.target as HTMLInputElement).value"
          />
        </FormField>

        <div class="cloud-actions">
          <button
            class="secondary-action"
            :disabled="
              isCloudBusy ||
              cloudMode !== 'cloud' ||
              isLoggedIn ||
              usernameNormalized.length < 3 ||
              !draftPassword.trim() ||
              !supabaseConfigured ||
              !isOnline
            "
            @click="syncNow"
          >
            <span v-if="isCloudBusy" class="button-feedback" aria-hidden="true"></span>
            {{ t("cloudLogin") }}
          </button>

          <button
            v-if="isLoggedIn"
            class="secondary-action"
            :disabled="isCloudBusy || cloudMode !== 'cloud' || !supabaseConfigured || !isOnline"
            @click="syncExistingUser"
          >
            <span v-if="isCloudBusy" class="button-feedback" aria-hidden="true"></span>
            {{ t("cloudSyncNow") }}
          </button>

          <button
            v-if="hasConfirmedUser"
            class="secondary-action logout-action"
            :disabled="isCloudBusy"
            @click="logout"
          >
            {{ t("cloudLogout") }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="statusText" class="status-pill">
      {{ statusText }}
      <span v-if="cloudLastSyncedAt" class="muted">({{ cloudLastSyncedAt }})</span>
    </p>
    <p v-if="cloudError" class="status-pill status-pill--error" dir="ltr">{{ cloudError }}</p>
    <p v-if="draftDiffersFromConfirmed" class="status-pill">{{ t("cloudUsernameNeedsSync") }}</p>
    <p v-if="cloudMode === 'cloud' && !draftUsername.trim()" class="status-pill">{{ t("cloudUsernameMissing") }}</p>
    <p v-else-if="usernameTooShort" class="status-pill">{{ t("cloudUsernameTooShort", { min: 3 }) }}</p>
    <p v-if="cloudMode === 'cloud' && !supabaseConfigured" class="status-pill">{{ t("cloudSupabaseMissing") }}</p>
  </BasePanel>
</template>

<style scoped>
.cloud-controls {
  display: grid;
  gap: 8px;
  margin-block-start: 10px;
}

.cloud-actions {
  display: flex;
  align-items: end;
  gap: 8px;
}

.auth-block {
  display: grid;
  gap: 8px;
}

.auth-block--disabled {
  filter: grayscale(1);
  opacity: 0.72;
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
