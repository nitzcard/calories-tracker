<script setup lang="ts">
import { computed } from "vue";
import DraftNumberInput from "../base/DraftNumberInput.vue";
import FieldControl from "../base/FieldControl.vue";

const props = defineProps<{
  value: number | null;
  fallbackValue: number | null;
  isSaving: boolean;
  useFallbackAsValue?: boolean;
  inputTestId?: string;
}>();

const emit = defineEmits<{
  save: [calories: number | null];
}>();

const displayValue = computed(() =>
  props.value ?? (props.useFallbackAsValue === false ? null : props.fallbackValue),
);
const placeholder = computed(() =>
  props.fallbackValue != null ? String(props.fallbackValue) : "-",
);
</script>

<template>
  <FieldControl as="input" :is-saving="isSaving">
    <DraftNumberInput
      :value="displayValue"
      parse-mode="nonnegative"
      :placeholder="placeholder"
      :data-testid="inputTestId"
      @commit="emit('save', $event)"
    />
  </FieldControl>
</template>
