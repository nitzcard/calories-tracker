<script setup lang="ts">
import PanelHeader from "./PanelHeader.vue";
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    id?: string;
    title: string;
    helper?: string;
    loading?: boolean;
    loadingTitle?: string;
    loadingHelper?: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
  }>(),
  {
    id: undefined,
    helper: undefined,
    loading: false,
    loadingTitle: "",
    loadingHelper: undefined,
    collapsible: false,
    defaultOpen: true,
  },
);

const isOpen = ref(props.defaultOpen);
const storageKey = computed(() =>
  props.collapsible && props.id ? `panel.open.${props.id}` : null,
);

// Initialize from persisted state (if available).
if (storageKey.value) {
  try {
    const raw = localStorage.getItem(storageKey.value);
    if (raw === "0" || raw === "1") {
      isOpen.value = raw === "1";
    }
  } catch {
    // Ignore environments where localStorage is unavailable.
  }
}

function onToggle(event: Event) {
  isOpen.value = (event.target as HTMLDetailsElement).open;
  if (storageKey.value) {
    try {
      localStorage.setItem(storageKey.value, isOpen.value ? "1" : "0");
    } catch {
      // Ignore write errors.
    }
  }
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

    <slot v-else />
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

    <slot v-else />
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
  padding-inline-end: 1.5rem;
}

.base-panel-summary::-webkit-details-marker {
  display: none;
}

.base-panel-summary::before {
  content: "";
  position: absolute;
  inset-inline-end: 0.2rem;
  inset-block-start: 0.35rem;
  inline-size: 0;
  block-size: 0;
  border-style: solid;
  border-width: 6px 0 6px 9px;
  border-color: transparent transparent transparent var(--text-muted);
}

.base-panel--collapsible[open] .base-panel-summary::before {
  transform: rotate(90deg);
  transform-origin: 35% 50%;
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
