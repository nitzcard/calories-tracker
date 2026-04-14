import { computed, ref, type Ref } from "vue";
import { FALLBACK_GEMINI_MODEL, formatGeminiModelLabel } from "../ai/gemini-config";
import { hasGeminiApiKey } from "../ai/registry";
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
  return formatGeminiModelLabel(providerId);
}

function suggestedProviderFor(primaryProvider: string): string | null {
  if (primaryProvider.includes("lite")) {
    return FALLBACK_GEMINI_MODEL;
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
  saveProvider: (provider: string) => Promise<void>;
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

  function getAnalyzeGate(_activeProvider: string, foodLogText: string): AnalyzeGate {
    if (!args.profile.value?.age || !args.profile.value?.height || !args.profile.value.activityPrompt.trim()) {
      return { ok: false, reason: "incomplete-profile" };
    }

    if (!foodLogText.trim()) {
      return { ok: false, reason: "empty-food-log" };
    }

    if (!navigator.onLine) {
      return { ok: false, reason: "offline" };
    }

    if (!hasGeminiApiKey()) {
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

    await args.saveProvider(nextProvider);
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
