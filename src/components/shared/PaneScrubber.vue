<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{
  panes: Array<{ id: string; label: string; icon?: "diary" | "summary" | "graphs" | "history" }>;
  ariaLabel?: string;
}>();

const activePaneId = ref(props.panes[0]?.id ?? "");
const railRef = ref<HTMLElement | null>(null);
const captionText = computed(
  () => props.panes.find((pane) => pane.id === activePaneId.value)?.label ?? props.panes[0]?.label ?? "",
);

let observer: IntersectionObserver | null = null;

function scrollToPane(id: string) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }

  activePaneId.value = id;

  // Manual scroll keeps mobile browser chrome from re-running scroll anchoring
  // quirks that can happen with `scrollIntoView()` on fixed bottom controls.
  const top = window.scrollY + element.getBoundingClientRect().top - 16;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
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

  // Register touchmove with { passive: false } so event.preventDefault() works
  // in modern browsers that otherwise default touchmove to passive.
  railRef.value?.addEventListener("touchmove", onTouchMove, { passive: false });
});

onUnmounted(() => {
  observer?.disconnect();
  observer = null;
  railRef.value?.removeEventListener("touchmove", onTouchMove);
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
  >
    <div class="pane-scrubber__caption" aria-hidden="true">
      <span>{{ captionText }}</span>
    </div>
    <div class="pane-scrubber__track">
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
    </div>
  </nav>
</template>

<style scoped>
.pane-scrubber {
  position: fixed;
  inset-inline: max(0.25rem, env(safe-area-inset-left)) max(0.25rem, env(safe-area-inset-right));
  inset-block-end: env(safe-area-inset-bottom);
  z-index: 45;
  display: none;
  grid-template-rows: auto 1fr;
  gap: 0;
  padding: 0.18rem;
  border: 1px solid var(--border-strong);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 86%, white 14%) 0%, var(--surface-2) 100%);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.7),
    inset -1px -1px 0 rgba(0, 0, 0, 0.38),
    0 1px 0 rgba(255, 255, 255, 0.24),
    0 4px 0 rgba(0, 0, 0, 0.28);
  border-radius: 0;
  touch-action: manipulation;
  overflow: clip;
  contain: layout paint;
}

.pane-scrubber__caption {
  display: flex;
  align-items: center;
  min-block-size: 1rem;
  padding: 0.1rem 0.34rem 0.14rem;
  margin-block-end: 0.14rem;
  border: 1px solid var(--border-strong);
  background: linear-gradient(180deg, #d8d0bf 0%, #b9b1a0 100%);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.74),
    inset -1px -1px 0 rgba(0, 0, 0, 0.34);
  color: #1f1b15;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.pane-scrubber__track {
  display: flex;
  align-items: stretch;
  gap: 0;
  min-inline-size: 0;
}

.pane-scrubber__dot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  justify-items: center;
  gap: 0.16rem;
  min-inline-size: 0;
  flex: 1 1 0;
  min-block-size: 3.1rem;
  padding: 0.24rem 0.14rem 0.22rem;
  border-radius: 0;
  border: 1px solid var(--border-strong);
  border-inline-end-color: var(--border);
  background: linear-gradient(180deg, var(--surface-1) 0%, var(--surface-3) 100%);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.68),
    inset -1px -1px 0 rgba(0, 0, 0, 0.36);
  color: var(--text-muted);
  cursor: pointer;
}

.pane-scrubber__dot:first-child {
  border-start-start-radius: 0;
  border-end-start-radius: 0;
}

.pane-scrubber__dot:last-child {
  border-inline-end-color: var(--border-strong);
}

.pane-scrubber__icon-wrap {
  display: grid;
  place-items: center;
  inline-size: 1.4rem;
  block-size: 1.4rem;
  border: 1px solid var(--border);
  border-radius: 0;
  background: linear-gradient(180deg, var(--surface-2) 0%, var(--surface-3) 100%);
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.55),
    inset -1px -1px 0 rgba(0, 0, 0, 0.3);
  transition: background 140ms ease, box-shadow 140ms ease;
}

.pane-scrubber__icon {
  inline-size: 0.95rem;
  block-size: 0.95rem;
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
  font-size: 0.64rem;
  font-weight: 600;
  transition: color 140ms ease;
}

.pane-scrubber__dot.is-active {
  color: var(--text-primary);
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, var(--surface-1)) 0%, var(--surface-2) 100%);
  box-shadow:
    inset 1px 1px 0 rgba(0, 0, 0, 0.34),
    inset -1px -1px 0 rgba(255, 255, 255, 0.18);
}

.pane-scrubber__dot.is-active .pane-scrubber__icon-wrap {
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 14%, var(--surface-2)) 0%, var(--surface-3) 100%);
  box-shadow:
    inset 1px 1px 0 rgba(0, 0, 0, 0.28),
    inset -1px -1px 0 rgba(255, 255, 255, 0.12);
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
