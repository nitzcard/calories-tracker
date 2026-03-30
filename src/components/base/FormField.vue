<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
    helper?: string;
    stacked?: boolean;
    reserveHelperSpace?: boolean;
    required?: boolean;
    requiredText?: string;
  }>(),
  {
    label: undefined,
    helper: undefined,
    stacked: false,
    reserveHelperSpace: false,
    required: false,
    requiredText: "required",
  },
);
</script>

<template>
  <label class="field" :class="{ stacked }">
    <slot name="label">
      <span v-if="label" class="field-label">
        <span>{{ label }}</span>
        <span v-if="required" class="field-required">{{ requiredText }}</span>
      </span>
    </slot>
    <slot />
    <slot name="helper">
      <small v-if="helper !== undefined || reserveHelperSpace" class="helper-text helper-slot">
        {{ helper || "\u00A0" }}
      </small>
    </slot>
  </label>
</template>

<style scoped>
.field {
  display: grid;
  gap: var(--field-gap);
  min-inline-size: 0;
}

.stacked {
  align-content: start;
}

.helper-text {
  color: var(--text-muted);
  margin: 0;
}

.field-label {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: baseline;
}

.field-required {
  padding: 0 0.28rem;
  border: 1px solid #7c2d2d;
  background: #f0c6c3;
  color: #651c1c;
  font-size: 0.84rem;
  font-weight: 800;
}

.helper-slot {
  min-block-size: 1.2rem;
  display: block;
}
</style>
