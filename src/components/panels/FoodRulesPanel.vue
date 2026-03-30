<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import FieldControl from "../base/FieldControl.vue";
import FormField from "../base/FormField.vue";
import type { AppLocale } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  instructions: string;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  "save-instructions": [instructions: string];
}>();

const draftInstructions = ref(props.instructions);
const { t } = useI18n();

watch(
  () => props.instructions,
  (next) => {
    draftInstructions.value = next;
  },
);

function updateDraft(event: Event) {
  draftInstructions.value = (event.target as HTMLTextAreaElement).value;
}
</script>

<template>
  <BasePanel
    id="foodRulesPanel"
    :title="t('foodRules')"
    :helper="t('foodRulesHelper')"
  >
    <FormField
      :label="t('ruleInstruction')"
      :helper="t('fieldAutosaveOnBlur')"
      stacked
      class="field-spacing"
    >
      <FieldControl as="textarea" :is-saving="isSaving">
        <textarea
          class="constant-textarea"
          :value="draftInstructions"
          @input="updateDraft"
          @blur="emit('save-instructions', draftInstructions)"
        ></textarea>
      </FieldControl>
    </FormField>
    <p class="helper-text helper-text--after">{{ t("addRuleHelper") }}</p>
  </BasePanel>
</template>

<style scoped>
.helper-text {
  color: var(--text-muted);
  margin: 0;
}

.helper-text--after {
  margin-block-start: 8px;
}

.field-spacing {
  margin-block-start: 10px;
}

.constant-textarea {
  block-size: 12rem;
  min-block-size: 12rem;
}
</style>
