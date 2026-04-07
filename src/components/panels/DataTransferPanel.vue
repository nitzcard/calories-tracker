<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import type { AppLocale } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  isBusy: boolean;
  status: "idle" | "exported" | "imported" | "failed";
  cloudMode: "offline" | "cloud";
  cloudUsername: string;
  cloudConfirmedUsername?: string;
  cloudPassphrase?: string;
  isCloudBusy: boolean;
  cloudStatus: "idle" | "synced" | "failed";
  cloudLastSyncedAt: string;
  cloudError: string;
  supabaseConfigured: boolean;
}>();

const emit = defineEmits<{
  "export-data": [];
  "import-data": [payload: string];
  "update:cloudMode": [value: "offline" | "cloud"];
  "update:cloudUsername": [value: string];
  "update:cloudPassphrase": [value: string];
  "cloud-sync": [payload?: { passphrase?: string }];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const { t } = useI18n();
const isOnline = ref(typeof navigator === "undefined" ? true : navigator.onLine);
const draftUsername = ref(props.cloudUsername);
const draftPassphrase = ref(props.cloudPassphrase ?? "");

watch(
  () => props.cloudUsername,
  (value) => {
    draftUsername.value = value;
  },
);
watch(
  () => props.cloudPassphrase,
  (value) => {
    draftPassphrase.value = value ?? "";
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
  switch (props.status) {
    case "exported":
      return t("exportSuccess");
    case "imported":
      return t("importSuccess");
    case "failed":
      return t("importFailed");
    default:
      return "";
  }
});

const cloudStatusText = computed(() => {
  if (props.cloudStatus === "synced") return t("cloudSyncSuccess");
  if (props.cloudStatus === "failed") return t("cloudSyncFailed");
  return "";
});

const cloudUsernameNormalized = computed(() => draftUsername.value.trim().toLowerCase());
const cloudUsernameTooShort = computed(
  () => props.cloudMode === "cloud" && cloudUsernameNormalized.value.length > 0 && cloudUsernameNormalized.value.length < 3,
);
const cloudConfirmedNormalized = computed(() => (props.cloudConfirmedUsername ?? "").trim().toLowerCase());
const cloudHasConfirmedUser = computed(() => Boolean(cloudConfirmedNormalized.value));
const cloudDraftDiffersFromConfirmed = computed(
  () =>
    cloudHasConfirmedUser.value &&
    cloudUsernameNormalized.value.length > 0 &&
    cloudConfirmedNormalized.value !== cloudUsernameNormalized.value,
);

const importFormat = `interface ExportedAppData {
  schemaVersion: "1";
  exportedAt: string;
  profile: Profile[];
  dailyEntries: DailyEntry[];
  foodRules: FoodRule[];
  syncQueue: SyncQueueItem[];
  encryptedSecrets?: {
    aiKeys?: EncryptedSecretBoxV1;
  };
}

interface EncryptedSecretBoxV1 {
  v: 1;
  alg: "AES-GCM";
  kdf: "PBKDF2";
  iter: number;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
}

interface Profile {
  id: "default";
  sex: "female" | "male" | "other";
  age: number | null;
  height: number | null;
  estimatedWeight: number | null;
  bodyFat: number | null;
  tdeeEquation: "mifflinStJeor" | "harrisBenedict" | "cunningham" | "observedTdee";
  activityPrompt: string;
  foodInstructions: string;
  aiModel: string;
  locale: "en" | "he";
  themeMode: "system" | "light" | "dark" | "purple-dark";
}

interface DailyEntry {
  date: string;
  foodLogText: string;
  weight: number | null;
  manualCalories: number | null;
  nutritionSnapshot: object | null;
  aiStatus: "idle" | "pending" | "processing" | "done" | "failed";
  aiError: string | null;
  updatedAt: string;
  createdAt: string;
}

interface FoodRule {
  id: string;
  label: string;
  instructionText: string;
  active: boolean;
  createdAt: string;
}

interface SyncQueueItem {
  id?: number;
  date: string;
  status: "pending" | "processing" | "done" | "failed";
  attempts: number;
  enqueuedAt: string;
  updatedAt: string;
  provider: string;
}`;

function openPicker() {
  fileInputRef.value?.click();
}

async function handleFilePick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) {
    return;
  }

  emit("import-data", await file.text());
  (event.target as HTMLInputElement).value = "";
}

function syncToCloud() {
  // Only commit the username when user explicitly approves sync.
  emit("update:cloudUsername", draftUsername.value);
  emit("update:cloudPassphrase", draftPassphrase.value);
  emit("cloud-sync", { passphrase: draftPassphrase.value });
}
</script>

