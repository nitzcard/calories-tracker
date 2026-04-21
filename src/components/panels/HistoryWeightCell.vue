<script setup lang="ts">
import { computed, ref, watch } from "vue";
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

const draft = ref("");

const placeholder = computed(() =>
  props.fallbackValue != null ? String(props.fallbackValue) : "-",
);

watch(
  () => props.value,
  (next) => {
    draft.value = next != null ? String(next) : "";
  },
  { immediate: true },
);

function emitSave() {
  const trimmed = draft.value.trim();
  if (!trimmed) {
    emit("save", null);
    return;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return;
  }

  emit("save", parsed);
}
</script>

<template>
  <FieldControl as="input" :is-saving="isSaving">
    <input
      type="number"
      inputmode="decimal"
      step="0.1"
      min="0"
      dir="ltr"
      :value="draft"
      :placeholder="placeholder"
      :data-testid="inputTestId"
      @input="draft = ($event.target as HTMLInputElement).value"
      @blur="emitSave"
      @keydown.enter.prevent="emitSave"
    />
  </FieldControl>
</template>
