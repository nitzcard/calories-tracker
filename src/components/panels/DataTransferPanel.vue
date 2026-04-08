<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import type { AppLocale } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  isBusy: boolean;
  status: "idle" | "exported" | "imported" | "failed";
}>();

const emit = defineEmits<{
  "export-data": [];
  "import-data": [payload: string];
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
  age: number | null;
  height: number | null;
  estimatedWeight: number | null;
  bodyFat: number | null;
  tdeeEquation: "mifflinStJeor" | "harrisBenedict" | "cunningham" | "observedTdee";
  activityPrompt: string;
  foodInstructions: string;
  aiModel: string;
  locale: "en" | "he";
  themeMode:
    | "system"
    | "light"
    | "dark"
    | "purple-dark"
    | "counter-strike"
    | "nord-dark"
    | "solarized-dark";
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
