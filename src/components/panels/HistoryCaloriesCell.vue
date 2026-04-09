<script setup lang="ts">
import { computed, ref, watch } from "vue";
import FieldControl from "../base/FieldControl.vue";

const props = defineProps<{
  value: number | null;
  fallbackValue: number | null;
  isSaving: boolean;
  useFallbackAsValue?: boolean;
}>();

const emit = defineEmits<{
  save: [calories: number | null];
}>();

const draft = ref("");

const displayValue = computed(() =>
  props.value ?? (props.useFallbackAsValue === false ? null : props.fallbackValue),
);
const placeholder = computed(() =>
  props.fallbackValue != null ? String(props.fallbackValue) : "-",
);

watch(
  displayValue,
  (next) => {
    draft.value = next != null ? String(next) : "";
  },
  { immediate: true },
);

function emitSave() {
  const trimmed = draft.value.trim();
  const nextValue = trimmed ? Number(trimmed) : null;
  if (trimmed && Number.isNaN(nextValue)) {
    return;
  }

  emit("save", nextValue);
}
</script>

<template>
  <FieldControl as="input" :is-saving="isSaving">
    <input
      type="number"
      inputmode="decimal"
      :value="draft"
      :placeholder="placeholder"
      @input="draft = ($event.target as HTMLInputElement).value"
      @blur="emitSave"
      @keydown.enter.prevent="emitSave"
    />
  </FieldControl>
</template>
