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

    <p v-if="!keys.gemini" class="helper-text helper-text--after">
      <a href="https://ai.google.dev/gemini-api/docs/api-key" target="_blank" rel="noreferrer">
        {{ t("getGeminiKey") }}
      </a>
    </p>
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

.helper-text--after {
  margin-block-start: 8px;
}

.keys-grid :deep(input) {
  max-inline-size: none;
}

.required-pill {
  display: inline-block;
  padding: 0.12rem 0.42rem;
  border: 1px solid #7c2d2d;
  background: #f0c6c3;
  color: #651c1c;
  font-size: 0.88rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  box-shadow: var(--bevel-raised);
  white-space: nowrap;
}

.keys-grid :deep(input.is-missing) {
  border-color: #8f3333;
  box-shadow: 0 0 0 1px rgba(143, 51, 51, 0.35);
}
</style>
