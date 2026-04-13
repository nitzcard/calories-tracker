import { computed, ref, type Ref } from "vue";
import { providerHasKey } from "../ai/registry";
import { clearQueueForDate, queueAnalysis, runPendingAnalysis } from "../ai/service";
import { getPendingQueue } from "../storage/repository";
import { buildAnalyzeIssue } from "./dashboard-helpers";
import type { Profile } from "../types";

type AnalyzeGate =
  | { ok: true }
  | {
      ok: false;
      reason: "offline" | "missing-key" | "empty-food-log" | "incomplete-profile";
    };

/** After this many ms, suggest switching models (no auto-abort). */
const SUGGEST_SWITCH_AFTER_MS = 30_000;

function friendlyModelLabel(providerId: string) {
  if (!providerId.startsWith("gemini-")) return providerId;
  const normalized = providerId.replace(/^gemini-/, "");
  const parts = normalized.split("-");
  const version = parts.shift();
  const rest = parts.join("-");
  const suffix = rest
    .split("-")
    .map((p) => (p.length ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
  return `Gemini ${version} ${suffix}`.trim();
}

function suggestedProviderFor(primaryProvider: string): string | null {
  // Main desired flow: flash latest -> lite latest.
  if (primaryProvider === "gemini-2.5-flash-latest") {
    return "gemini-2.5-flash-lite-latest";
  }

  // Generic Gemini: if on flash (non-lite), suggest lite-latest; if already lite, suggest flash.
  if (primaryProvider.startsWith("gemini-")) {
    if (primaryProvider.includes("lite")) {
      return "gemini-2.5-flash";
    }
    if (primaryProvider.includes("flash")) {
      return "gemini-2.5-flash-lite-latest";
    }
  }

  return null;
}

export function useAnalysisFlow(args: {
  profile: Ref<Profile | null>;
  provider: Ref<string>;
  currentFoodLog: Ref<string>;
  selectedDate: Ref<string>;
  refreshState: () => Promise<void>;
  saveFoodDraft: () => Promise<void>;
}) {
  const isAnalyzing = ref(false);
  const suggestedProviderId = ref<string | null>(null);
  const showModelSwitchPrompt = ref(false);
  const suggestedModelLabel = computed(() =>
    suggestedProviderId.value ? friendlyModelLabel(suggestedProviderId.value) : null,
  );

  const activeController = ref<AbortController | null>(null);
  const activeRun = ref<Promise<void> | null>(null);
  let suggestTimer: number | null = null;

  function getAnalyzeGate(activeProvider: string, foodLogText: string): AnalyzeGate {
    if (!args.profile.value?.age || !args.profile.value?.height || !args.profile.value.activityPrompt.trim()) {
      return { ok: false, reason: "incomplete-profile" };
    }

    if (!foodLogText.trim()) {
      return { ok: false, reason: "empty-food-log" };
    }

    if (!navigator.onLine) {
      return { ok: false, reason: "offline" };
    }

    if (!providerHasKey(activeProvider)) {
      return { ok: false, reason: "missing-key" };
    }

    return { ok: true };
  }

  const analyzeIssue = computed(() =>
    buildAnalyzeIssue(getAnalyzeGate(args.provider.value, args.currentFoodLog.value)),
  );

  async function withBusyFeedback(action: () => Promise<void>) {
    isAnalyzing.value = true;
    try {
      await Promise.all([action(), new Promise((resolve) => window.setTimeout(resolve, 650))]);
    } finally {
      isAnalyzing.value = false;
    }
  }

  async function flushPendingAnalysis(showBusy = false) {
    const gate = getAnalyzeGate(args.provider.value, args.currentFoodLog.value);
    if (!gate.ok && gate.reason !== "empty-food-log") {
      return;
    }

    const queue = await getPendingQueue();
    if (!queue.length) {
      return;
    }

    const task = async () => {
      await runPendingAnalysis();
      await args.refreshState();
    };

    if (showBusy) {
      await withBusyFeedback(task);
      return;
    }

    isAnalyzing.value = true;
    try {
      await task();
    } finally {
      isAnalyzing.value = false;
    }
  }

  async function analyzeCurrentDay() {
    await args.saveFoodDraft();
    const gate = getAnalyzeGate(args.provider.value, args.currentFoodLog.value);

    if (!gate.ok) {
      await args.refreshState();
      return;
    }

    suggestedProviderId.value = null;
    showModelSwitchPrompt.value = false;
    isAnalyzing.value = true;

    const controller = new AbortController();
    activeController.value = controller;

    if (suggestTimer) window.clearTimeout(suggestTimer);
    suggestTimer = window.setTimeout(() => {
      const suggestion = suggestedProviderFor(args.provider.value);
      if (!suggestion) return;
      suggestedProviderId.value = suggestion;
      showModelSwitchPrompt.value = true;
    }, SUGGEST_SWITCH_AFTER_MS);

    try {
      // Queue and run with selected provider. No auto-fallback; user can opt-in after 30s.
      await queueAnalysis(args.selectedDate.value, args.provider.value);
      const run = runPendingAnalysis(controller.signal);
      activeRun.value = run;
      await run;

      await args.refreshState();
    } finally {
      if (suggestTimer) window.clearTimeout(suggestTimer);
      suggestTimer = null;
      isAnalyzing.value = false;
      showModelSwitchPrompt.value = false;
      suggestedProviderId.value = null;
      activeController.value = null;
      activeRun.value = null;
    }
  }

  async function acceptSuggestedModelSwitch() {
    const nextProvider = suggestedProviderId.value;
    if (!nextProvider) return;
    const controller = activeController.value;
    const run = activeRun.value;

    showModelSwitchPrompt.value = false;

    // Abort in-flight request (if any) and wait for it to settle.
    if (controller) {
      controller.abort();
    }
    if (run) {
      try {
        await run;
      } catch {
        // Ignore; we'll restart immediately.
      }
    }

    // Clear any stuck queue items (including "processing"), then retry with suggested model.
    await clearQueueForDate(args.selectedDate.value);
    await queueAnalysis(args.selectedDate.value, nextProvider);
    await runPendingAnalysis();
    await args.refreshState();
  }

  function dismissSuggestedModelSwitch() {
    showModelSwitchPrompt.value = false;
  }

  return {
    isAnalyzing,
    showModelSwitchPrompt,
    suggestedModelLabel,
    analyzeIssue,
    flushPendingAnalysis,
    analyzeCurrentDay,
    acceptSuggestedModelSwitch,
    dismissSuggestedModelSwitch,
  };
}
