<script setup lang="ts">
import { computed } from "vue";
import DraftNumberInput from "../base/DraftNumberInput.vue";
import FieldControl from "../base/FieldControl.vue";

const props = defineProps<{
  value: number | null;
  fallbackValue: number | null;
  isSaving: boolean;
  inputTestId?: string;
}>();

const emit = defineEmits<{
  save: [weight: number | null];
}>();

const placeholder = computed(() =>
  props.fallbackValue != null ? String(props.fallbackValue) : "-",
);
</script>

<template>
  <FieldControl as="input" :is-saving="isSaving">
    <DraftNumberInput
      :value="value"
      parse-mode="positive"
      step="0.1"
      min="0"
      :placeholder="placeholder"
      :data-testid="inputTestId"
      @commit="emit('save', $event)"
    />
  </FieldControl>
</template>
