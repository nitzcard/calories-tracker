<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import type { AppLocale } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  isBusy: boolean;
  status: "idle" | "exported" | "imported" | "failed";
  autoBackupAfterAnalyze: boolean;
}>();

const emit = defineEmits<{
  "export-data": [];
  "import-data": [payload: string];
  "update:auto-backup-after-analyze": [value: boolean];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const { t } = useI18n();

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

const importFormat = `interface ExportedAppData {
  schemaVersion: "1";
  exportedAt: string;
  profile: Profile[];
  dailyEntries: DailyEntry[];
  foodRules: FoodRule[];
  syncQueue: SyncQueueItem[];
  encryptedSecrets?: object;
}

interface Profile {
  id: "default";
  sex: "female" | "male" | "other";
  email?: string;
  age: number | null;
  height: number | null;
  estimatedWeight: number | null;
  targetWeight: number | null;
  bodyFat: number | null;
  goalMode: "cut" | "leanMass" | "maingain";
  tdeeEquation: "mifflinStJeor" | "harrisBenedict" | "cunningham" | "observedTdee";
  activityFactor: "sedentary" | "light" | "moderate" | "veryActive";
  activityPrompt: string;
  foodInstructions: string;
  aiModel: string;
  locale: "en" | "he";
  themeMode:
    | "system"
    | "light"
    | "dark"
    | "purple-dark"
    | "jasmine"
    | "cs16"
    | "steam"
    | "cyberpunk-2077";
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
</script>

<template>
  <BasePanel :title="t('dataTools')" :helper="t('dataToolsHelper')">
    <details class="transfer-details">
      <summary class="transfer-summary">{{ t("dataToolsToggle") }}</summary>

      <div class="transfer-body">
        <label class="backup-toggle">
          <input
            type="checkbox"
            :checked="autoBackupAfterAnalyze"
            @change="emit('update:auto-backup-after-analyze', ($event.target as HTMLInputElement).checked)"
          />
          <span class="backup-toggle__copy">
            <strong>{{ t("autoBackupAfterAnalyze") }}</strong>
            <small>{{ t("autoBackupAfterAnalyzeHelper") }}</small>
          </span>
        </label>

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

.backup-toggle {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.65rem;
  align-items: start;
  margin-block-start: 10px;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 78%, var(--surface-2) 22%);
  box-shadow: var(--bevel-raised);
}

.backup-toggle input {
  margin-block-start: 0.15rem;
}

.backup-toggle__copy {
  display: grid;
  gap: 0.15rem;
}

.backup-toggle__copy strong {
  line-height: 1.2;
}

.backup-toggle__copy small {
  color: var(--text-muted);
  line-height: 1.35;
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