<template>
  <BasePanel :title="t('dataTools')" :helper="t('dataToolsHelper')">
    <details class="transfer-details">
      <summary class="transfer-summary">{{ t("dataToolsToggle") }}</summary>

      <div class="transfer-body">
        <div class="cloud-block">
          <strong>{{ t("cloudSyncTitle") }}</strong>
          <p class="helper-text">{{ t("cloudSyncHelper") }}</p>
          <div class="cloud-controls">
            <label class="cloud-field">
              <span class="cloud-label">{{ t("cloudMode") }}</span>
              <select
                :value="cloudMode"
                @change="
                  emit(
                    'update:cloudMode',
                    ($event.target as HTMLSelectElement).value as 'offline' | 'cloud',
                  )
                "
              >
                <option value="offline">{{ t("cloudModeOffline") }}</option>
                <option value="cloud">{{ t("cloudModeCloud") }}</option>
              </select>
            </label>

            <label class="cloud-field">
              <span class="cloud-label">{{ t("cloudUsername") }}</span>
              <input
                :value="draftUsername"
                :disabled="cloudMode !== 'cloud'"
                @input="draftUsername = ($event.target as HTMLInputElement).value"
              />
            </label>

            <label class="cloud-field cloud-passphrase">
              <span class="cloud-label">{{ t("cloudPassphrase") }}</span>
              <input
                type="password"
                autocomplete="off"
                :value="draftPassphrase"
                :disabled="cloudMode !== 'cloud'"
                :placeholder="t('cloudPassphrasePlaceholder')"
                @input="
                  draftPassphrase = ($event.target as HTMLInputElement).value;
                  emit('update:cloudPassphrase', draftPassphrase);
                "
              />
            </label>

            <button
              class="secondary-action"
              :disabled="
                isCloudBusy ||
                cloudMode !== 'cloud' ||
                cloudUsernameNormalized.length < 3 ||
                !supabaseConfigured ||
                !isOnline
              "
              @click="syncToCloud"
            >
              <span v-if="isCloudBusy" class="button-feedback" aria-hidden="true"></span>
              {{ t("cloudSyncNow") }}
            </button>
          </div>
          <p v-if="cloudStatusText" class="status-line">
            {{ cloudStatusText }}
            <span v-if="cloudLastSyncedAt" class="muted">({{ cloudLastSyncedAt }})</span>
          </p>
          <p v-if="cloudMode === 'cloud' && !draftPassphrase.trim()" class="status-line">
            {{ t("cloudPassphraseHint") }}
          </p>
          <p v-if="cloudError" class="status-line">{{ cloudError }}</p>
          <p v-if="cloudDraftDiffersFromConfirmed" class="status-line">
            {{ t("cloudUsernameNeedsSync") }}
          </p>
          <p v-if="cloudMode === 'cloud' && !draftUsername.trim()" class="status-line">
            {{ t("cloudUsernameMissing") }}
          </p>
          <p v-else-if="cloudUsernameTooShort" class="status-line">
            {{ t("cloudUsernameTooShort", { min: 3 }) }}
          </p>
          <p v-if="cloudMode === 'cloud' && !supabaseConfigured" class="status-line">
            {{ t("cloudSupabaseMissing") }}
          </p>
        </div>

        <div class="actions-row">
          <button class="secondary-action" :disabled="isBusy" @click="emit('export-data')">
            {{ t("exportData") }}
          </button>
          <button class="secondary-action" :disabled="isBusy" @click="openPicker">
            {{ t("importData") }}
          </button>
          <input
            ref="fileInputRef"
            class="hidden-input"
            type="file"
            accept="application/json,.json"
            @change="handleFilePick"
          />
        </div>

        <p v-if="statusText" class="status-line">{{ statusText }}</p>

        <div class="format-block">
          <strong>{{ t("importFormatTitle") }}</strong>
          <pre class="format-code" dir="ltr"><code>{{ importFormat }}</code></pre>
        </div>
      </div>
    </details>
  </BasePanel>
</template>

<style scoped>
.transfer-details {
  margin-block-start: 10px;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  box-shadow: var(--bevel-sunken);
}

.transfer-summary {
  cursor: pointer;
  padding: 8px;
  color: var(--text-muted);
  font-weight: 600;
}

	.transfer-body {
	  display: grid;
	  gap: 0;
	  padding: 0 8px 8px;
	}

	.cloud-block {
	  display: grid;
	  gap: 6px;
	  padding: 8px;
	  border: 1px solid var(--border);
	  background: var(--surface-2);
	  box-shadow: var(--bevel-sunken);
	  margin-block-start: 10px;
	}

	.cloud-controls {
	  display: flex;
	  flex-wrap: wrap;
	  align-items: end;
	  gap: 8px;
	}

	.cloud-field {
	  display: grid;
	  gap: 3px;
	}

  .cloud-passphrase {
    min-inline-size: 16rem;
    flex: 1;
  }

	.cloud-label {
	  color: var(--text-muted);
	  font-size: 0.85rem;
	}

	.actions-row {
	  display: flex;
	  gap: 8px;
	  flex-wrap: wrap;
	  margin-block-start: 10px;
	}

.hidden-input {
  display: none;
}

.status-line {
  margin: 8px 0 0;
  color: var(--text-muted);
}

.format-block {
  display: grid;
  gap: 6px;
  margin-block-start: 10px;
}

.format-code {
  margin: 0;
  padding: 8px;
  overflow-x: auto;
  border: 1px solid var(--border);
  background: var(--surface-2);
  box-shadow: var(--bevel-sunken);
  font-size: 0.85rem;
  line-height: 1.35;
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
