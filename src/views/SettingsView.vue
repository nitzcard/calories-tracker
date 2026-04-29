<script setup lang="ts">
import { useI18n } from "vue-i18n";
import BasePanel from "../components/base/BasePanel.vue";
import FieldControl from "../components/base/FieldControl.vue";
import FormField from "../components/base/FormField.vue";
import ApiKeysPanel from "../components/panels/ApiKeysPanel.vue";
import CloudSyncPanel from "../components/panels/CloudSyncPanel.vue";
import FoodRulesPanel from "../components/panels/FoodRulesPanel.vue";
import ProfilePanel from "../components/panels/ProfilePanel.vue";
import TdeeSummaryPanel from "../components/panels/TdeeSummaryPanel.vue";
import type { AppLocale, Profile, TdeeSnapshot, ThemePreference } from "../types";
import type { StoredAiKeys } from "../ai/credentials";

defineProps<{
  locale: AppLocale;
  themePreference: ThemePreference;
  profile: Profile;
  estimatedLeanWeight: number | null;
  tdee: TdeeSnapshot;
  isSavingLocale: boolean;
  isSavingTdeeEquation: boolean;
  isSavingFoodInstructions: boolean;
  keys: StoredAiKeys;
  savingAiKeyField: keyof StoredAiKeys | "";
  cloudUsername: string;
  cloudConfirmedUsername: string;
  hasSavedCloudPassword: boolean;
  isCloudBusy: boolean;
  cloudStatus: "idle" | "synced" | "failed";
  cloudLastSyncedAt: string;
  cloudError: string;
  supabaseConfigured: boolean;
  tdeeHighlightToken: number;
}>();

const emit = defineEmits<{
  "locale-change": [locale: AppLocale];
  "theme-change": [theme: ThemePreference];
  "update:profile": [profile: Profile];
  "save-profile": [profile: Profile];
  "select-equation": [value: Profile["tdeeEquation"]];
  "save-instructions": [value: string];
  "save-ai-key": [provider: keyof StoredAiKeys, value: string];
  "update:cloud-username": [value: string];
  sync: [payload: { username: string; password?: string }];
  logout: [];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="route-stack">
    <div class="settings-grid settings-grid--top">
      <BasePanel :title="t('appearanceSettings')" :helper="t('appearanceSettingsHelper')">
        <div class="pref-grid">
          <FormField :label="t('language')">
            <FieldControl as="select" :is-saving="isSavingLocale">
              <select
                :value="locale"
                data-testid="settings-locale"
                @change="emit('locale-change', ($event.target as HTMLSelectElement).value as AppLocale)"
              >
                <option value="en">English</option>
                <option value="he">עברית</option>
              </select>
            </FieldControl>
          </FormField>

          <FormField :label="t('themeLabel')">
            <FieldControl as="select">
              <select
                :value="themePreference"
                data-testid="settings-theme"
                @change="emit('theme-change', ($event.target as HTMLSelectElement).value as ThemePreference)"
              >
                <option value="system">{{ t("themeSystem") }}</option>
                <option value="light">{{ t("themeLight") }}</option>
                <option value="dark">{{ t("themeDark") }}</option>
              </select>
            </FieldControl>
          </FormField>
        </div>
      </BasePanel>

      <CloudSyncPanel
        :locale="locale"
        :profile="profile"
        :cloud-username="cloudUsername"
        :cloud-confirmed-username="cloudConfirmedUsername"
        :has-saved-cloud-password="hasSavedCloudPassword"
        :is-cloud-busy="isCloudBusy"
        :cloud-status="cloudStatus"
        :cloud-last-synced-at="cloudLastSyncedAt"
        :cloud-error="cloudError"
        :supabase-configured="supabaseConfigured"
        @update:profile="emit('update:profile', $event)"
        @save="emit('save-profile', $event)"
        @update:cloud-username="emit('update:cloud-username', $event)"
        @sync="emit('sync', $event)"
        @logout="emit('logout')"
      />
    </div>

    <div class="settings-grid">
      <ProfilePanel
        :locale="locale"
        :profile="profile"
        :estimated-lean-weight="estimatedLeanWeight"
        @update:profile="emit('update:profile', $event)"
        @save="emit('save-profile', $event)"
      />

      <TdeeSummaryPanel
        :locale="locale"
        :tdee="tdee"
        :selected-equation="profile.tdeeEquation"
        :highlight-token="tdeeHighlightToken"
        :is-updating="isSavingTdeeEquation"
        @select-equation="emit('select-equation', $event)"
      />
    </div>

    <div class="settings-grid">
      <FoodRulesPanel
        :locale="locale"
        :instructions="profile.foodInstructions"
        :is-saving="isSavingFoodInstructions"
        @save-instructions="emit('save-instructions', $event)"
      />

      <ApiKeysPanel
        :locale="locale"
        :keys="keys"
        :saving-field="savingAiKeyField"
        @save="(...args) => emit('save-ai-key', ...args)"
      />
    </div>
  </section>
</template>

<style scoped>
.route-stack {
  display: grid;
  gap: 1rem;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  align-items: start;
}

.settings-grid--top {
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
}

.pref-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

@media (max-width: 980px) {
  .settings-grid,
  .settings-grid--top,
  .pref-grid {
    grid-template-columns: 1fr;
  }
}
</style>
