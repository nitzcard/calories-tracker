<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

type ParseMode = "nullable" | "positive" | "nonnegative";

const props = withDefaults(
  defineProps<{
    value: number | null | undefined;
    parseMode?: ParseMode;
    placeholder?: string;
    inputmode?: "text" | "search" | "email" | "numeric" | "tel" | "url" | "none" | "decimal";
    step?: string;
    min?: string;
    max?: string;
    disabled?: boolean;
    dataTestId?: string;
    commitOnIdleMs?: number | null;
    dir?: "ltr" | "rtl" | "auto";
  }>(),
  {
    parseMode: "nullable",
    placeholder: "",
    inputmode: "decimal",
    step: undefined,
    min: undefined,
    max: undefined,
    disabled: false,
    dataTestId: undefined,
    commitOnIdleMs: null,
    dir: "ltr",
  },
);

const emit = defineEmits<{
  commit: [value: number | null];
  "update:draft": [value: string];
}>();

const draft = ref("");
const isFocused = ref(false);
let idleCommitTimer: ReturnType<typeof setTimeout> | null = null;

const normalizedValue = computed(() => {
  const next = props.value;
  return typeof next === "number" && Number.isFinite(next) ? String(next) : "";
});

watch(
  normalizedValue,
  (next) => {
    if (!isFocused.value) {
      draft.value = next;
    }
  },
  { immediate: true },
);

function clearIdleCommitTimer() {
  if (!idleCommitTimer) {
    return;
  }

  clearTimeout(idleCommitTimer);
  idleCommitTimer = null;
}

function parseDraft(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  if (props.parseMode === "positive" && parsed <= 0) {
    return undefined;
  }

  if (props.parseMode === "nonnegative" && parsed < 0) {
    return undefined;
  }

  return parsed;
}

function commitDraft(options?: { blur?: boolean }) {
  clearIdleCommitTimer();
  const parsed = parseDraft(draft.value);
  if (parsed === undefined) {
    if (options?.blur) {
      draft.value = normalizedValue.value;
    }
    return;
  }

  emit("commit", parsed);

  if (options?.blur) {
    draft.value = parsed == null ? "" : String(parsed);
  }
}

function scheduleIdleCommit() {
  clearIdleCommitTimer();
  if (!props.commitOnIdleMs || props.commitOnIdleMs <= 0) {
    return;
  }

  idleCommitTimer = setTimeout(() => {
    commitDraft();
  }, props.commitOnIdleMs);
}

function onInput(event: Event) {
  draft.value = (event.target as HTMLInputElement).value;
  emit("update:draft", draft.value);
  scheduleIdleCommit();
}

function onFocus() {
  isFocused.value = true;
}

function onBlur() {
  isFocused.value = false;
  commitDraft({ blur: true });
}

onBeforeUnmount(() => {
  clearIdleCommitTimer();
});
</script>

<template>
  <input
    type="number"
    :value="draft"
    :placeholder="placeholder"
    :inputmode="inputmode"
    :step="step"
    :min="min"
    :max="max"
    :disabled="disabled"
    :data-testid="dataTestId"
    :dir="dir"
    @focus="onFocus"
    @input="onInput"
    @blur="onBlur"
    @keydown.enter.prevent="commitDraft({ blur: true })"
  />
</template>
