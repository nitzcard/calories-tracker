import { computed, ref, type Ref } from "vue";
import { formatGeminiModelLabel, isGeminiModelId } from "../ai/gemini-config";
import { hasGeminiApiKey, getGeminiProvider } from "../ai/registry";
import { buildAnalyzeIssue } from "./dashboard-helpers";
import type { AiProviderOption, DailyEntry, Profile } from "../types";

type AnalyzeGate =
  | { ok: true }
  | {
      ok: false;
      reason: "offline" | "missing-key" | "empty-food-log" | "incomplete-profile";
    };

const SUGGEST_SWITCH_AFTER_MS = 30_000;

function friendlyModelLabel(providerId: string) {
  return formatGeminiModelLabel(providerId);
}

function suggestedProviderFor(primaryProvider: string, providerOptions: AiProviderOption[]): string | null {
  const detected = providerOptions.filter(
    (option) => option.source === "detected" && isGeminiModelId(option.id),
  );
  if (!detected.length) {
    return null;
  }

  const family = primaryProvider.includes("lite") ? "flash" : "flash-lite";
  const candidates = detected
    .filter((option) => option.id.includes(family))
    .sort((a, b) => rankSuggestion(a.id) - rankSuggestion(b.id) || a.id.localeCompare(b.id));

  return candidates[0]?.id ?? null;
}

function rankSuggestion(id: string) {
  const lowered = id.toLowerCase();
  const is25 = lowered.includes("2.5") ? 0 : 1;
  const isLatest = lowered.includes("latest") ? 0 : 1;
  const isPreview = lowered.includes("preview") || lowered.includes("experimental") ? 1 : 0;
  return is25 * 100 + isLatest * 10 + isPreview;
}

export function useAnalysisFlow(args: {
  profile: Ref<Profile | null>;
  provider: Ref<string>;
  providerOptions: Ref<AiProviderOption[]>;
  currentFoodLog: Ref<string>;
  selectedDate: Ref<string>;
  getEntryForDate: (date: string) => DailyEntry | undefined;
  saveFoodDraft: () => Promise<void>;
  saveProvider: (provider: string) => Promise<void>;
  updateEntry: (date: string, updater: (entry: DailyEntry) => DailyEntry) => Promise<void>;
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

  function getAnalyzeGate(foodLogText: string): AnalyzeGate {
    if (!args.profile.value?.age || !args.profile.value?.height) {
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
    buildAnalyzeIssue(getAnalyzeGate(args.currentFoodLog.value)),
  );

  async function analyzeWithProvider(providerId: string, signal?: AbortSignal) {
    const date = args.selectedDate.value;
    const entry = args.getEntryForDate(date);
    const profile = args.profile.value;
    if (!entry || !profile) {
      return;
    }

    await args.updateEntry(date, (current) => ({
      ...current,
      aiStatus: "processing",
      aiError: null,
    }));

    try {
      const result = await getGeminiProvider(providerId).analyzeDailyEntry(
        {
          date,
          foodLogText: entry.foodLogText,
          profile,
          foodRules: profile.foodInstructions.trim()
            ? [
                {
                  id: "default-food-instructions",
                  label: "Saved instructions",
                  instructionText: profile.foodInstructions,
                  active: true,
                  createdAt: new Date().toISOString(),
                },
              ]
            : [],
        },
        signal,
      );

      await args.updateEntry(date, (current) => ({
        ...current,
        nutritionSnapshot: result,
        aiStatus: "done",
        aiError: null,
        analysisStale: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI error";
      await args.updateEntry(date, (current) => ({
        ...current,
        aiStatus: signal?.aborted ? "idle" : "failed",
        aiError: signal?.aborted ? null : message,
      }));
      if (!signal?.aborted) {
        throw error;
      }
    }
  }

  async function analyzeCurrentDay() {
    await args.saveFoodDraft();
    const gate = getAnalyzeGate(args.currentFoodLog.value);

    if (!gate.ok) {
      return;
    }

    suggestedProviderId.value = null;
    showModelSwitchPrompt.value = false;
    isAnalyzing.value = true;

    const controller = new AbortController();
    activeController.value = controller;

    await args.updateEntry(args.selectedDate.value, (entry) => ({
      ...entry,
      aiStatus: "pending",
      aiError: null,
    }));

    if (suggestTimer) window.clearTimeout(suggestTimer);
    suggestTimer = window.setTimeout(() => {
      const suggestion = suggestedProviderFor(args.provider.value, args.providerOptions.value);
      if (!suggestion) return;
      suggestedProviderId.value = suggestion;
      showModelSwitchPrompt.value = true;
    }, SUGGEST_SWITCH_AFTER_MS);

    try {
      const run = analyzeWithProvider(args.provider.value, controller.signal);
      activeRun.value = run;
      await run;
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

    if (controller) {
      controller.abort();
    }
    if (run) {
      try {
        await run;
      } catch {
        // Ignore aborted or failed prior run; retry below.
      }
    }

    await args.saveProvider(nextProvider);
    await analyzeCurrentDay();
  }

  function dismissSuggestedModelSwitch() {
    showModelSwitchPrompt.value = false;
  }

  return {
    isAnalyzing,
    showModelSwitchPrompt,
    suggestedModelLabel,
    analyzeIssue,
    analyzeCurrentDay,
    acceptSuggestedModelSwitch,
    dismissSuggestedModelSwitch,
  };
}
