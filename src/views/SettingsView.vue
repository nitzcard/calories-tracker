<script setup lang="ts">
import ApiKeysPanel from "../components/panels/ApiKeysPanel.vue";
import BackupPanel from "../components/panels/BackupPanel.vue";
import ProfilePanel from "../components/panels/ProfilePanel.vue";
import TdeeSummaryPanel from "../components/panels/TdeeSummaryPanel.vue";
import type { AppLocale, Profile, TdeeSnapshot } from "../types";
import type { StoredAiKeys } from "../ai/credentials";

defineProps<{
  locale: AppLocale;
  profile: Profile;
  estimatedLeanWeight: number | null;
  tdee: TdeeSnapshot;
  isSavingTdeeEquation: boolean;
  isCloudBusy: boolean;
  canRestoreBackup: boolean;
  keys: StoredAiKeys;
  savingAiKeyField: keyof StoredAiKeys | "";
  tdeeHighlightToken: number;
}>();

const emit = defineEmits<{
  "update:profile": [profile: Profile];
  "save-profile": [profile: Profile];
  "select-equation": [value: Profile["tdeeEquation"]];
  "save-ai-key": [provider: keyof StoredAiKeys, value: string];
  "download-backup": [];
  "restore-backup": [file: File];
}>();

</script>

<template>
  <section class="settings-board">
    <div class="settings-column settings-column--profile">
      <ProfilePanel
        :locale="locale"
        :profile="profile"
        :estimated-lean-weight="estimatedLeanWeight"
        @update:profile="emit('update:profile', $event)"
        @save="emit('save-profile', $event)"
      />

      <ApiKeysPanel
        :locale="locale"
        :keys="keys"
        :saving-field="savingAiKeyField"
        @save="(...args) => emit('save-ai-key', ...args)"
      />
    </div>

    <div class="settings-column settings-column--account">
      <TdeeSummaryPanel
        :locale="locale"
        :tdee="tdee"
        :selected-equation="profile.tdeeEquation"
        :highlight-token="tdeeHighlightToken"
        :is-updating="isSavingTdeeEquation"
        @select-equation="emit('select-equation', $event)"
      />

      <BackupPanel
        :is-busy="isCloudBusy"
        :can-restore="canRestoreBackup"
        @download="emit('download-backup')"
        @restore="emit('restore-backup', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.settings-board {
  display: grid;
  grid-template-columns: minmax(0, 0.96fr) minmax(22rem, 1.04fr);
  gap: 1rem;
  align-items: start;
}

.settings-column {
  display: grid;
  gap: 1rem;
  align-items: start;
  min-inline-size: 0;
}

.settings-column :deep(.panel) {
  inline-size: 100%;
}

@media (max-width: 980px) {
  .settings-board {
    grid-template-columns: 1fr;
  }
}
</style>
