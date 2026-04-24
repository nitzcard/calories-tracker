<script setup lang="ts">
withDefaults(
  defineProps<{
    isSaving?: boolean;
    as?: "input" | "select" | "textarea";
  }>(),
  {
    isSaving: false,
    as: "input",
  },
);
</script>

<template>
  <div
    class="field-control"
    :class="[
      `field-control--${as}`,
      {
        'is-saving': isSaving,
        'has-spinner': isSaving,
      },
    ]"
  >
    <slot />
    <span v-if="isSaving" class="field-spinner" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.field-control {
  position: relative;
  inline-size: 100%;
  min-inline-size: 0;
}

.field-control :deep(input),
.field-control :deep(select),
.field-control :deep(textarea) {
  min-inline-size: 0;
}

.field-control :deep(input) {
  inline-size: min(100%, var(--field-input-inline-size, var(--text-control-inline-size)));
  max-inline-size: var(--field-input-inline-size, var(--text-control-inline-size));
}

.field-control :deep(textarea) {
  inline-size: 100%;
  max-inline-size: 100%;
}

.field-control :deep(select) {
  inline-size: min(100%, var(--field-select-inline-size, var(--select-control-inline-size, 80%)));
  max-inline-size: 100%;
}

.field-control--input .field-spinner,
.field-control--select .field-spinner {
  inset-block-start: 50%;
  margin-block-start: -0.4rem;
}

.field-control--textarea .field-spinner {
  inset-block-start: 12px;
}

.field-spinner {
  position: absolute;
  inset-inline-end: 10px;
  inline-size: 0.8rem;
  block-size: 0.8rem;
  border: 1px solid currentColor;
  border-inline-end-color: transparent;
  border-radius: 50%;
  opacity: 0.8;
  animation: spin 650ms linear infinite;
}

.field-control.is-saving :deep(input),
.field-control.is-saving :deep(select),
.field-control.is-saving :deep(textarea) {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--surface) 60%, var(--panel));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
