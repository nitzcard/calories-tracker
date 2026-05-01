<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";

const props = defineProps<{
  isBusy: boolean;
  canRestore: boolean;
}>();

const emit = defineEmits<{
  download: [];
  restore: [file: File];
}>();

const { t } = useI18n();
const fileInput = ref<HTMLInputElement | null>(null);

function openFilePicker() {
  if (!props.canRestore || props.isBusy) {
    return;
  }
  fileInput.value?.click();
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  emit("restore", file);
  input.value = "";
}
</script>

<template>
  <BasePanel id="backupPanel" :title="t('backupTitle')" :helper="t('backupHelper')">
    <div class="backup-panel">
      <p class="backup-panel__copy">{{ t("backupFormatHint") }}</p>
      <p class="backup-panel__notice">{{ t("backupPrivateNotice") }}</p>
      <p class="backup-panel__notice">{{ t("backupReplaceNotice") }}</p>

      <div class="backup-panel__actions">
        <button type="button" class="secondary-action" :disabled="isBusy" @click="emit('download')">
          {{ t("backupDownload") }}
        </button>
        <button
          type="button"
          class="secondary-action"
          :disabled="isBusy || !canRestore"
          @click="openFilePicker"
        >
          {{ t("backupRestore") }}
        </button>
      </div>

      <input
        ref="fileInput"
        class="backup-panel__file-input"
        type="file"
        accept="application/json,.json"
        @change="onFileChange"
      />
    </div>
  </BasePanel>
</template>

<style scoped>
.backup-panel {
  display: grid;
  gap: 0.85rem;
}

.backup-panel__copy,
.backup-panel__notice {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.5;
}

.backup-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.backup-panel__file-input {
  display: none;
}
</style>
