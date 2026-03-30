import { computed, ref, type Ref } from "vue";
import { providerHasKey } from "../ai/registry";
import { queueAnalysis, runPendingAnalysis } from "../ai/service";
import { buildAnalyzeIssue } from "./dashboard-helpers";
import type { Profile } from "../types";

type AnalyzeGate =
  | { ok: true }
  | {
      ok: false;
      reason: "offline" | "missing-key" | "empty-food-log" | "incomplete-profile";
    };

export function useAnalysisFlow(args: {
  profile: Ref<Profile | null>;
  provider: Ref<string>;
  currentFoodLog: Ref<string>;
  selectedDate: Ref<string>;
  refreshState: () => Promise<void>;
  saveFoodDraft: () => Promise<void>;
}) {
  const isAnalyzing = ref(false);

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

    await queueAnalysis(args.selectedDate.value, args.provider.value);
    await flushPendingAnalysis(true);
  }

  return {
    isAnalyzing,
    analyzeIssue,
    flushPendingAnalysis,
    analyzeCurrentDay,
  };
}
