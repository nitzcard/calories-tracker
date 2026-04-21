<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import FieldControl from "../base/FieldControl.vue";
import FormField from "../base/FormField.vue";
import type { AppLocale } from "../../types";
import type { StoredAiKeys } from "../../ai/credentials";

const props = defineProps<{
  locale: AppLocale;
  keys: StoredAiKeys;
  savingField: keyof StoredAiKeys | "";
}>();

const emit = defineEmits<{
  save: [provider: keyof StoredAiKeys, value: string];
}>();

const keys = reactive<StoredAiKeys>({ ...props.keys });
const isRequired = computed(() => !keys.gemini.trim());
const { t } = useI18n();

watch(
  () => props.keys,
  (next) => {
    Object.assign(keys, next);
  },
  { deep: true },
);

function updateDraft(provider: keyof StoredAiKeys, value: string) {
  keys[provider] = value;
}

function emitSave(provider: keyof StoredAiKeys) {
  emit("save", provider, keys[provider]);
}
</script>

<template>
  <BasePanel :title="t('apiKeys')" :helper="t('apiKeysHelper')">
    <template #meta>
      <span v-if="isRequired" class="required-pill">{{ t("requiredNow") }}</span>
    </template>

    <div class="keys-grid">
      <FormField
        :label="t('geminiKey')"
        :helper="t('fieldAutosaveOnBlur')"
        required
        :required-text="t('requiredNow')"
      >
        <FieldControl :is-saving="savingField === 'gemini'">
          <input
            :class="{ 'is-missing': !keys.gemini.trim() }"
            type="password"
            :value="keys.gemini"
            :placeholder="t('byokPlaceholder')"
            @input="updateDraft('gemini', ($event.target as HTMLInputElement).value)"
            @blur="emitSave('gemini')"
          />
        </FieldControl>
      </FormField>
    </div>

    <div class="helper-links helper-links--after">
      <a
        class="helper-link"
        href="https://en.wikipedia.org/wiki/Bring_your_own_encryption"
        target="_blank"
        rel="noreferrer"
      >
        {{ t("byokExplainLink") }}
      </a>
      <a
        v-if="!keys.gemini"
        class="helper-link"
        href="https://ai.google.dev/gemini-api/docs/api-key"
        target="_blank"
        rel="noreferrer"
      >
        {{ t("getGeminiKey") }}
      </a>
    </div>
  </BasePanel>
</template>

<style scoped>
.keys-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
  margin-block-start: 10px;
}

.helper-text {
  color: var(--text-muted);
  margin: 0;
}

.helper-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.helper-links--after {
  margin-block-start: 8px;
}

.helper-link {
  color: var(--text-muted);
}

.keys-grid :deep(input) {
  max-inline-size: none;
}
</style>
