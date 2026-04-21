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
	  cloudMode: "offline" | "cloud";
	  cloudUsername: string;
	  cloudConfirmedUsername?: string;
    hasSavedCloudPassword: boolean;
	  isCloudBusy: boolean;
	  cloudStatus: "idle" | "synced" | "failed";
	  cloudLastSyncedAt: string;
	  cloudError: string;
	  supabaseConfigured: boolean;
	}>();

const emit = defineEmits<{
  "update:cloudMode": [value: "offline" | "cloud"];
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
const cloudModeSelectWidth = computed(() => {
  const offlineLabel = t("cloudModeOffline");
  const cloudLabel = hasConfirmedUser.value ? t("cloudModeCloud") : t("cloudModeCloudPending");
  const longest = Math.max(offlineLabel.trim().length, cloudLabel.trim().length);
  const widthCh = Math.min(70, Math.max(36, longest + 10));
  return `${widthCh}ch`;
});
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
const usernameTooShort = computed(
  () => props.cloudMode === "cloud" && usernameNormalized.value.length > 0 && usernameNormalized.value.length < 3,
);
const confirmedNormalized = computed(() => (props.cloudConfirmedUsername ?? "").trim().toLowerCase());
const hasConfirmedUser = computed(() => Boolean(confirmedNormalized.value));
const cloudModeLabel = computed(() =>
  hasConfirmedUser.value ? t("cloudModeCloud") : t("cloudModeCloudPending"),
);
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
    props.cloudMode === "cloud" &&
    !isLoggedIn.value &&
    usernameNormalized.value.length >= 3 &&
    (Boolean(draftPassword.value.trim()) || props.hasSavedCloudPassword) &&
    props.supabaseConfigured &&
    isOnline.value,
);
const canSyncExistingUser = computed(
  () =>
    !props.isCloudBusy &&
    props.cloudMode === "cloud" &&
    props.supabaseConfigured &&
    isOnline.value,
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
	  // Only commit the username when the user explicitly approves sync.
	  emit("update:cloudUsername", draftUsername.value);
	  const password = draftPassword.value.trim();
	  emit("sync", { username: draftUsername.value, password: password || undefined });
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

function onSubmit() {
  if (canLogin.value) {
    syncNow();
    return;
  }

  if (isLoggedIn.value && canSyncExistingUser.value) {
    syncExistingUser();
  }
}
</script>

<template>
  <BasePanel :title="t('cloudSyncTitle')" :helper="t('cloudSyncHelper')">
    <div class="cloud-controls">
      <FormField
        class="cloud-mode-field"
        :label="t('cloudMode')"
        :helper="t('cloudModeHelper')"
        :style="{ '--cloud-mode-select-width': cloudModeSelectWidth }"
      >
        <FieldControl as="select">
          <select
            :value="cloudMode"
            @change="emit('update:cloudMode', ($event.target as HTMLSelectElement).value as 'offline' | 'cloud')"
          >
            <option value="offline">{{ t("cloudModeOffline") }}</option>
            <option value="cloud">{{ cloudModeLabel }}</option>
          </select>
        </FieldControl>
      </FormField>

      <form class="auth-block" :class="{ 'auth-block--disabled': cloudMode !== 'cloud' }" @submit.prevent="onSubmit">
        <FormField :label="t('cloudUsername')" reserve-helper-space>
          <FieldControl>
            <input
              :disabled="cloudMode !== 'cloud' || isLoggedIn"
              :value="draftUsername"
              autocomplete="username"
              @input="draftUsername = ($event.target as HTMLInputElement).value"
            />
          </FieldControl>
        </FormField>

        <FormField
          :label="t('cloudPassword')"
          :helper="cloudMode === 'cloud' ? (hasSavedCloudPassword ? t('cloudPasswordSaved') : t('cloudPasswordHint')) : ''"
        >
	          <FieldControl>
	            <input
	              type="password"
	              autocomplete="current-password"
	              :disabled="cloudMode !== 'cloud' || isCloudBusy || hasSavedCloudPassword"
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

      <details class="merge-rules">
        <summary class="merge-rules__summary">{{ t("cloudMergeRulesTitle") }}</summary>
        <ul class="merge-rules__list">
          <li>{{ t("cloudMergeRulePullMergePush") }}</li>
          <li>{{ t("cloudMergeRulePerDayNewestWins") }}</li>
          <li>{{ t("cloudMergeRuleDefaultsWeaker") }}</li>
          <li>{{ t("cloudMergeRuleNeverWipesLocal") }}</li>
          <li>{{ t("cloudMergeRuleAutoSync") }}</li>
          <li>{{ t("cloudMergeRulePassword") }}</li>
        </ul>
      </details>

	    <p v-if="statusText" class="status-pill">
	      {{ statusText }}
	      <span v-if="cloudLastSyncedAt" class="muted">({{ cloudLastSyncedAt }})</span>
	    </p>
	    <p v-if="cloudError" class="status-pill status-pill--error" dir="ltr">{{ cloudError }}</p>
    <p v-if="draftDiffersFromConfirmed" class="status-pill">{{ t("cloudUsernameNeedsSync") }}</p>
    <p v-if="cloudMode === 'cloud' && !hasConfirmedUser" class="status-pill">{{ t("cloudLoginPending") }}</p>
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

.cloud-mode-field {
  inline-size: min(100%, var(--cloud-mode-select-width, 30rem));
  max-inline-size: 100%;
}

.cloud-mode-field :deep(.helper-slot) {
  white-space: pre-line;
}

.cloud-actions {
  display: flex;
  align-items: end;
  gap: 8px;
}

.auth-block {
  display: grid;
  column-gap: 12px;
  row-gap: 8px;
}

.auth-block > * {
  min-inline-size: 0;
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

	.auth-block--disabled {
	  filter: grayscale(1);
	  opacity: 0.72;
	}

  .merge-rules {
    margin: 8px 0 0;
    padding: 0.35rem 0.45rem;
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    box-shadow: var(--bevel-sunken);
    color: var(--text-muted);
  }

  .merge-rules__summary {
    cursor: pointer;
    font-weight: 700;
    color: var(--pill-text);
  }

  .merge-rules__list {
    margin: 0.45rem 0 0;
    padding-inline-start: 1.1rem;
    display: grid;
    gap: 0.25rem;
    line-height: 1.35;
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
