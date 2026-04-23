import { computed, ref } from "vue";
import type { StoredAiKeys } from "../ai/credentials";

export function useAutoSaveState() {
  const isAutoSaving = ref(false);
  const savingFields = ref<Record<string, boolean>>({});
  let activeAutoSaves = 0;

  const isSavingWeight = computed(() => Boolean(savingFields.value["today.weight"]));
  const isSavingFoodLog = computed(() => Boolean(savingFields.value["today.foodLog"]));
  const isSavingFoodInstructions = computed(() =>
    Boolean(savingFields.value["constants.foodInstructions"]),
  );
  const isSavingTdeeEquation = computed(() =>
    Boolean(savingFields.value["constants.profile.tdeeEquation"]),
  );
  const isSavingLocale = computed(() => Boolean(savingFields.value["settings.locale"]));
  const isSavingProvider = computed(() => Boolean(savingFields.value["settings.provider"]));
  const savingAiKeyField = computed<keyof StoredAiKeys | "">(() => {
    const key = Object.keys(savingFields.value).find((item) => item.startsWith("credentials."));
    return key ? (key.replace("credentials.", "") as keyof StoredAiKeys) : "";
  });
  const savingHistoryCalories = computed<Record<string, boolean>>(() =>
    Object.fromEntries(
      Object.entries(savingFields.value)
        .filter(([key, value]) => key.startsWith("history.calories.") && value)
        .map(([key]) => [key.replace("history.calories.", ""), true]),
    ),
  );
  const savingHistoryWeight = computed<Record<string, boolean>>(() =>
    Object.fromEntries(
      Object.entries(savingFields.value)
        .filter(([key, value]) => key.startsWith("history.weight.") && value)
        .map(([key]) => [key.replace("history.weight.", ""), true]),
    ),
  );

  async function runAutoSave(action: () => Promise<void>, fieldKey?: string) {
    activeAutoSaves += 1;
    isAutoSaving.value = true;
    if (fieldKey) {
      savingFields.value = { ...savingFields.value, [fieldKey]: true };
    }
    try {
      const minimumDelay = fieldKey === "constants.profile.activityFactor" ? 520 : 280;
      await Promise.all([action(), new Promise((resolve) => window.setTimeout(resolve, minimumDelay))]);
    } finally {
      activeAutoSaves = Math.max(0, activeAutoSaves - 1);
      isAutoSaving.value = activeAutoSaves > 0;
      if (fieldKey) {
        const next = { ...savingFields.value };
        delete next[fieldKey];
        savingFields.value = next;
      }
    }
  }

  return {
    isAutoSaving,
    isSavingWeight,
    isSavingFoodLog,
    isSavingFoodInstructions,
    isSavingTdeeEquation,
    isSavingLocale,
    isSavingProvider,
    savingAiKeyField,
    savingHistoryCalories,
    savingHistoryWeight,
    runAutoSave,
  };
}
