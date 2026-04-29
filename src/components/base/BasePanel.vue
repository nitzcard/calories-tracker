<script setup lang="ts">
import PanelHeader from "./PanelHeader.vue";
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    id?: string;
    title: string;
    helper?: string;
    loading?: boolean;
    loadingTitle?: string;
    loadingHelper?: string;
    loadingOverlay?: boolean;
    collapsible?: boolean;
    defaultOpen?: boolean;
  }>(),
  {
    id: undefined,
    helper: undefined,
    loading: false,
    loadingTitle: "",
    loadingHelper: undefined,
    loadingOverlay: false,
    collapsible: false,
    defaultOpen: true,
  },
);

const isOpen = ref(props.defaultOpen);

function onToggle(event: Event) {
  isOpen.value = (event.target as HTMLDetailsElement).open;
}
</script>

<template>
  <details
    v-if="collapsible"
    :id="id"
    class="panel base-panel base-panel--collapsible"
    :open="isOpen"
    @toggle="onToggle"
  >
    <summary class="base-panel-summary">
      <PanelHeader :title="title" :helper="helper">
        <template v-if="$slots.meta" #meta>
          <slot name="meta" />
        </template>
      </PanelHeader>
    </summary>

    <div v-if="loading" class="panel-loading" role="status" aria-live="polite">
      <span class="panel-loading-spinner" aria-hidden="true"></span>
      <div class="panel-loading-copy">
        <strong>{{ loadingTitle }}</strong>
        <p v-if="loadingHelper">{{ loadingHelper }}</p>
      </div>
    </div>

    <slot v-if="!loading || loadingOverlay" />
  </details>

  <section v-else :id="id" class="panel base-panel">
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

    <slot v-if="!loading || loadingOverlay" />
  </section>
</template>

<style scoped>
.base-panel {
  display: grid;
  gap: var(--panel-gap);
  align-content: start;
}

.base-panel--collapsible {
  /* Details adds its own marker; we replace it with a consistent triangle. */
}

.base-panel-summary {
  cursor: pointer;
  list-style: none;
  position: relative;
  padding-inline-end: 2.45rem;
  padding-block-end: 0.15rem;
}

.base-panel-summary::-webkit-details-marker {
  display: none;
}

.base-panel-summary::before {
  content: "";
  position: absolute;
  inset-inline-end: 0.98rem;
  inset-block-start: 0.58rem;
  inline-size: 0.56rem;
  block-size: 0.56rem;
  border-inline-end: 2px solid var(--text-muted);
  border-block-end: 2px solid var(--text-muted);
  transform: rotate(45deg);
  transition: transform 160ms ease, border-color 160ms ease;
}

.base-panel--collapsible[open] .base-panel-summary::before {
  transform: rotate(135deg);
}

.panel-loading {
  min-block-size: 220px;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 12px;
  inline-size: min(100%, 42rem);
  justify-self: center;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-primary);
  padding: 22px 18px;
  border-radius: var(--radius);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.panel-loading-spinner {
  inline-size: 1.85rem;
  block-size: 1.85rem;
  border: 3px solid color-mix(in srgb, var(--accent) 24%, transparent);
  border-inline-end-color: var(--accent);
  border-radius: 50%;
  animation: spin 850ms linear infinite;
}

.panel-loading-copy {
  display: grid;
  gap: 6px;
  justify-items: center;
}

.panel-loading-copy strong {
  font-size: 1rem;
  line-height: 1.2;
}

.panel-loading-copy p {
  margin: 0;
  color: var(--text-muted);
  max-inline-size: 32rem;
  line-height: 1.4;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
