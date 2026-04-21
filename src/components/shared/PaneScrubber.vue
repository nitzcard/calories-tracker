<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{
  panes: Array<{ id: string; label: string; icon?: "diary" | "summary" | "graphs" | "history" }>;
  ariaLabel?: string;
}>();

const activePaneId = ref(props.panes[0]?.id ?? "");
const railRef = ref<HTMLElement | null>(null);

let observer: IntersectionObserver | null = null;

function scrollToPane(id: string) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }

  activePaneId.value = id;
  element.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
}

function updateFromTouch(clientX: number) {
  const rail = railRef.value;
  if (!rail || !props.panes.length) {
    return;
  }

  const buttons = Array.from(rail.querySelectorAll<HTMLButtonElement>(".pane-scrubber__dot"));
  if (!buttons.length) {
    return;
  }

  const nearest = buttons
    .map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        id: button.dataset.paneId ?? "",
        distance: Math.abs(clientX - (rect.left + rect.width / 2)),
      };
    })
    .sort((left, right) => left.distance - right.distance)[0];

  if (nearest?.id && nearest.id !== activePaneId.value) {
    scrollToPane(nearest.id);
  }
}

function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0];
  if (touch) {
    updateFromTouch(touch.clientX);
  }
}

function onTouchMove(event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) {
    return;
  }

  event.preventDefault();
  updateFromTouch(touch.clientX);
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      const id = visible?.target.getAttribute("id");
      if (id) {
        activePaneId.value = id;
      }
    },
    {
      rootMargin: "-20% 0px -55% 0px",
      threshold: [0.15, 0.35, 0.6],
    },
  );

  for (const pane of props.panes) {
    const element = document.getElementById(pane.id);
    if (element) {
      observer.observe(element);
    }
  }
});

onUnmounted(() => {
  observer?.disconnect();
  observer = null;
});

function iconPath(icon: "diary" | "summary" | "graphs" | "history" | undefined) {
  if (icon === "diary") {
    return "M6 3h10a2 2 0 0 1 2 2v14H8a2 2 0 0 0-2 2V3Zm0 0a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2m4 4h6M10 11h6M10 15h4";
  }
  if (icon === "summary") {
    return "M4 19h16M7 15l3-3 3 2 4-5M6 6h12";
  }
  if (icon === "history") {
    return "M4 12a8 8 0 1 0 3-6.3M4 4v4h4m4-1v5l3 2";
  }
  if (icon === "graphs") {
    return "M4 19h16M7 15v-4m5 4V7m5 8v-6";
  }
  return "M5 12h14";
}
</script>

<template>
  <nav
    ref="railRef"
    class="pane-scrubber"
    :aria-label="ariaLabel || 'Pane navigation'"
    @touchstart.passive="onTouchStart"
    @touchmove="onTouchMove"
  >
    <button
      v-for="pane in panes"
      :key="pane.id"
      :data-pane-id="pane.id"
      class="pane-scrubber__dot"
      :class="{ 'is-active': pane.id === activePaneId }"
      type="button"
      :aria-label="pane.label"
      :title="pane.label"
      @click="scrollToPane(pane.id)"
    >
      <span class="pane-scrubber__icon-wrap" aria-hidden="true">
        <svg class="pane-scrubber__icon" viewBox="0 0 24 24" fill="none">
          <path :d="iconPath(pane.icon)" />
        </svg>
      </span>
      <span class="pane-scrubber__label">{{ pane.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.pane-scrubber {
  position: fixed;
  inset-inline: max(0.75rem, env(safe-area-inset-left)) max(0.75rem, env(safe-area-inset-right));
  inset-block-end: calc(0.35rem + env(safe-area-inset-bottom));
  z-index: 45;
  display: none;
  grid-auto-flow: column;
  justify-content: space-between;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.55rem;
  border: 1px solid color-mix(in srgb, var(--border-strong) 55%, transparent);
  background: color-mix(in srgb, var(--panel) 90%, black 10%);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(14px) saturate(1.2);
  border-radius: 1.15rem;
  touch-action: none;
}

.pane-scrubber__dot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  justify-items: center;
  gap: 0.34rem;
  min-inline-size: 0;
  flex: 1 1 0;
  min-block-size: 48px;
  padding: 0.4rem 0.26rem;
  border-radius: 0.82rem;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.pane-scrubber__icon-wrap {
  display: grid;
  place-items: center;
  inline-size: 1.55rem;
  block-size: 1.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-muted) 12%, transparent);
  transition: background 140ms ease, transform 140ms ease;
}

.pane-scrubber__icon {
  inline-size: 1.02rem;
  block-size: 1.02rem;
  color: currentColor;
}

.pane-scrubber__icon path {
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.pane-scrubber__label {
  position: static;
  opacity: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-inline-size: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--text-primary);
  text-transform: none;
  letter-spacing: 0.01em;
  line-height: 1.1;
  font-size: 0.76rem;
  font-weight: 600;
  transition: color 140ms ease;
}

.pane-scrubber__dot.is-active {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}

.pane-scrubber__dot.is-active .pane-scrubber__icon-wrap {
  background: color-mix(in srgb, var(--accent) 28%, transparent);
  transform: translateY(-1px);
}

.pane-scrubber__dot:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 58%, transparent);
  outline-offset: 2px;
}

@media (max-width: 960px) and (pointer: coarse) {
  .pane-scrubber {
    display: grid;
  }
}
</style>