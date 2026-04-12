import { computed, ref, type Ref } from "vue";
import { providerHasKey } from "../ai/registry";
import { clearQueueForDate, queueAnalysis, runPendingAnalysis } from "../ai/service";
import { buildAnalyzeIssue } from "./dashboard-helpers";
import type { Profile } from "../types";

type AnalyzeGate =
  | { ok: true }
  | {
      ok: false;
      reason: "offline" | "missing-key" | "empty-food-log" | "incomplete-profile";
    };

/** Abort the primary request after this many ms and retry with the lite model. */
const SLOW_MODEL_TIMEOUT_MS = 30_000;
/** Fallback provider used when the primary model exceeds SLOW_MODEL_TIMEOUT_MS. */
const LITE_FALLBACK_PROVIDER = "gemini-2.5-flash-lite";

export function useAnalysisFlow(args: {
  profile: Ref<Profile | null>;
  provider: Ref<string>;
  currentFoodLog: Ref<string>;
  selectedDate: Ref<string>;
  refreshState: () => Promise<void>;
  saveFoodDraft: () => Promise<void>;
}) {
  const isAnalyzing = ref(false);
  /** True while we have aborted the primary model and are re-running with the lite fallback. */
  const isFallingBackToLite = ref(false);

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

    isFallingBackToLite.value = false;
    isAnalyzing.value = true;

    const primaryController = new AbortController();
    let timeoutHandle: number | undefined;
    let didTimeOut = false;

    timeoutHandle = window.setTimeout(() => {
      didTimeOut = true;
      primaryController.abort();
    }, SLOW_MODEL_TIMEOUT_MS);

    try {
      // Queue and run with the selected provider; abort signal cuts it short on timeout.
      await queueAnalysis(args.selectedDate.value, args.provider.value);
      await runPendingAnalysis(primaryController.signal);

      // Clear timeout immediately — don't let it fire after a fast success.
      clearTimeout(timeoutHandle);
      timeoutHandle = undefined;

      if (didTimeOut) {
        // Primary request timed out — clean up queue and retry with the lite model.
        isFallingBackToLite.value = true;
        await clearQueueForDate(args.selectedDate.value);
        await queueAnalysis(args.selectedDate.value, LITE_FALLBACK_PROVIDER);
        await runPendingAnalysis();
      }

      await args.refreshState();
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      isAnalyzing.value = false;
      isFallingBackToLite.value = false;
    }
  }

  return {
    isAnalyzing,
    isFallingBackToLite,
    analyzeIssue,
    flushPendingAnalysis,
    analyzeCurrentDay,
  };
}
