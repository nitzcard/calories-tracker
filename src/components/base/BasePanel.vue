<script setup lang="ts">
import PanelHeader from "./PanelHeader.vue";

withDefaults(
  defineProps<{
    id?: string;
    title: string;
    helper?: string;
    loading?: boolean;
    loadingTitle?: string;
    loadingHelper?: string;
  }>(),
  {
    id: undefined,
    helper: undefined,
    loading: false,
    loadingTitle: "",
    loadingHelper: undefined,
  },
);
</script>

<template>
  <section :id="id" class="panel base-panel">
    <PanelHeader :title="title" :helper="helper">
      <template v-if="$slots.meta" #meta>
        <slot name="meta" />
      </template>
    </PanelHeader>

    <div v-if="loading" class="panel-loading" role="status" aria-live="polite">
      <span class="panel-loading-spinner" aria-hidden="true"></span>
      <div class="panel-loading-copy">
        <strong>{{ loadingTitle }}</strong>
        <p v-if="loadingHelper">{{ loadingHelper }}</p>
      </div>
    </div>

    <slot v-else />
  </section>
</template>

<style scoped>
.base-panel {
  display: grid;
  gap: var(--panel-gap);
  align-content: start;
}

.panel-loading {
  min-block-size: 220px;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 10px;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  padding: 16px;
  box-shadow: var(--bevel-sunken);
}

.panel-loading-spinner {
  inline-size: 1.7rem;
  block-size: 1.7rem;
  border: 3px solid currentColor;
  border-inline-end-color: transparent;
  border-radius: 50%;
  animation: spin 650ms linear infinite;
}

.panel-loading-copy {
  display: grid;
  gap: 4px;
  justify-items: center;
}

.panel-loading-copy p {
  margin: 0;
  color: var(--text-muted);
  max-inline-size: 38rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
