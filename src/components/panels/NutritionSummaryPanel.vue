<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import { lookupFoodMacrosPer100WithGemini } from "../../ai/gemini-macro-lookup";
import { buildAnalysisErrorPresentation } from "../../app/analysis-errors";
import type {
  AiProviderOption,
  AppLocale,
  DailyEntry,
  FoodBreakdownItem,
  MealBreakdownItem,
  NutritionTotals,
  Profile,
} from "../../types";

const props = defineProps<{
  locale: AppLocale;
  entry?: DailyEntry;
  profile?: Profile | null;
  isAnalyzing: boolean;
  statusText: string;
  isStale?: boolean;
  providerId?: string;
  providerOptions?: AiProviderOption[];
  correctionToken?: number;
  analysisError?: string | null;
  analysisRetryModelLabel?: string | null;
  analysisRetryModelId?: string | null;
}>();

const emit = defineEmits<{
  "save-correction": [
    foodId: string,
    foodName: string,
    grams: number | null,
    calories: number | null,
    caloriesPer100g: number | null,
    protein?: number | null,
    carbs?: number | null,
    fat?: number | null,
    fiber?: number | null,
    solubleFiber?: number | null,
    insolubleFiber?: number | null,
  ];
  "apply-correction": [
    foodId: string,
    foodName: string,
    grams: number | null,
    calories: number | null,
    caloriesPer100g: number | null,
    protein?: number | null,
    carbs?: number | null,
    fat?: number | null,
    fiber?: number | null,
    solubleFiber?: number | null,
    insolubleFiber?: number | null,
  ];
  "save-correction-only": [
    foodId: string,
    foodName: string,
    grams: number | null,
    calories: number | null,
    caloriesPer100g: number | null,
    protein?: number | null,
    carbs?: number | null,
    fat?: number | null,
    fiber?: number | null,
    solubleFiber?: number | null,
    insolubleFiber?: number | null,
  ];
  "apply-meal-total": [
    mealId: string,
    totals: NutritionTotals,
  ];
  "retry-analysis-with-model": [provider: string];
}>();

const editableMeals = ref<MealBreakdownItem[]>([]);
const editableMealTotals = ref<Record<string, NutritionTotals>>({});
const pendingFoodDrafts = ref<
  Record<
    string,
    Partial<
      Pick<
        FoodBreakdownItem,
        | "grams"
        | "calories"
        | "caloriesPer100g"
        | "protein"
        | "carbs"
        | "fat"
        | "fiber"
        | "solubleFiber"
        | "insolubleFiber"
      >
    >
  >
>({});
const pendingMealTotalDrafts = ref<Record<string, Partial<NutritionTotals>>>({});
const showCorrectionCue = ref(false);
const showNewResultsCue = ref(false);
let correctionCueTimeout: ReturnType<typeof setTimeout> | null = null;
let newResultsCueTimeout: ReturnType<typeof setTimeout> | null = null;

const { t } = useI18n();
const visibleUnmatchedItems = computed(() =>
  (props.entry?.nutritionSnapshot?.unmatchedItems ?? []).filter(
    (item) => props.locale === "he" || !containsHebrew(item),
  ),
);
const pendingAutoApplyTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingMealTotalApplyTimers = new Map<string, ReturnType<typeof setTimeout>>();
const per100MacroDrafts = ref<
  Record<
    string,
    {
      protein: string;
      carbs: string;
      fat: string;
      fiber: string;
      solubleFiber: string;
      insolubleFiber: string;
    }
  >
>({});
const sourceUrlDrafts = ref<Record<string, string>>({});
const aiLookupLoading = ref<Record<string, boolean>>({});
const aiLookupError = ref<Record<string, string>>({});
const macroAssistantSourceMode = ref<Record<string, "ai" | "url">>({});
const macroAssistantLastLookupMode = ref<Record<string, "search" | "url">>({});
const dailyTotals = computed(() => {
  const foods = editableMeals.value.flatMap((meal) => meal.foods);
  if (foods.length) {
    return sumNutritionTotals(foods);
  }

  return props.entry?.nutritionSnapshot?.dailyTotals ?? null;
});

watch(
  () => props.entry?.nutritionSnapshot?.meals,
  (meals) => {
    editableMeals.value = meals
      ? meals.map((meal) => ({
          ...meal,
          foods: meal.foods.map((food) => ({
            ...food,
            ...pendingFoodDrafts.value[food.id],
          })),
        }))
      : [];
    const totalsInit: Record<string, NutritionTotals> = {};
    for (const meal of editableMeals.value) {
      totalsInit[meal.id] = {
        ...meal.totals,
        ...pendingMealTotalDrafts.value[meal.id],
      };

      for (const food of meal.foods) {
        const pending = pendingFoodDrafts.value[food.id];
        if (!pending) {
          continue;
        }

        const pendingMatchesPersisted =
          (pending.grams === undefined || pending.grams === food.grams) &&
          (pending.calories === undefined || pending.calories === food.calories) &&
          (pending.caloriesPer100g === undefined || pending.caloriesPer100g === food.caloriesPer100g) &&
          (pending.protein === undefined || pending.protein === food.protein) &&
          (pending.carbs === undefined || pending.carbs === food.carbs) &&
          (pending.fat === undefined || pending.fat === food.fat) &&
          (pending.fiber === undefined || pending.fiber === (food.fiber ?? null)) &&
          (pending.solubleFiber === undefined || pending.solubleFiber === (food.solubleFiber ?? null)) &&
          (pending.insolubleFiber === undefined || pending.insolubleFiber === (food.insolubleFiber ?? null));

        if (pendingMatchesPersisted) {
          const next = { ...pendingFoodDrafts.value };
          delete next[food.id];
          pendingFoodDrafts.value = next;
        }
      }

      const pendingTotals = pendingMealTotalDrafts.value[meal.id];
      if (pendingTotals) {
        const pendingMatchesPersisted =
          (pendingTotals.calories === undefined || pendingTotals.calories === meal.totals.calories) &&
          (pendingTotals.protein === undefined || pendingTotals.protein === meal.totals.protein) &&
          (pendingTotals.carbs === undefined || pendingTotals.carbs === meal.totals.carbs) &&
          (pendingTotals.fat === undefined || pendingTotals.fat === meal.totals.fat) &&
          (pendingTotals.fiber === undefined || pendingTotals.fiber === meal.totals.fiber);

        if (pendingMatchesPersisted) {
          const next = { ...pendingMealTotalDrafts.value };
          delete next[meal.id];
          pendingMealTotalDrafts.value = next;
        }
      }
    }
    editableMealTotals.value = { ...totalsInit };
  },
  { immediate: true },
);

watch(
  () => props.correctionToken,
  (next, previous) => {
    if (!next || next === previous) {
      return;
    }

    showCorrectionCue.value = true;
    if (correctionCueTimeout) {
      clearTimeout(correctionCueTimeout);
    }
    correctionCueTimeout = setTimeout(() => {
      showCorrectionCue.value = false;
    }, 2600);
  },
);

watch(
  () => props.entry?.nutritionSnapshot?.updatedAt ?? null,
  (next, previous) => {
    if (next && next !== previous) {
      showNewResultsCue.value = true;
      if (newResultsCueTimeout) {
        clearTimeout(newResultsCueTimeout);
      }
      newResultsCueTimeout = setTimeout(() => {
        showNewResultsCue.value = false;
      }, 1350);
    }
  },
);

function updateFood(
  foodId: string,
  key:
    | "grams"
    | "calories"
    | "caloriesPer100g"
    | "protein"
    | "carbs"
    | "fat"
    | "fiber"
    | "solubleFiber"
    | "insolubleFiber",
  rawValue: string,
) {
  const nextValue = rawValue.trim() ? Number(rawValue) : null;
  let updatedFood: FoodBreakdownItem | null = null;

  editableMeals.value = editableMeals.value.map((meal) => ({
    ...meal,
    foods: meal.foods.map((food) => {
      if (food.id !== foodId) {
        return food;
      }

      updatedFood = applyFoodEdit(food, key, nextValue);
      return updatedFood;
    }),
  }));

  editableMealTotals.value = Object.fromEntries(
    editableMeals.value.map((meal) => [meal.id, sumNutritionTotals(meal.foods)]),
  );

  if (updatedFood) {
    pendingFoodDrafts.value = {
      ...pendingFoodDrafts.value,
      [foodId]: {
        ...pendingFoodDrafts.value[foodId],
        [key]: nextValue,
      },
    };
  }
}

function onFoodInput(
  foodId: string,
  key:
    | "grams"
    | "calories"
    | "caloriesPer100g"
    | "protein"
    | "carbs"
    | "fat"
    | "fiber"
    | "solubleFiber"
    | "insolubleFiber",
  event: Event,
) {
  const rawValue = (event.target as HTMLInputElement).value;
  updateFood(foodId, key, rawValue);

  const editedFood = editableMeals.value
    .flatMap((meal) => meal.foods)
    .find((food) => food.id === foodId);
  if (editedFood) {
    scheduleAutoApply(editedFood, {
      includeMacros:
        key === "protein" ||
        key === "carbs" ||
        key === "fat" ||
        key === "fiber" ||
        key === "solubleFiber" ||
        key === "insolubleFiber",
    });
  }
}

function commitFoodEdit(foodId: string) {
  const editedFood = editableMeals.value
    .flatMap((meal) => meal.foods)
    .find((food) => food.id === foodId);

  if (!editedFood) {
    return;
  }

  const existingTimer = pendingAutoApplyTimers.get(foodId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    pendingAutoApplyTimers.delete(foodId);
  }

  const pending = pendingFoodDrafts.value[foodId];
  const includeMacros = Boolean(
    pending &&
      (pending.protein !== undefined ||
        pending.carbs !== undefined ||
        pending.fat !== undefined ||
        pending.fiber !== undefined ||
        pending.solubleFiber !== undefined ||
        pending.insolubleFiber !== undefined),
  );

  emitApplyCorrection(editedFood, { includeMacros });
}

function emitSaveCorrection(food: FoodBreakdownItem) {
  emit(
    "save-correction",
    food.id,
    food.name,
    food.grams ?? null,
    food.calories ?? null,
    food.caloriesPer100g ?? null,
    food.protein ?? null,
    food.carbs ?? null,
    food.fat ?? null,
    food.fiber ?? null,
    food.solubleFiber ?? null,
    food.insolubleFiber ?? null,
  );
}

function emitApplyCorrection(food: FoodBreakdownItem, options?: { includeMacros?: boolean }) {
  if (options?.includeMacros) {
    emit(
      "apply-correction",
      food.id,
      food.name,
      food.grams ?? null,
      food.calories ?? null,
      food.caloriesPer100g ?? null,
      food.protein ?? null,
      food.carbs ?? null,
      food.fat ?? null,
      food.fiber ?? null,
      food.solubleFiber ?? null,
      food.insolubleFiber ?? null,
    );
    return;
  }

  emit(
    "apply-correction",
    food.id,
    food.name,
    food.grams ?? null,
    food.calories ?? null,
    food.caloriesPer100g ?? null,
  );
}

function scheduleAutoApply(food: FoodBreakdownItem, options?: { includeMacros?: boolean }) {
  const existingTimer = pendingAutoApplyTimers.get(food.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    emitApplyCorrection(food, options);
    pendingAutoApplyTimers.delete(food.id);
  }, 650);

  pendingAutoApplyTimers.set(food.id, timer);
}

function openRowActionMenu(food: FoodBreakdownItem) {
  ensurePer100MacroDraft(food);
  if (sourceUrlDrafts.value[food.id] === undefined) {
    sourceUrlDrafts.value = { ...sourceUrlDrafts.value, [food.id]: "" };
  }
  if (!macroAssistantSourceMode.value[food.id]) {
    macroAssistantSourceMode.value = { ...macroAssistantSourceMode.value, [food.id]: "ai" };
  }
  const dialog = document.getElementById(`action-menu-${food.id}`) as HTMLDialogElement | null;
  if (dialog) {
    dialog.showModal();
  }
}

function closeRowActionMenu(food: FoodBreakdownItem) {
  const dialog = document.getElementById(`action-menu-${food.id}`) as HTMLDialogElement | null;
  if (dialog) {
    dialog.close();
  }
}

function formatPer100FromFoodValue(value: number | null | undefined, grams: number | null | undefined) {
  if (value == null || grams == null || !Number.isFinite(value) || !Number.isFinite(grams) || grams <= 0) {
    return "";
  }

  const per100 = (value / grams) * 100;
  const rounded = Math.round(per100 * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function normalizeFiberValue(
  totalFiber: number | null | undefined,
  solubleFiber: number | null | undefined,
  insolubleFiber: number | null | undefined,
) {
  const hasTypedFiber = [solubleFiber, insolubleFiber].some((value) => value != null && Number.isFinite(value));
  if (hasTypedFiber) {
    return Math.round((Math.max(0, solubleFiber ?? 0) + Math.max(0, insolubleFiber ?? 0)) * 10) / 10;
  }

  return totalFiber != null && Number.isFinite(totalFiber) ? totalFiber : null;
}

function ensurePer100MacroDraft(food: FoodBreakdownItem) {
  if (per100MacroDrafts.value[food.id]) {
    return;
  }

  per100MacroDrafts.value = {
    ...per100MacroDrafts.value,
    [food.id]: {
      protein: formatPer100FromFoodValue(food.protein, food.grams),
      carbs: formatPer100FromFoodValue(food.carbs, food.grams),
      fat: formatPer100FromFoodValue(food.fat, food.grams),
      fiber: formatPer100FromFoodValue(food.fiber ?? null, food.grams),
      solubleFiber: formatPer100FromFoodValue(food.solubleFiber ?? null, food.grams),
      insolubleFiber: formatPer100FromFoodValue(food.insolubleFiber ?? null, food.grams),
    },
  };
}

function setPer100MacroDraft(
  foodId: string,
  key: "protein" | "carbs" | "fat" | "fiber" | "solubleFiber" | "insolubleFiber",
  value: string,
) {
  const existing = per100MacroDrafts.value[foodId] ?? {
    protein: "",
    carbs: "",
    fat: "",
    fiber: "",
    solubleFiber: "",
    insolubleFiber: "",
  };

  per100MacroDrafts.value = {
    ...per100MacroDrafts.value,
    [foodId]: {
      ...existing,
      [key]: value,
    },
  };
}

function nutritionLookupUrl(food: FoodBreakdownItem) {
  const query = `${food.name} nutrition per 100g calories protein carbs fat`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}

function setSourceUrlDraft(foodId: string, value: string) {
  sourceUrlDrafts.value = {
    ...sourceUrlDrafts.value,
    [foodId]: value,
  };
}

function setMacroAssistantSourceMode(foodId: string, mode: "ai" | "url") {
  macroAssistantSourceMode.value = {
    ...macroAssistantSourceMode.value,
    [foodId]: mode,
  };
}

function isHardQuotaError(message: string) {
  return /quota|billing|credit|free tier|exceeded your current quota|daily limit|monthly limit/i.test(message);
}

function isTransientRateLimitError(message: string) {
  return /rate\s*limit|429|resource_exhausted|too many requests/i.test(message);
}

function toDraftToken(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

async function runAiMacroLookup(food: FoodBreakdownItem, mode: "search" | "url") {
  macroAssistantLastLookupMode.value = { ...macroAssistantLastLookupMode.value, [food.id]: mode };
  aiLookupLoading.value = { ...aiLookupLoading.value, [food.id]: true };
  aiLookupError.value = { ...aiLookupError.value, [food.id]: "" };

  try {
    const sourceUrl = mode === "url" ? sourceUrlDrafts.value[food.id]?.trim() || null : null;
    const result = await lookupFoodMacrosPer100WithGemini({
      providerId: props.providerId ?? "",
      foodName: food.canonicalName || food.name,
      locale: props.locale,
      sourceUrl,
    });

    per100MacroDrafts.value = {
      ...per100MacroDrafts.value,
      [food.id]: {
        protein: toDraftToken(result.per100.protein),
        carbs: toDraftToken(result.per100.carbs),
        fat: toDraftToken(result.per100.fat),
        fiber: toDraftToken(result.per100.fiber),
        solubleFiber: toDraftToken(result.per100.solubleFiber),
        insolubleFiber: toDraftToken(result.per100.insolubleFiber),
      },
    };

    if (result.sourceUrl) {
      sourceUrlDrafts.value = {
        ...sourceUrlDrafts.value,
        [food.id]: result.sourceUrl,
      };
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : t("macroLookupFailed");
    const isQuota = isHardQuotaError(rawMessage);
    const isRateLimited = isTransientRateLimitError(rawMessage);
    const isBusy = /503|high\s*demand|overload|temporarily\s*unavailable/i.test(rawMessage);

    const message = isQuota
      ? `${t("macroLookupQuotaExceeded")} ${rawMessage}`
      : isRateLimited || isBusy
        ? `${t("macroLookupBusy")} ${rawMessage}`
        : rawMessage;

    aiLookupError.value = {
      ...aiLookupError.value,
      [food.id]: message,
    };
  } finally {
    aiLookupLoading.value = { ...aiLookupLoading.value, [food.id]: false };
  }
}

function macroLookupErrorPresentation(foodId: string) {
  return buildAnalysisErrorPresentation(
    aiLookupError.value[foodId],
    props.locale,
    props.providerId ?? "",
    props.providerOptions ?? [],
  );
}

function retryMacroLookupWithModel(food: FoodBreakdownItem, providerId: string) {
  if (!providerId) return;
  const mode = macroAssistantLastLookupMode.value[food.id] ?? "search";
  void (async () => {
    aiLookupLoading.value = { ...aiLookupLoading.value, [food.id]: true };
    aiLookupError.value = { ...aiLookupError.value, [food.id]: "" };
    try {
      const sourceUrl = mode === "url" ? sourceUrlDrafts.value[food.id]?.trim() || null : null;
      const result = await lookupFoodMacrosPer100WithGemini({
        providerId,
        foodName: food.canonicalName || food.name,
        locale: props.locale,
        sourceUrl,
      });

      per100MacroDrafts.value = {
        ...per100MacroDrafts.value,
        [food.id]: {
          protein: toDraftToken(result.per100.protein),
          carbs: toDraftToken(result.per100.carbs),
          fat: toDraftToken(result.per100.fat),
          fiber: toDraftToken(result.per100.fiber),
          solubleFiber: toDraftToken(result.per100.solubleFiber),
          insolubleFiber: toDraftToken(result.per100.insolubleFiber),
        },
      };

      if (result.sourceUrl) {
        sourceUrlDrafts.value = {
          ...sourceUrlDrafts.value,
          [food.id]: result.sourceUrl,
        };
      }
    } catch (error) {
      aiLookupError.value = {
        ...aiLookupError.value,
        [food.id]: error instanceof Error ? error.message : t("macroLookupFailed"),
      };
    } finally {
      aiLookupLoading.value = { ...aiLookupLoading.value, [food.id]: false };
    }
  })();
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function macroForServingFromPer100(per100: number | null, grams: number | null) {
  if (per100 == null || grams == null || !Number.isFinite(per100) || !Number.isFinite(grams) || grams <= 0) {
    return null;
  }
  return Math.round(((per100 * grams) / 100) * 10) / 10;
}

function calculateCaloriesFromMacros(macros: {
  protein: number | null | undefined;
  carbs: number | null | undefined;
  fat: number | null | undefined;
  fiber: number | null | undefined;
  solubleFiber?: number | null | undefined;
  insolubleFiber?: number | null | undefined;
}) {
  const hasMacroValue = [macros.protein, macros.carbs, macros.fat, macros.fiber, macros.solubleFiber, macros.insolubleFiber].some(
    (value) => value != null && Number.isFinite(value),
  );

  if (!hasMacroValue) {
    return null;
  }

  const protein = Math.max(0, macros.protein ?? 0);
  const carbs = Math.max(0, macros.carbs ?? 0);
  const fat = Math.max(0, macros.fat ?? 0);
  const solubleFiber = Math.max(0, macros.solubleFiber ?? 0);

  return Math.round((protein * 4 + carbs * 4 + fat * 9 + solubleFiber * 2) * 10) / 10;
}

function applyPer100MacroData(food: FoodBreakdownItem) {
  const grams = food.grams;
  if (grams == null || !Number.isFinite(grams) || grams <= 0) {
    return;
  }

  const draft = per100MacroDrafts.value[food.id] ?? {
    protein: "",
    carbs: "",
    fat: "",
    fiber: "",
    solubleFiber: "",
    insolubleFiber: "",
  };

  const proteinPer100 = parseOptionalNumber(draft.protein);
  const carbsPer100 = parseOptionalNumber(draft.carbs);
  const fatPer100 = parseOptionalNumber(draft.fat);
  const fiberPer100 = parseOptionalNumber(draft.fiber);
  const solubleFiberPer100 = parseOptionalNumber(draft.solubleFiber);
  const insolubleFiberPer100 = parseOptionalNumber(draft.insolubleFiber);
  const normalizedFiberPer100 = normalizeFiberValue(fiberPer100, solubleFiberPer100, insolubleFiberPer100);

  const protein = macroForServingFromPer100(proteinPer100, grams);
  const carbs = macroForServingFromPer100(carbsPer100, grams);
  const fat = macroForServingFromPer100(fatPer100, grams);
  const fiber = macroForServingFromPer100(normalizedFiberPer100, grams);
  const solubleFiber = macroForServingFromPer100(solubleFiberPer100, grams);
  const insolubleFiber = macroForServingFromPer100(insolubleFiberPer100, grams);

  const caloriesPer100g =
    calculateCaloriesFromMacros({
      protein: proteinPer100,
      carbs: carbsPer100,
      fat: fatPer100,
      fiber: normalizedFiberPer100,
      solubleFiber: solubleFiberPer100,
      insolubleFiber: insolubleFiberPer100,
    }) ?? food.caloriesPer100g ?? null;
  const calories =
    caloriesPer100g != null
      ? Math.round((caloriesPer100g * grams) / 100)
      : food.calories ?? null;

  const nextFood: FoodBreakdownItem = {
    ...food,
    calories,
    caloriesPer100g,
    protein,
    carbs,
    fat,
    fiber,
    solubleFiber,
    insolubleFiber,
    caloriesEstimated: false,
  };

  editableMeals.value = editableMeals.value.map((meal) => ({
    ...meal,
    foods: meal.foods.map((item) => (item.id === food.id ? nextFood : item)),
  }));
  editableMealTotals.value = Object.fromEntries(
    editableMeals.value.map((meal) => [meal.id, sumNutritionTotals(meal.foods)]),
  );

  pendingFoodDrafts.value = {
    ...pendingFoodDrafts.value,
    [food.id]: {
      ...pendingFoodDrafts.value[food.id],
      calories,
      caloriesPer100g,
      protein,
      carbs,
      fat,
      fiber,
      solubleFiber,
      insolubleFiber,
    },
  };

  emitApplyCorrection(nextFood, { includeMacros: true });
  closeRowActionMenu(food);
}

function emitSaveCorrectionFromMenu(food: FoodBreakdownItem) {
  emitSaveCorrection(food);
  closeRowActionMenu(food);
}

function emitSaveCorrectionOnlyFromMenu(food: FoodBreakdownItem) {
  emit(
    "save-correction-only",
    food.id,
    food.name,
    food.grams ?? null,
    food.calories ?? null,
    food.caloriesPer100g ?? null,
    food.protein ?? null,
    food.carbs ?? null,
    food.fat ?? null,
    food.fiber ?? null,
    food.solubleFiber ?? null,
    food.insolubleFiber ?? null,
  );
  closeRowActionMenu(food);
}

function updateMealTotal(mealId: string, key: keyof NutritionTotals, rawValue: string) {
  const current = editableMealTotals.value[mealId];
  if (!current) return;
  const nextValue = rawValue.trim() ? Number(rawValue) : null;
  editableMealTotals.value = {
    ...editableMealTotals.value,
    [mealId]: { ...current, [key]: nextValue },
  };
  pendingMealTotalDrafts.value = {
    ...pendingMealTotalDrafts.value,
    [mealId]: {
      ...pendingMealTotalDrafts.value[mealId],
      [key]: nextValue,
    },
  };

  scheduleMealTotalAutoApply(mealId);
}

function commitMealTotalEdit(mealId: string) {
  const existingTimer = pendingMealTotalApplyTimers.get(mealId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    pendingMealTotalApplyTimers.delete(mealId);
  }

  const totals = editableMealTotals.value[mealId];
  if (!totals) return;
  emit("apply-meal-total", mealId, { ...totals });
}

function scheduleMealTotalAutoApply(mealId: string) {
  const existingTimer = pendingMealTotalApplyTimers.get(mealId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    const totals = editableMealTotals.value[mealId];
    if (totals) {
      emit("apply-meal-total", mealId, { ...totals });
    }
    pendingMealTotalApplyTimers.delete(mealId);
  }, 650);

  pendingMealTotalApplyTimers.set(mealId, timer);
}

function displayMealLabel(mealKey: MealBreakdownItem["mealKey"], fallback: string) {
  if (["breakfast", "lunch", "dinner", "snack", "other"].includes(mealKey)) {
    return t(mealKey);
  }

  return fallback;
}

function primaryFoodName(food: FoodBreakdownItem) {
  if (props.locale === "en") {
    return food.canonicalName || food.name;
  }

  return food.name;
}

function secondaryFoodName(food: FoodBreakdownItem) {
  if (props.locale === "en") {
    return "";
  }

  const primary = primaryFoodName(food).trim().toLowerCase();
  const secondary = food.canonicalName;

  if (!secondary) {
    return "";
  }

  return secondary.trim().toLowerCase() === primary ? "" : secondary;
}

function displayAmountText(food: FoodBreakdownItem) {
  if (props.locale === "en" && containsHebrew(food.amountText)) {
    return food.grams !== null ? `${food.grams} g` : "-";
  }

  return food.amountText || "-";
}

function foodMetaText(food: FoodBreakdownItem) {
  const firstAssumption = food.assumptions[0];
  if (firstAssumption && (props.locale === "he" || !containsHebrew(firstAssumption))) {
    return firstAssumption;
  }

  return props.locale === "he" ? "דורש בדיקה ידנית" : t("needsManualReview");
}

function containsHebrew(value: string) {
  return /[\u0590-\u05ff]/.test(value);
}

function applyFoodEdit(
  food: FoodBreakdownItem,
  key:
    | "grams"
    | "calories"
    | "caloriesPer100g"
    | "protein"
    | "carbs"
    | "fat"
    | "fiber"
    | "solubleFiber"
    | "insolubleFiber",
  value: number | null,
): FoodBreakdownItem {
  const scaleMacro = (macro: number | null | undefined, ratio: number) => {
    if (macro == null || !Number.isFinite(macro)) {
      return macro ?? null;
    }

    return Math.round(macro * ratio * 10) / 10;
  };

  if (
    key === "protein" ||
    key === "carbs" ||
    key === "fat" ||
    key === "fiber" ||
    key === "solubleFiber" ||
    key === "insolubleFiber"
  ) {
    const nextMacros = {
      protein: key === "protein" ? value : food.protein,
      carbs: key === "carbs" ? value : food.carbs,
      fat: key === "fat" ? value : food.fat,
      fiber:
        key === "fiber"
          ? value
          : normalizeFiberValue(
              food.fiber,
              key === "solubleFiber" ? value : food.solubleFiber,
              key === "insolubleFiber" ? value : food.insolubleFiber,
            ),
      solubleFiber: key === "solubleFiber" ? value : key === "fiber" ? null : food.solubleFiber,
      insolubleFiber: key === "insolubleFiber" ? value : key === "fiber" ? null : food.insolubleFiber,
    };
    const nextCalories = calculateCaloriesFromMacros(nextMacros);
    return {
      ...food,
      [key]: value,
      fiber: nextMacros.fiber,
      solubleFiber: nextMacros.solubleFiber,
      insolubleFiber: nextMacros.insolubleFiber,
      calories: nextCalories != null ? Math.round(nextCalories) : food.calories,
      caloriesPer100g:
        nextCalories != null && food.grams ? Math.round((nextCalories / food.grams) * 100) : food.caloriesPer100g,
      caloriesEstimated: nextCalories != null ? false : food.caloriesEstimated,
    };
  }

  if (key === "caloriesPer100g") {
    const nextCalories = value && food.grams ? Math.round((food.grams * value) / 100) : food.calories;
    const ratio =
      food.calories != null && nextCalories != null && food.calories > 0 ? nextCalories / food.calories : 1;
    return {
      ...food,
      caloriesPer100g: value,
      calories: nextCalories,
      protein: scaleMacro(food.protein, ratio),
      carbs: scaleMacro(food.carbs, ratio),
      fat: scaleMacro(food.fat, ratio),
      fiber: scaleMacro(food.fiber, ratio),
      solubleFiber: scaleMacro(food.solubleFiber, ratio),
      insolubleFiber: scaleMacro(food.insolubleFiber, ratio),
      caloriesEstimated: false,
    };
  }

  if (key === "grams") {
    const nextCalories =
      value && food.caloriesPer100g ? Math.round((value * food.caloriesPer100g) / 100) : food.calories;
    const ratio = food.grams != null && value != null && food.grams > 0 ? value / food.grams : 1;
    return {
      ...food,
      grams: value,
      calories: nextCalories,
      protein: scaleMacro(food.protein, ratio),
      carbs: scaleMacro(food.carbs, ratio),
      fat: scaleMacro(food.fat, ratio),
      fiber: scaleMacro(food.fiber, ratio),
      solubleFiber: scaleMacro(food.solubleFiber, ratio),
      insolubleFiber: scaleMacro(food.insolubleFiber, ratio),
      gramsEstimated: false,
    };
  }

  const ratio =
    food.calories != null && value != null && food.calories > 0 ? value / food.calories : 1;

  return {
    ...food,
    calories: value,
    caloriesPer100g:
      value && food.grams ? Math.round((value / food.grams) * 100) : food.caloriesPer100g,
    protein: scaleMacro(food.protein, ratio),
    carbs: scaleMacro(food.carbs, ratio),
    fat: scaleMacro(food.fat, ratio),
    fiber: scaleMacro(food.fiber, ratio),
    solubleFiber: scaleMacro(food.solubleFiber, ratio),
    insolubleFiber: scaleMacro(food.insolubleFiber, ratio),
    caloriesEstimated: false,
  };
}

function sumNutritionTotals(foods: FoodBreakdownItem[]): NutritionTotals {
  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  };
  const seen = {
    calories: false,
    protein: false,
    carbs: false,
    fat: false,
    fiber: false,
  };

  for (const food of foods) {
    if (food.calories != null) {
      totals.calories += food.calories;
      seen.calories = true;
    }
    if (food.protein != null) {
      totals.protein += food.protein;
      seen.protein = true;
    }
    if (food.carbs != null) {
      totals.carbs += food.carbs;
      seen.carbs = true;
    }
    if (food.fat != null) {
      totals.fat += food.fat;
      seen.fat = true;
    }
    if (food.fiber != null) {
      totals.fiber += food.fiber;
      seen.fiber = true;
    }
  }

  return {
    calories: seen.calories ? Math.round(totals.calories) : null,
    protein: seen.protein ? Math.round(totals.protein * 10) / 10 : null,
    carbs: seen.carbs ? Math.round(totals.carbs * 10) / 10 : null,
    fat: seen.fat ? Math.round(totals.fat * 10) / 10 : null,
    fiber: seen.fiber ? Math.round(totals.fiber * 10) / 10 : null,
  };
}

function mealBlockStyle(color: string) {
  return {
    "--meal-accent": color,
    "--meal-bg": `color-mix(in srgb, ${color} 24%, var(--surface))`,
    "--meal-border": `color-mix(in srgb, ${color} 56%, var(--border))`,
  };
}

function macroPercent(
  macro: "protein" | "carbs" | "fat",
) {
  const totals = dailyTotals.value;
  if (!totals) {
    return null;
  }

  const macroValue = totals[macro];
  if (macroValue === null || macroValue === undefined) {
    return null;
  }

  const macroCalories =
    macro === "fat"
      ? macroValue * 9
      : macroValue * 4;
  const fallbackCalories =
    (totals.protein ?? 0) * 4 +
    (totals.carbs ?? 0) * 4 +
    (totals.fat ?? 0) * 9;
  const totalCalories = totals.calories ?? (fallbackCalories > 0 ? fallbackCalories : null);

  if (!totalCalories || totalCalories <= 0) {
    return null;
  }

  return Math.round((macroCalories / totalCalories) * 100);
}

function formatPercentToken(value: number) {
  return `${Math.round(value)}%`;
}

function formatPercentRangeToken(min: number, max: number) {
  return `${Math.round(min)}-${Math.round(max)}%`;
}

function macroGoalTargets(mode: "cut" | "leanMass" | "maingain") {
  if (mode === "cut") {
    return {
      protein: { min: 1.8, max: 2.2 },
      carbsPct: { min: 35, max: 50 },
      fatPct: { min: 20, max: 35 },
    };
  }

  if (mode === "leanMass") {
    return {
      protein: { min: 1.6, max: 2.0 },
      carbsPct: { min: 40, max: 60 },
      fatPct: { min: 20, max: 30 },
    };
  }

  return {
    protein: { min: 1.6, max: 2.0 },
    carbsPct: { min: 35, max: 55 },
    fatPct: { min: 20, max: 35 },
  };
}

function goalModeLabel(mode: "cut" | "leanMass" | "maingain") {
  const labels: Record<typeof mode, string> = {
    cut: t("goalModeCut"),
    leanMass: t("goalModeLeanMass"),
    maingain: t("goalModeMaingain"),
  };
  return labels[mode];
}

function formatGoalRange(goalLabel: string, min: number, max: number, unit: string) {
  return `${goalLabel}: ${min}-${max} ${unit}`;
}

function macroTargetText(macro: "protein" | "carbs" | "fat" | "fiber") {
  const mode = props.profile?.goalMode ?? "maingain";
  const targets = macroGoalTargets(mode);
  const goalLabel = goalModeLabel(mode);

  if (macro === "protein") {
    return formatGoalRange(goalLabel, targets.protein.min, targets.protein.max, t("unitProteinPerKg"));
  }

  if (macro === "carbs") {
    return `${goalLabel}: ${formatPercentRangeToken(targets.carbsPct.min, targets.carbsPct.max)} ${t("macroShareOfCalories")}`;
  }

  if (macro === "fat") {
    return `${goalLabel}: ${formatPercentRangeToken(targets.fatPct.min, targets.fatPct.max)} ${t("macroShareOfCalories")}`;
  }

  return `25-38 ${t("unitG")}/${props.locale === "he" ? "יום" : "day"}`;
}

function resolveTotalCalories() {
  const totals = dailyTotals.value;
  if (!totals) return null;
  const fallbackCalories =
    (totals.protein ?? 0) * 4 +
    (totals.carbs ?? 0) * 4 +
    (totals.fat ?? 0) * 9;
  const totalCalories = totals.calories ?? (fallbackCalories > 0 ? fallbackCalories : null);
  return totalCalories && totalCalories > 0 ? totalCalories : null;
}

function formatRecommendedRange(min: number, max: number) {
  const fmt = (n: number) => Math.round(n);
  return `${fmt(min)}-${fmt(max)}`;
}

function macroRecommendedRange(macro: "protein" | "carbs" | "fat" | "fiber") {
  if (macro === "fiber") {
    return { min: 25, max: 38, unit: t("unitG") };
  }

  const totalCalories = resolveTotalCalories();
  const mode = props.profile?.goalMode ?? "maingain";
  const targets = macroGoalTargets(mode);
  if (macro === "carbs") {
    if (!totalCalories) return null;
    return {
      min: (totalCalories * (targets.carbsPct.min / 100)) / 4,
      max: (totalCalories * (targets.carbsPct.max / 100)) / 4,
      unit: t("unitG"),
    };
  }

  if (macro === "fat") {
    if (!totalCalories) return null;
    return {
      min: (totalCalories * (targets.fatPct.min / 100)) / 9,
      max: (totalCalories * (targets.fatPct.max / 100)) / 9,
      unit: t("unitG"),
    };
  }

  const weight = props.profile?.estimatedWeight ?? props.entry?.weight ?? null;
  if (!weight || weight <= 0) return null;
  return { min: weight * 1.6, max: weight * 2.2, unit: t("unitG") };
}

function macroGauge(macro: "protein" | "carbs" | "fat" | "fiber") {
  const range = macroRecommendedRange(macro);
  if (!range) return null;
  const actual = dailyTotals.value?.[macro] ?? null;
  if (actual == null || !Number.isFinite(actual) || range.max <= 0) return null;

  const proteinWeightKg =
    macro === "protein" ? props.profile?.estimatedWeight ?? props.entry?.weight ?? null : null;
  const proteinInfiniteStart =
    macro === "protein" && proteinWeightKg && proteinWeightKg > 0 ? range.max : null;

  // For protein, use 1.5× the max as the scale so the bar shows room beyond the recommended range
  // (eating more protein than the max is generally fine). For other macros, scale to the max.
  const scaleMax =
    macro === "protein"
      ? Math.max(range.max * 1.5, actual, proteinInfiniteStart ? proteinInfiniteStart * 1.2 : 0)
      : Math.max(range.max, actual);
  const actualPct = Math.min(100, Math.max(0, (actual / scaleMax) * 100));
  const minPct = Math.min(100, Math.max(0, (range.min / scaleMax) * 100));
  const maxPct = Math.min(100, Math.max(0, (range.max / scaleMax) * 100));
  const infiniteStartPct =
    macro === "protein" && proteinInfiniteStart
      ? Math.min(100, Math.max(0, (proteinInfiniteStart / scaleMax) * 100))
      : 100;
  const state =
    actual < range.min ? "low" : macro !== "protein" && actual > range.max ? "high" : "ok";

  // Compute tick label transforms to prevent overflow at bar edges
  const minTickTransform = minPct <= 5 ? "translateX(0)" : "translateX(-50%)";
  const maxTickTransform = maxPct >= 95 ? "translateX(-100%)" : "translateX(-50%)";
  const endTickTransform = "translateX(-100%)";
  const label =
    macro === "protein"
      ? `${Math.round(range.min)}-${Math.round(range.max)}-∞`
      : formatRecommendedRange(range.min, range.max);

  return {
    actual,
    ...range,
    actualPct,
    minPct,
    maxPct,
    infiniteStartPct,
    state,
    label,
    maxLabel: macro === "protein" ? "∞" : undefined,
    minTickTransform,
    maxTickTransform,
    endTickTransform,
  };
}

function formatActual(value: number, unit: string) {
  return `${Math.round(value)} ${unit}`;
}

function formatRecommendedValue(gauge: { label: string; unit: string }) {
  return `${gauge.label} ${gauge.unit}`;
}

function macroEmoji(macro: "protein" | "carbs" | "fat" | "fiber") {
  if (macro === "protein") return "💪";
  if (macro === "carbs") return "🍚";
  if (macro === "fiber") return "🌿";
  return "🥑";
}

const proteinGauge = computed(() => macroGauge("protein"));
const carbsGauge = computed(() => macroGauge("carbs"));
const fatGauge = computed(() => macroGauge("fat"));
const fiberGauge = computed(() => macroGauge("fiber"));

type MacroShare = { protein: number; carbs: number; fat: number; total: number };
const macroShare = computed<MacroShare | null>(() => {
  const totals = dailyTotals.value;
  if (!totals) return null;
  const p = totals.protein;
  const c = totals.carbs;
  const f = totals.fat;
  if (p == null || c == null || f == null) return null;
  const proteinCalories = p * 4;
  const carbsCalories = c * 4;
  const fatCalories = f * 9;
  const total = proteinCalories + carbsCalories + fatCalories;
  if (!Number.isFinite(total) || total <= 0) return null;
  return { protein: proteinCalories, carbs: carbsCalories, fat: fatCalories, total };
});

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function describeWedge(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

type MacroPieSlice = {
  key: "protein" | "carbs" | "fat";
  label: string;
  percent: number;
  lines: string[];
  path: string;
  textX: number;
  textY: number;
  color: string;
};

const macroPieSlices = computed<MacroPieSlice[] | null>(() => {
  const share = macroShare.value;
  if (!share) return null;

  const totals = dailyTotals.value;
  if (!totals) return null;

  const proteinPct = (share.protein / share.total) * 100;
  const carbsPct = (share.carbs / share.total) * 100;
  const fatPct = Math.max(0, 100 - proteinPct - carbsPct);

  const slices = [
    { key: "protein" as const, percent: proteinPct, color: "#22c7db", grams: totals.protein ?? 0 },
    { key: "carbs" as const, percent: carbsPct, color: "#7fd36b", grams: totals.carbs ?? 0 },
    { key: "fat" as const, percent: fatPct, color: "#ee6a74", grams: totals.fat ?? 0 },
  ];

  // Build wedges clockwise from 0°.
  let angle = 0;
  const cx = 50;
  const cy = 50;
  const r = 48;
  const labelR = 30;

  return slices.map((slice) => {
    const start = angle;
    const end = angle + (slice.percent / 100) * 360;
    angle = end;

    const mid = (start + end) / 2;
    const pos = polarToCartesian(cx, cy, labelR, mid);
    const label = slice.key === "protein" ? t("protein") : slice.key === "carbs" ? t("carbs") : t("fat");
    const rounded = Math.round(slice.percent);
    const gramsRounded = Math.round(slice.grams);
    const lines =
      rounded >= 12
        ? [label, `${rounded}%`, `${gramsRounded}g`]
        : rounded >= 8
          ? [label, `${rounded}%`, `${gramsRounded}g`]
          : [`${rounded}%`];
    return {
      key: slice.key,
      label,
      percent: rounded,
      lines,
      path: describeWedge(cx, cy, r, start, end),
      textX: pos.x,
      textY: pos.y,
      color: slice.color,
    };
  });
});

const proteinPerEstimatedWeight = computed(() => {
  const protein = dailyTotals.value?.protein;
  const weight = props.profile?.estimatedWeight;
  if (protein == null || weight == null || weight <= 0) {
    return null;
  }

  return Math.round((protein / weight) * 10) / 10;
});

const proteinPerLeanBodyWeight = computed(() => {
  const protein = dailyTotals.value?.protein;
  const weight = props.profile?.estimatedWeight;
  const bodyFat = props.profile?.bodyFat;
  if (protein == null || weight == null || bodyFat == null || weight <= 0 || bodyFat < 0 || bodyFat >= 100) {
    return null;
  }

  const leanWeight = weight * (1 - bodyFat / 100);
  if (leanWeight <= 0) {
    return null;
  }

  return Math.round((protein / leanWeight) * 10) / 10;
});
</script>

<template>
  <BasePanel
    class="summary-panel"
    :class="{ 'results-flash': showNewResultsCue }"
    id="nutritionSummaryPanel"
    :title="t('nutritionSummary')"
    :helper="t('nutritionHelper')"
    collapsible
    :loading="isAnalyzing && !analysisError"
    :loading-overlay="Boolean(entry?.nutritionSnapshot)"
    :loading-title="t('analysisInProgressTitle')"
    :loading-helper="t('analyzeSlowNotice')"
  >
    <template #meta>
      <div class="meta-row">
        <span
          v-if="entry?.nutritionSnapshot?.sourceModel"
          class="status-pill status-pill--provider"
          dir="ltr"
        >
          AI Model: {{ entry.nutritionSnapshot.sourceModel }}
        </span>
        <span v-if="showCorrectionCue" class="status-pill" data-status="processing">
          {{ t("resultsUpdated") }}
        </span>
        <span class="status-pill" :data-status="isStale ? 'stale' : entry?.aiStatus ?? 'idle'">
          {{ isStale ? t("statusStale") : statusText }}
        </span>
      </div>
    </template>

      <template v-if="entry?.nutritionSnapshot">
        <div v-if="isStale" class="stale-box">
          <strong>{{ t("staleNutritionTitle") }}</strong>
          <p>{{ t("staleNutritionHelper") }}</p>
        </div>

      <div class="stats-grid">
        <div class="compact-stat compact-stat--calories">
          <strong>{{ t("calories") }}</strong>
          <span>{{ entry.nutritionSnapshot.dailyTotals.calories ?? "-" }}</span>
          <div v-if="macroPieSlices" class="macro-pie-inline">
            <svg class="macro-pie-svg" viewBox="0 0 100 100" role="img" aria-label="macros pie">
              <template v-for="slice in macroPieSlices" :key="slice.key">
                <path class="macro-pie-slice" :d="slice.path" :fill="slice.color" opacity="0.96"></path>
                <text
                  :x="slice.textX"
                  :y="slice.textY"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  class="macro-pie-text"
                  :title="`${slice.label}: ${slice.percent}%`"
                >
                  <tspan
                    v-for="(line, idx) in slice.lines"
                    :key="`${slice.key}-${idx}`"
                    :x="slice.textX"
                    :dy="
                      idx === 0
                        ? slice.lines.length === 1
                          ? 0
                          : slice.lines.length === 2
                            ? -4.5
                            : -10
                        : 10
                    "
                  >
                    {{ line }}
                  </tspan>
                </text>
              </template>
            </svg>
          </div>
        </div>
        <div class="compact-stat compact-stat--protein">
          <strong><span class="macro-heading-mark">{{ macroEmoji("protein") }}</span> {{ t("protein") }}</strong>
          <div class="macro-primary-line">
            <span class="macro-primary-value">{{ entry.nutritionSnapshot.dailyTotals.protein ?? "-" }}</span>
            <small class="stat-meta macro-inline-meta" v-if="macroPercent('protein') !== null">
              <span class="macro-percent-token" dir="ltr">{{ formatPercentToken(macroPercent("protein") ?? 0) }}</span>
              {{ t("macroShareOfCalories") }}
            </small>
          </div>
          <div v-if="proteinGauge" class="macro-gauge" :data-state="proteinGauge.state">
            <div class="macro-bar" aria-hidden="true">
              <div
                class="macro-bar__range"
                :style="{
                  left: `${proteinGauge.minPct}%`,
                  width: `${Math.max(0, proteinGauge.maxPct - proteinGauge.minPct)}%`,
                }"
              ></div>
              <div
                v-if="proteinGauge.infiniteStartPct < 100"
                class="macro-bar__protein-infinite"
                :style="{
                  left: `${proteinGauge.infiniteStartPct}%`,
                  width: `${Math.max(0, 100 - proteinGauge.infiniteStartPct)}%`,
                }"
              ></div>
              <div class="macro-bar__marker" :style="{ left: `${proteinGauge.actualPct}%` }"></div>
            </div>
            <div class="macro-bar__ticks" aria-hidden="true">
              <div class="macro-bar__tick" :style="{ left: `${proteinGauge.minPct}%`, transform: proteinGauge.minTickTransform }">
                <span>{{ Math.round(proteinGauge.min) }}</span>
              </div>
              <div class="macro-bar__tick" :style="{ left: `${proteinGauge.maxPct}%`, transform: proteinGauge.maxTickTransform }">
                <span>{{ Math.round(proteinGauge.max) }}</span>
              </div>
              <div class="macro-bar__tick macro-bar__tick--infinite" :style="{ left: '100%', transform: proteinGauge.endTickTransform }">
                <span>{{ proteinGauge.maxLabel ?? "∞" }}</span>
              </div>
            </div>
            <div class="stat-stack stat-stack--protein" :dir="locale === 'he' ? 'rtl' : 'ltr'">
              <small class="stat-meta macro-range-row">
                <span class="macro-range-label">{{ t("amount") }}:</span>
                <span class="macro-range-text">
                  <span class="macro-range-value" dir="ltr">{{ Math.round(proteinGauge.actual) }}</span>
                  <span class="macro-range-unit">{{ proteinGauge.unit }}</span>
                </span>
              </small>
              <small class="stat-meta macro-range-row">
                <span class="macro-range-label">{{ t("recommendedRange") }}:</span>
                <span class="macro-range-text">
                  <span class="macro-range-value" dir="ltr">{{ proteinGauge.label }}</span>
                  <span class="macro-range-unit">{{ proteinGauge.unit }}</span>
                </span>
              </small>
              <small class="stat-meta macro-range-row">
                <span class="macro-range-label">{{ t("proteinPerBodyWeight") }}:</span>
                <span class="macro-range-text">
                  <span class="macro-range-value" dir="ltr">{{ t("proteinRecommendedRatioRange") }}</span>
                </span>
              </small>
              <small class="stat-meta">{{ t("proteinNoUpperLimit") }}</small>
              <small
                v-if="proteinPerEstimatedWeight !== null || proteinPerLeanBodyWeight !== null"
                class="stat-meta protein-current-divider"
              >
                {{ t("currentLabel") }}
              </small>
              <small v-if="proteinPerEstimatedWeight !== null" class="stat-meta">
                <span class="macro-percent-token">{{ proteinPerEstimatedWeight }}</span>
                {{ t("proteinPerBodyWeight") }}
              </small>
              <small v-if="proteinPerLeanBodyWeight !== null" class="stat-meta">
                <span class="macro-percent-token">{{ proteinPerLeanBodyWeight }}</span>
                {{ t("proteinPerLeanBodyWeight") }}
              </small>
            </div>
          </div>
        </div>
        <div class="compact-stat compact-stat--carbs">
          <strong><span class="macro-heading-mark">{{ macroEmoji("carbs") }}</span> {{ t("carbs") }}</strong>
          <div class="macro-primary-line">
            <span class="macro-primary-value">{{ entry.nutritionSnapshot.dailyTotals.carbs ?? "-" }}</span>
            <small class="stat-meta macro-inline-meta" v-if="macroPercent('carbs') !== null">
              <span class="macro-percent-token" dir="ltr">{{ formatPercentToken(macroPercent("carbs") ?? 0) }}</span>
              {{ t("macroShareOfCalories") }}
            </small>
          </div>
          <div v-if="carbsGauge" class="macro-gauge" :data-state="carbsGauge.state">
            <div class="macro-bar" aria-hidden="true">
              <div
                class="macro-bar__range"
                :style="{
                  left: `${carbsGauge.minPct}%`,
                  width: `${Math.max(0, carbsGauge.maxPct - carbsGauge.minPct)}%`,
                }"
              ></div>
              <div class="macro-bar__marker" :style="{ left: `${carbsGauge.actualPct}%` }"></div>
            </div>
            <div class="macro-bar__ticks" aria-hidden="true">
              <div class="macro-bar__tick" :style="{ left: `${carbsGauge.minPct}%`, transform: carbsGauge.minTickTransform }">
                <span>{{ Math.round(carbsGauge.min) }}</span>
              </div>
              <div class="macro-bar__tick" :style="{ left: `${carbsGauge.maxPct}%`, transform: carbsGauge.maxTickTransform }">
                <span>{{ carbsGauge.maxLabel ?? Math.round(carbsGauge.max) }}</span>
              </div>
            </div>
            <div class="stat-stack">
              <small class="stat-meta">{{ formatActual(carbsGauge.actual, carbsGauge.unit) }}</small>
              <small class="stat-meta">{{ t("recommendedRange") }}: {{ formatRecommendedValue(carbsGauge) }}</small>
              <small class="stat-meta">{{ macroTargetText("carbs") }}</small>
            </div>
          </div>
        </div>
        <div class="compact-stat compact-stat--fat">
          <strong><span class="macro-heading-mark">{{ macroEmoji("fat") }}</span> {{ t("fat") }}</strong>
          <div class="macro-primary-line">
            <span class="macro-primary-value">{{ entry.nutritionSnapshot.dailyTotals.fat ?? "-" }}</span>
            <small class="stat-meta macro-inline-meta" v-if="macroPercent('fat') !== null">
              <span class="macro-percent-token" dir="ltr">{{ formatPercentToken(macroPercent("fat") ?? 0) }}</span>
              {{ t("macroShareOfCalories") }}
            </small>
          </div>
          <div v-if="fatGauge" class="macro-gauge" :data-state="fatGauge.state">
            <div class="macro-bar" aria-hidden="true">
              <div
                class="macro-bar__range"
                :style="{
                  left: `${fatGauge.minPct}%`,
                  width: `${Math.max(0, fatGauge.maxPct - fatGauge.minPct)}%`,
                }"
              ></div>
              <div class="macro-bar__marker" :style="{ left: `${fatGauge.actualPct}%` }"></div>
            </div>
            <div class="macro-bar__ticks" aria-hidden="true">
              <div class="macro-bar__tick" :style="{ left: `${fatGauge.minPct}%`, transform: fatGauge.minTickTransform }">
                <span>{{ Math.round(fatGauge.min) }}</span>
              </div>
              <div class="macro-bar__tick" :style="{ left: `${fatGauge.maxPct}%`, transform: fatGauge.maxTickTransform }">
                <span>{{ fatGauge.maxLabel ?? Math.round(fatGauge.max) }}</span>
              </div>
            </div>
            <div class="stat-stack">
              <small class="stat-meta">{{ formatActual(fatGauge.actual, fatGauge.unit) }}</small>
              <small class="stat-meta">{{ t("recommendedRange") }}: {{ formatRecommendedValue(fatGauge) }}</small>
              <small class="stat-meta">{{ macroTargetText("fat") }}</small>
            </div>
          </div>
        </div>
        <div class="compact-stat compact-stat--fiber">
          <strong><span class="macro-heading-mark">{{ macroEmoji("fiber") }}</span> {{ t("fiber") }}</strong>
          <div class="macro-primary-line">
            <span class="macro-primary-value">{{ entry.nutritionSnapshot.dailyTotals.fiber ?? "-" }}</span>
            <small class="stat-meta macro-inline-meta macro-inline-meta--placeholder">{{ t("macroShareOfCalories") }}</small>
          </div>
          <div v-if="fiberGauge" class="macro-gauge" :data-state="fiberGauge.state">
            <div class="macro-bar" aria-hidden="true">
              <div
                class="macro-bar__range"
                :style="{
                  left: `${fiberGauge.minPct}%`,
                  width: `${Math.max(0, fiberGauge.maxPct - fiberGauge.minPct)}%`,
                }"
              ></div>
              <div class="macro-bar__marker" :style="{ left: `${fiberGauge.actualPct}%` }"></div>
            </div>
            <div class="macro-bar__ticks" aria-hidden="true">
              <div class="macro-bar__tick" :style="{ left: `${fiberGauge.minPct}%`, transform: fiberGauge.minTickTransform }">
                <span>{{ Math.round(fiberGauge.min) }}</span>
              </div>
              <div class="macro-bar__tick" :style="{ left: `${fiberGauge.maxPct}%`, transform: fiberGauge.maxTickTransform }">
                <span>{{ fiberGauge.maxLabel ?? Math.round(fiberGauge.max) }}</span>
              </div>
            </div>
            <div class="stat-stack">
              <small class="stat-meta">{{ formatActual(fiberGauge.actual, fiberGauge.unit) }}</small>
              <small class="stat-meta">{{ t("recommendedRange") }}: {{ formatRecommendedValue(fiberGauge) }}</small>
              <small class="stat-meta">{{ macroTargetText("fiber") }}</small>
            </div>
          </div>
        </div>
      </div>

      <details v-if="visibleUnmatchedItems.length" class="notes-panel">
        <summary class="notes-summary">{{ t("unmatchedItems") }}</summary>
        <div class="notes">
          <ul>
            <li v-for="item in visibleUnmatchedItems" :key="item">{{ item }}</li>
          </ul>
        </div>
      </details>

      <div class="meals">
        <div
          class="meal-block"
          v-for="meal in editableMeals"
          :key="meal.id"
          :style="mealBlockStyle(meal.color)"
          :data-testid="`meal-block-${meal.id}`"
        >
          <div class="meal-header">
            <strong>{{ displayMealLabel(meal.mealKey, meal.mealLabel) }}</strong>
          </div>

          <div class="meal-table-wrap">
            <table class="meal-table">
              <colgroup>
                <col class="meal-col-food" />
                <col class="meal-col-amount" />
                <col class="meal-col-grams" />
                <col class="meal-col-calories" />
                <col class="meal-col-per100" />
                <col class="meal-col-protein" />
                <col class="meal-col-carbs" />
                <col class="meal-col-fat" />
                <col class="meal-col-fiber" />
                <col class="meal-col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>{{ t("foodBreakdown") }}</th>
                  <th>{{ t("amount") }}</th>
                  <th>{{ t("grams") }}</th>
                  <th>{{ t("calories") }}</th>
                  <th>{{ t("kcalPer100gHeader") }}</th>
                  <th>
                    <span class="macro-heading">
                      <span class="macro-heading-mark">{{ macroEmoji("protein") }}</span>
                      <span class="macro-heading-text"> {{ t("protein") }}</span>
                    </span>
                  </th>
                  <th>
                    <span class="macro-heading">
                      <span class="macro-heading-mark">{{ macroEmoji("carbs") }}</span>
                      <span class="macro-heading-text"> {{ t("carbs") }}</span>
                    </span>
                  </th>
                  <th>
                    <span class="macro-heading">
                      <span class="macro-heading-mark">{{ macroEmoji("fat") }}</span>
                      <span class="macro-heading-text"> {{ t("fat") }}</span>
                    </span>
                  </th>
                  <th>
                    <span class="macro-heading">
                      <span class="macro-heading-mark">{{ macroEmoji("fiber") }}</span>
                      <span class="macro-heading-text"> {{ t("fiber") }}</span>
                    </span>
                  </th>
                  <th>{{ t("foodActions") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="food in meal.foods" :key="food.id">
                  <td class="food-cell">
                    <div class="food-name">{{ primaryFoodName(food) }}</div>
                    <div v-if="secondaryFoodName(food)" class="food-alt-name">
                      {{ secondaryFoodName(food) }}
                    </div>
                    <small v-if="food.needsReview || food.assumptions.length" class="food-meta">
                      {{ foodMetaText(food) }}
                    </small>
                  </td>
                  <td class="amount-cell">{{ displayAmountText(food) }}</td>
                  <td>
                    <input
                      :class="{ 'is-estimated': food.gramsEstimated }"
                      type="number"
                      :value="food.grams ?? ''"
                      :data-testid="`food-input-${food.id}-grams`"
                      @input="onFoodInput(food.id, 'grams', $event)"
                      @blur="commitFoodEdit(food.id)"
                    />
                    <small v-if="food.gramsEstimated" class="estimated-cue">
                      {{ t("estimatedValue") }}
                    </small>
                  </td>
                  <td>
                    <input
                      :class="{ 'is-estimated': food.caloriesEstimated }"
                      type="number"
                      :value="food.calories ?? ''"
                      :data-testid="`food-input-${food.id}-calories`"
                      @input="onFoodInput(food.id, 'calories', $event)"
                      @blur="commitFoodEdit(food.id)"
                    />
                    <small v-if="food.caloriesEstimated" class="estimated-cue">
                      {{ t("estimatedValue") }}
                    </small>
                  </td>
                  <td>
                    <input
                      class="per100-input"
                      type="number"
                      :value="food.caloriesPer100g ?? ''"
                      :placeholder="t('usuallyDerived')"
                      :data-testid="`food-input-${food.id}-caloriesPer100g`"
                      @input="onFoodInput(food.id, 'caloriesPer100g', $event)"
                      @blur="commitFoodEdit(food.id)"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      :value="food.protein ?? ''"
                      :data-testid="`food-input-${food.id}-protein`"
                      @input="onFoodInput(food.id, 'protein', $event)"
                      @blur="commitFoodEdit(food.id)"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      :value="food.carbs ?? ''"
                      :data-testid="`food-input-${food.id}-carbs`"
                      @input="onFoodInput(food.id, 'carbs', $event)"
                      @blur="commitFoodEdit(food.id)"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      :value="food.fat ?? ''"
                      :data-testid="`food-input-${food.id}-fat`"
                      @input="onFoodInput(food.id, 'fat', $event)"
                      @blur="commitFoodEdit(food.id)"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      :value="food.fiber ?? ''"
                      :data-testid="`food-input-${food.id}-fiber`"
                      @input="onFoodInput(food.id, 'fiber', $event)"
                      @blur="commitFoodEdit(food.id)"
                    />
                  </td>
                  <td class="action-cell">
                    <button
                      class="row-action-menu__toggle"
                      type="button"
                      @click="openRowActionMenu(food)"
                      :aria-label="t('foodActions')"
                    >
                      ⋯
                    </button>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="meal-total-row">
                  <td class="food-cell meal-total-label">
                    <span class="food-name">{{ t("mealTotal") }}</span>
                  </td>
                  <td></td>
                  <td></td>
                  <td>
                    <input
                      type="number"
                      :value="editableMealTotals[meal.id]?.calories ?? ''"
                      :data-testid="`meal-total-input-${meal.id}-calories`"
                      @input="updateMealTotal(meal.id, 'calories', ($event.target as HTMLInputElement).value)"
                      @blur="commitMealTotalEdit(meal.id)"
                    />
                  </td>
                  <td></td>
                  <td>
                    <input
                      type="number"
                      :value="editableMealTotals[meal.id]?.protein ?? ''"
                      :data-testid="`meal-total-input-${meal.id}-protein`"
                      @input="updateMealTotal(meal.id, 'protein', ($event.target as HTMLInputElement).value)"
                      @blur="commitMealTotalEdit(meal.id)"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      :value="editableMealTotals[meal.id]?.carbs ?? ''"
                      :data-testid="`meal-total-input-${meal.id}-carbs`"
                      @input="updateMealTotal(meal.id, 'carbs', ($event.target as HTMLInputElement).value)"
                      @blur="commitMealTotalEdit(meal.id)"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      :value="editableMealTotals[meal.id]?.fat ?? ''"
                      :data-testid="`meal-total-input-${meal.id}-fat`"
                      @input="updateMealTotal(meal.id, 'fat', ($event.target as HTMLInputElement).value)"
                      @blur="commitMealTotalEdit(meal.id)"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      :value="editableMealTotals[meal.id]?.fiber ?? ''"
                      :data-testid="`meal-total-input-${meal.id}-fiber`"
                      @input="updateMealTotal(meal.id, 'fiber', ($event.target as HTMLInputElement).value)"
                      @blur="commitMealTotalEdit(meal.id)"
                    />
                  </td>
                  <td class="action-cell"></td>
                </tr>
              </tfoot>
            </table>

            <div class="meal-cards" aria-label="Meal foods">
              <div v-for="food in meal.foods" :key="`card-${food.id}`" class="food-card">
                <div class="food-card__head">
                  <div class="food-name">{{ primaryFoodName(food) }}</div>
                  <div v-if="secondaryFoodName(food)" class="food-alt-name">
                    {{ secondaryFoodName(food) }}
                  </div>
                  <small v-if="food.needsReview || food.assumptions.length" class="food-meta">
                    {{ foodMetaText(food) }}
                  </small>
                </div>

                <div class="food-card__grid">
                  <div class="kv">
                    <div class="k">{{ t("amount") }}</div>
                    <div class="v">{{ displayAmountText(food) }}</div>
                  </div>

                  <label class="kv">
                    <div class="k">{{ t("grams") }}</div>
                    <div class="v">
                      <input
                        :class="{ 'is-estimated': food.gramsEstimated }"
                        type="number"
                        :value="food.grams ?? ''"
                        @input="onFoodInput(food.id, 'grams', $event)"
                        @blur="commitFoodEdit(food.id)"
                      />
                      <small v-if="food.gramsEstimated" class="estimated-cue">
                        {{ t("estimatedValue") }}
                      </small>
                    </div>
                  </label>

                  <label class="kv">
                    <div class="k">{{ t("calories") }}</div>
                    <div class="v">
                      <input
                        :class="{ 'is-estimated': food.caloriesEstimated }"
                        type="number"
                        :value="food.calories ?? ''"
                        @input="onFoodInput(food.id, 'calories', $event)"
                        @blur="commitFoodEdit(food.id)"
                      />
                      <small v-if="food.caloriesEstimated" class="estimated-cue">
                        {{ t("estimatedValue") }}
                      </small>
                    </div>
                  </label>

                  <label class="kv">
                    <div class="k">{{ t("kcalPer100gLabel") }}</div>
                    <div class="v">
                      <input
                        class="per100-input"
                        type="number"
                        :value="food.caloriesPer100g ?? ''"
                        @input="onFoodInput(food.id, 'caloriesPer100g', $event)"
                        @blur="commitFoodEdit(food.id)"
                      />
                    </div>
                  </label>

                  <label class="kv">
                    <div class="k">
                      <span class="macro-heading">
                        <span class="macro-heading-mark">{{ macroEmoji("protein") }}</span>
                        <span class="macro-heading-text">{{ t("protein") }}</span>
                      </span>
                    </div>
                    <div class="v">
                      <input
                        type="number"
                        :value="food.protein ?? ''"
                        @input="onFoodInput(food.id, 'protein', $event)"
                        @blur="commitFoodEdit(food.id)"
                      />
                    </div>
                  </label>
                  <label class="kv">
                    <div class="k">
                      <span class="macro-heading">
                        <span class="macro-heading-mark">{{ macroEmoji("carbs") }}</span>
                        <span class="macro-heading-text">{{ t("carbs") }}</span>
                      </span>
                    </div>
                    <div class="v">
                      <input
                        type="number"
                        :value="food.carbs ?? ''"
                        @input="onFoodInput(food.id, 'carbs', $event)"
                        @blur="commitFoodEdit(food.id)"
                      />
                    </div>
                  </label>
                  <label class="kv">
                    <div class="k">
                      <span class="macro-heading">
                        <span class="macro-heading-mark">{{ macroEmoji("fat") }}</span>
                        <span class="macro-heading-text">{{ t("fat") }}</span>
                      </span>
                    </div>
                    <div class="v">
                      <input
                        type="number"
                        :value="food.fat ?? ''"
                        @input="onFoodInput(food.id, 'fat', $event)"
                        @blur="commitFoodEdit(food.id)"
                      />
                    </div>
                  </label>
                  <label class="kv">
                    <div class="k">
                      <span class="macro-heading">
                        <span class="macro-heading-mark">{{ macroEmoji("fiber") }}</span>
                        <span class="macro-heading-text">{{ t("fiber") }}</span>
                      </span>
                    </div>
                    <div class="v">
                      <input
                        type="number"
                        :value="food.fiber ?? ''"
                        @input="onFoodInput(food.id, 'fiber', $event)"
                        @blur="commitFoodEdit(food.id)"
                      />
                    </div>
                  </label>
                </div>

                <div class="food-card__actions">
                  <div class="card-action-links">
                    <button class="card-action-link" type="button" @click="openRowActionMenu(food)">
                      {{ t("foodActions") }}
                    </button>
                  </div>
                </div>
              </div>
              <div class="food-card meal-total-card">
                <div class="food-card__head">
                  <div class="food-name">{{ t("mealTotal") }}</div>
                </div>
                <div class="food-card__grid">
                  <label class="kv">
                    <div class="k">{{ t("calories") }}</div>
                    <div class="v">
                      <input
                        type="number"
                        :value="editableMealTotals[meal.id]?.calories ?? ''"
                        @input="updateMealTotal(meal.id, 'calories', ($event.target as HTMLInputElement).value)"
                        @blur="commitMealTotalEdit(meal.id)"
                      />
                    </div>
                  </label>
                  <label class="kv">
                    <div class="k">
                      <span class="macro-heading">
                        <span class="macro-heading-mark">{{ macroEmoji("protein") }}</span>
                        <span class="macro-heading-text">{{ t("protein") }}</span>
                      </span>
                    </div>
                    <div class="v">
                      <input
                        type="number"
                        :value="editableMealTotals[meal.id]?.protein ?? ''"
                        @input="updateMealTotal(meal.id, 'protein', ($event.target as HTMLInputElement).value)"
                        @blur="commitMealTotalEdit(meal.id)"
                      />
                    </div>
                  </label>
                  <label class="kv">
                    <div class="k">
                      <span class="macro-heading">
                        <span class="macro-heading-mark">{{ macroEmoji("carbs") }}</span>
                        <span class="macro-heading-text">{{ t("carbs") }}</span>
                      </span>
                    </div>
                    <div class="v">
                      <input
                        type="number"
                        :value="editableMealTotals[meal.id]?.carbs ?? ''"
                        @input="updateMealTotal(meal.id, 'carbs', ($event.target as HTMLInputElement).value)"
                        @blur="commitMealTotalEdit(meal.id)"
                      />
                    </div>
                  </label>
                  <label class="kv">
                    <div class="k">
                      <span class="macro-heading">
                        <span class="macro-heading-mark">{{ macroEmoji("fat") }}</span>
                        <span class="macro-heading-text">{{ t("fat") }}</span>
                      </span>
                    </div>
                    <div class="v">
                      <input
                        type="number"
                        :value="editableMealTotals[meal.id]?.fat ?? ''"
                        @input="updateMealTotal(meal.id, 'fat', ($event.target as HTMLInputElement).value)"
                        @blur="commitMealTotalEdit(meal.id)"
                      />
                    </div>
                  </label>
                  <label class="kv">
                    <div class="k">
                      <span class="macro-heading">
                        <span class="macro-heading-mark">{{ macroEmoji("fiber") }}</span>
                        <span class="macro-heading-text">{{ t("fiber") }}</span>
                      </span>
                    </div>
                    <div class="v">
                      <input
                        type="number"
                        :value="editableMealTotals[meal.id]?.fiber ?? ''"
                        @input="updateMealTotal(meal.id, 'fiber', ($event.target as HTMLInputElement).value)"
                        @blur="commitMealTotalEdit(meal.id)"
                      />
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
      <div v-if="dailyTotals" class="day-total-line">
        <span class="meal-total">
          {{ t("dayTotal") }}: <strong>{{ dailyTotals.calories ?? "-" }}</strong> {{ t("unitKcal") }} /
          {{ macroEmoji("protein") }} {{ t("protein") }} {{ dailyTotals.protein ?? "-" }} /
          {{ macroEmoji("carbs") }} {{ t("carbs") }} {{ dailyTotals.carbs ?? "-" }} /
          {{ macroEmoji("fat") }} {{ t("fat") }} {{ dailyTotals.fat ?? "-" }} /
          {{ macroEmoji("fiber") }} {{ t("fiber") }} {{ dailyTotals.fiber ?? "-" }}
        </span>
      </div>

      <!-- Action dialogs (outside table for proper rendering) -->
      <template v-for="meal in editableMeals" :key="`meal-dialogs-${meal.id}`">
        <dialog
          v-for="food in meal.foods"
          :key="`dialog-${food.id}`"
          :id="`action-menu-${food.id}`"
          class="row-action-menu__dialog"
          @click.self="closeRowActionMenu(food)"
        >
          <div class="row-action-menu__header">
            <button
              class="row-action-menu__close"
              type="button"
              @click="closeRowActionMenu(food)"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div class="row-action-menu__content">
            <div class="macro-assistant">
              <div class="macro-assistant__title">{{ t("macroAssistantTitle") }}</div>
              <p class="macro-assistant__subtitle">{{ t("macroAssistantSubtitle") }}</p>

              <div class="macro-assistant__mode-switch" role="tablist" :aria-label="t('macroAssistantSourceTitle')">
                <button
                  type="button"
                  class="macro-assistant__mode-btn"
                  :class="{ 'is-active': (macroAssistantSourceMode[food.id] ?? 'ai') === 'ai' }"
                  @click="setMacroAssistantSourceMode(food.id, 'ai')"
                >
                  {{ t("macroSourceAi") }}
                </button>
                <button
                  type="button"
                  class="macro-assistant__mode-btn"
                  :class="{ 'is-active': (macroAssistantSourceMode[food.id] ?? 'ai') === 'url' }"
                  @click="setMacroAssistantSourceMode(food.id, 'url')"
                >
                  {{ t("macroSourceUrlMode") }}
                </button>
              </div>

              <div v-if="(macroAssistantSourceMode[food.id] ?? 'ai') === 'ai'" class="macro-assistant__actions">
                <button
                  class="secondary-action"
                  type="button"
                  :disabled="Boolean(aiLookupLoading[food.id])"
                  @click="runAiMacroLookup(food, 'search')"
                >
                  {{ aiLookupLoading[food.id] ? t("aiSearchingMacros") : t("aiSearchMacros") }}
                </button>
              </div>

              <div v-if="(macroAssistantSourceMode[food.id] ?? 'ai') === 'url'" class="macro-assistant__actions">
                <label class="macro-assistant__url-label">
                  <span>{{ t("macroSourceUrl") }}</span>
                  <input
                    type="url"
                    dir="ltr"
                    :value="sourceUrlDrafts[food.id] ?? ''"
                    :placeholder="t('macroSourceUrlPlaceholder')"
                    @input="setSourceUrlDraft(food.id, ($event.target as HTMLInputElement).value)"
                  />
                </label>
                <p class="per100-macro-editor__hint macro-assistant__url-hint">{{ t("macroSourceUrlHint") }}</p>

                <button
                  class="secondary-action"
                  type="button"
                  :disabled="Boolean(aiLookupLoading[food.id]) || !(sourceUrlDrafts[food.id] ?? '').trim()"
                  @click="runAiMacroLookup(food, 'url')"
                >
                  {{ aiLookupLoading[food.id] ? t("aiReadingUrl") : t("aiReadUrlMacros") }}
                </button>
              </div>

              <a
                class="macro-assistant__fallback-link"
                :href="nutritionLookupUrl(food)"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ t("findMacrosByLink") }}
              </a>

              <div v-if="macroLookupErrorPresentation(food.id).message" class="error-box">
                <strong>{{ t("aiError") }}</strong>
                <p>{{ macroLookupErrorPresentation(food.id).message }}</p>
                <p
                  v-if="macroLookupErrorPresentation(food.id).retryModelLabel && macroLookupErrorPresentation(food.id).retryModelId"
                  class="error-box__retry"
                  dir="ltr"
                >
                  <span>{{ t("analysisRetrySuggestionPrefix") }}</span>
                  <a
                    class="inline-action-link"
                    href="#"
                    @click.prevent="retryMacroLookupWithModel(food, macroLookupErrorPresentation(food.id).retryModelId ?? '')"
                  >
                    {{ macroLookupErrorPresentation(food.id).retryModelLabel }}
                  </a>
                  <span>{{ t("analysisRetrySuggestionInstead") }}</span>
                </p>
              </div>

              <div class="macro-assistant__manual-title">{{ t("providePer100Macros") }}</div>
              <p class="per100-macro-editor__hint">{{ t("macroManualHint") }}</p>
              <p v-if="!(food.grams != null && Number.isFinite(food.grams) && food.grams > 0)" class="per100-macro-editor__hint">
                {{ t("providePer100NeedsGrams") }}
              </p>
              <div class="per100-macro-editor__grid">
                <label>
                  <span>{{ t("protein") }}</span>
                  <input
                    type="number"
                    :value="per100MacroDrafts[food.id]?.protein ?? ''"
                    @input="setPer100MacroDraft(food.id, 'protein', ($event.target as HTMLInputElement).value)"
                  />
                </label>
                <label>
                  <span>{{ t("carbs") }}</span>
                  <input
                    type="number"
                    :value="per100MacroDrafts[food.id]?.carbs ?? ''"
                    @input="setPer100MacroDraft(food.id, 'carbs', ($event.target as HTMLInputElement).value)"
                  />
                </label>
                <label>
                  <span>{{ t("fat") }}</span>
                  <input
                    type="number"
                    :value="per100MacroDrafts[food.id]?.fat ?? ''"
                    @input="setPer100MacroDraft(food.id, 'fat', ($event.target as HTMLInputElement).value)"
                  />
                </label>
                <label>
                  <span>{{ t("fiber") }}</span>
                  <input
                    type="number"
                    :value="per100MacroDrafts[food.id]?.fiber ?? ''"
                    @input="setPer100MacroDraft(food.id, 'fiber', ($event.target as HTMLInputElement).value)"
                  />
                </label>
                <label>
                  <span>{{ t("solubleFiber") }}</span>
                  <input
                    type="number"
                    :value="per100MacroDrafts[food.id]?.solubleFiber ?? ''"
                    @input="setPer100MacroDraft(food.id, 'solubleFiber', ($event.target as HTMLInputElement).value)"
                  />
                </label>
                <label>
                  <span>{{ t("insolubleFiber") }}</span>
                  <input
                    type="number"
                    :value="per100MacroDrafts[food.id]?.insolubleFiber ?? ''"
                    @input="setPer100MacroDraft(food.id, 'insolubleFiber', ($event.target as HTMLInputElement).value)"
                  />
                </label>
              </div>
              <button
                class="secondary-action"
                type="button"
                :disabled="!(food.grams != null && Number.isFinite(food.grams) && food.grams > 0)"
                @click="applyPer100MacroData(food)"
              >
                {{ t("applyPer100Macros") }}
              </button>
            </div>

            <div class="macro-assistant__save-actions">
              <button
                class="secondary-action"
                type="button"
                @click="emitSaveCorrectionOnlyFromMenu(food)"
              >
                {{ t("saveFixOnlyTable") }}
              </button>
              <button
                class="secondary-action"
                type="button"
                @click="emitSaveCorrectionFromMenu(food)"
              >
                {{ t("saveFixTable") }}
              </button>
            </div>
          </div>
        </dialog>
      </template>
    </template>

    <div v-else-if="analysisError" class="error-box error-box--center">
      <strong>{{ t("aiError") }}</strong>
      <p>{{ analysisError }}</p>
      <p v-if="analysisRetryModelLabel && analysisRetryModelId" class="error-box__retry" dir="ltr">
        <span>{{ t("analysisRetrySuggestionPrefix") }}</span>
        <a
          class="inline-action-link"
          href="#"
          @click.prevent="emit('retry-analysis-with-model', analysisRetryModelId)"
        >
          {{ analysisRetryModelLabel }}
        </a>
        <span>{{ t("analysisRetrySuggestionInstead") }}</span>
      </p>
    </div>

    <p v-else>{{ t("noNutritionYet") }}</p>
  </BasePanel>
</template>

<style scoped>
.summary-panel {
  align-self: start;
}

.error-box__retry {
  margin: 0.35rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: baseline;
  min-inline-size: 0;
  overflow-wrap: anywhere;
}

.inline-action-link {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 0.12em;
  cursor: pointer;
}

.results-flash :deep(.panel__body) {
  animation: resultsFlash 1350ms ease-out 1;
}

@keyframes resultsFlash {
  0% {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
    filter: brightness(1.08);
  }
  60% {
    box-shadow: 0 0 0 2px transparent;
    filter: brightness(1);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
    filter: brightness(1);
  }
}

.status-pill {
  padding: 0.35rem 0.55rem;
  background: var(--pill);
  color: var(--pill-text);
  border: 1px solid var(--border-strong);
  border-radius: 0;
  box-shadow: var(--bevel-raised);
  white-space: nowrap;
  font-size: 0.9rem;
}

.meta-row {
  display: inline-flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  align-items: center;
}

.status-pill[data-status="failed"] {
  background: #7a3333;
  color: #fff1f1;
  border-color: #4d1c1c;
}

.status-pill[data-status="done"] {
  background: #1f5d47;
  color: #f1fff7;
}

.status-pill[data-status="processing"] {
  background: #67511f;
  color: #fff9e7;
}

.status-pill[data-status="stale"] {
  background: #d9b0ad;
  color: #641f1f;
  border-color: #7c2d2d;
}

.status-pill--provider {
  background: color-mix(in srgb, var(--surface-2) 84%, #2a5f7a 16%);
  color: color-mix(in srgb, white 82%, #7fd3ff 18%);
  border-color: color-mix(in srgb, var(--border-strong) 60%, #4f93b4 40%);
  max-inline-size: min(48vw, 32rem);
  overflow: hidden;
  text-overflow: ellipsis;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 8px;
  margin-block-start: 10px;
  align-items: stretch;
}

.compact-stat {
  display: grid;
  gap: 4px;
  align-content: start;
  min-inline-size: 0;
  block-size: 100%;
}

.compact-stat--protein,
.compact-stat--carbs,
.compact-stat--fat,
.compact-stat--fiber {
  border: 1px solid color-mix(in srgb, var(--macro-accent) 42%, var(--border));
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--macro-accent) 14%, var(--surface-2)) 0%,
      color-mix(in srgb, var(--macro-accent) 6%, var(--surface)) 100%
    );
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 10%, transparent);
}

.compact-stat--protein {
  --macro-accent: #19b6c9;
  --protein-bar-gradient: linear-gradient(
    90deg,
    color-mix(in srgb, var(--macro-accent) 28%, transparent) 0%,
    color-mix(in srgb, var(--macro-accent) 48%, transparent) 55%,
    color-mix(in srgb, var(--macro-accent) 68%, white 20%) 100%
  );
}

.compact-stat--carbs {
  --macro-accent: #7bcf67;
}

.compact-stat--fat {
  --macro-accent: #d45b63;
}

.compact-stat--fiber {
  --macro-accent: #58b97f;
}

.macro-heading {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
}

.macro-heading-mark {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}

.macro-heading-text {
  line-height: 1.1;
}

.compact-stat--protein strong,
.compact-stat--carbs strong,
.compact-stat--fat strong,
.compact-stat--fiber strong {
  color: color-mix(in srgb, var(--macro-accent) 62%, var(--text-primary));
}

.compact-stat--protein > span,
.compact-stat--carbs > span,
.compact-stat--fat > span,
.compact-stat--fiber > span {
  color: color-mix(in srgb, var(--macro-accent) 78%, white 22%);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
}

.compact-stat--calories {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 6px;
}

.compact-stat--calories .macro-pie-inline {
  align-self: stretch;
  justify-self: stretch;
  min-block-size: 200px;
}

.compact-stat > span {
  font-variant-numeric: tabular-nums;
}

.stat-meta {
  display: block;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.stat-helper {
  display: block;
  color: var(--text-muted);
  line-height: 1.3;
  min-block-size: 0;
  overflow-wrap: anywhere;
}

.compact-stat--protein .stat-meta,
.compact-stat--protein .stat-helper,
.compact-stat--carbs .stat-meta,
.compact-stat--carbs .stat-helper,
.compact-stat--fat .stat-meta,
.compact-stat--fat .stat-helper,
.compact-stat--fiber .stat-meta,
.compact-stat--fiber .stat-helper {
  color: color-mix(in srgb, var(--macro-accent) 38%, var(--text-primary));
}

.stat-meta + .stat-meta,
.stat-meta + .stat-helper {
  margin-block-start: 2px;
}

.stat-stack {
  display: grid;
  gap: 2px;
  min-inline-size: 0;
}

.stat-stack--protein {
  /* Keep all protein value lines aligned while leaving enough width to avoid overflow in Hebrew. */
  --protein-range-label-width: 8.5rem;
}

.stat-stack--protein[dir="rtl"] {
  text-align: start;
}

.macro-range-value {
  direction: ltr;
  unicode-bidi: isolate;
  display: inline-block;
}

.macro-range-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 0.5rem;
  align-items: end;
  inline-size: 100%;
  min-inline-size: 0;
}

.macro-range-label {
  display: inline-block;
  text-align: end;
  min-inline-size: 0;
  overflow-wrap: anywhere;
}

.macro-range-text {
  display: inline-flex;
  justify-self: end;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.25rem;
  min-inline-size: 0;
  text-align: end;
}

.macro-range-unit {
  direction: rtl;
  unicode-bidi: isolate;
}

.stat-stack--protein .macro-range-row {
  grid-template-columns: var(--protein-range-label-width) minmax(0, 1fr);
}

.stat-stack--protein[dir="rtl"] .macro-range-row {
  grid-template-columns: var(--protein-range-label-width) minmax(0, 1fr);
}

.stat-stack--protein[dir="rtl"] .macro-range-label {
  text-align: start;
}

.stat-stack--protein[dir="rtl"] .macro-range-text {
  justify-self: start;
  justify-content: flex-start;
  text-align: start;
}

.stat-stack--protein .macro-range-text {
  flex-wrap: nowrap;
  white-space: nowrap;
}

.macro-gauge {
  margin-block-start: 4px;
  display: grid;
  gap: 4px;
}

.macro-bar {
  position: relative;
  block-size: 10px;
  border: 1px solid var(--border);
  background: var(--surface-3);
  box-shadow: var(--bevel-sunken);
}

.compact-stat--protein .macro-bar {
  background:
    linear-gradient(
      90deg,
      var(--surface-3) 0%,
      var(--surface-3) 48%,
      color-mix(in srgb, var(--macro-accent) 28%, transparent) 60%,
      color-mix(in srgb, var(--macro-accent) 48%, transparent) 78%,
      color-mix(in srgb, var(--macro-accent) 68%, white 20%) 100%
    );
}

.macro-bar__range {
  position: absolute;
  inset-block: 0;
  background: color-mix(in srgb, #27ae60 32%, transparent);
  z-index: 1;
}

.macro-bar__protein-infinite {
  position: absolute;
  inset-block: 0;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--protein-infinite-accent) 56%, transparent),
    color-mix(in srgb, var(--protein-infinite-accent) 44%, transparent)
  );
  z-index: 0;
}

.compact-stat--protein .macro-bar__range,
.compact-stat--carbs .macro-bar__range,
.compact-stat--fat .macro-bar__range,
.compact-stat--fiber .macro-bar__range {
  background: color-mix(in srgb, var(--macro-accent) 44%, transparent);
}

.compact-stat--protein .macro-bar__range {
  background: transparent;
}

.compact-stat--protein .macro-bar__protein-infinite {
  background: transparent;
}

.compact-stat--protein .macro-bar__marker,
.compact-stat--carbs .macro-bar__marker,
.compact-stat--fat .macro-bar__marker,
.compact-stat--fiber .macro-bar__marker {
  background: color-mix(in srgb, var(--macro-accent) 88%, white 12%);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--bg) 68%, transparent);
}

.macro-bar__marker {
  position: absolute;
  inset-block: -2px;
  inline-size: 2px;
  background: color-mix(in srgb, var(--text-primary) 85%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--bg) 75%, transparent);
  z-index: 2;
}

.macro-primary-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: nowrap;
  min-block-size: 1.25rem;
}

.macro-primary-value {
  white-space: nowrap;
}

.macro-inline-meta {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-inline-size: 70%;
  opacity: 0.9;
}

.macro-inline-meta--placeholder {
  visibility: hidden;
}

.macro-percent-token {
  unicode-bidi: isolate;
  margin-inline-end: 0.25ch;
}

.protein-current-divider {
  margin-block-start: 0.2rem;
  padding-block-start: 0.28rem;
  border-block-start: 1px solid color-mix(in srgb, var(--border-strong) 45%, transparent);
  font-weight: 700;
}

.macro-bar__ticks {
  position: relative;
  block-size: 1rem;
  /* Prevent tick labels that sit at the bar edges from overflowing into the page
     scroll area (especially noticeable in RTL/Hebrew where physical-left overflow
     is the natural scroll direction). The tick transforms already align edge ticks
     inside the bar; this clip is a safety net for any remaining sub-pixel bleed. */
  overflow-x: clip;
}

.macro-bar__tick {
  position: absolute;
  inset-block-start: 2px;
  transform: translateX(-50%);
  font-size: 0.72rem;
  line-height: 1;
  color: var(--text-muted);
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

.macro-bar__tick--infinite {
  font-size: 0.92rem;
  line-height: 0.9;
}

.macro-pie-inline {
  display: grid;
  gap: 6px;
  margin-block-start: 8px;
  inline-size: 100%;
}

.macro-pie-svg {
  inline-size: 100%;
  width: 100%;
  aspect-ratio: 1 / 1;
  block-size: auto;
  height: auto;
  display: block;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  box-shadow: var(--bevel-sunken);
  background: var(--surface-3);
}

.macro-pie-slice {
  stroke: color-mix(in srgb, var(--bg) 82%, white 18%);
  stroke-width: 1.35px;
  stroke-linejoin: round;
}

.macro-pie-text {
  fill: rgba(255, 255, 255, 0.92);
  font-weight: 800;
  font-size: 11px;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.35);
  stroke-width: 2px;
}

.notes,
.meals {
  display: grid;
  gap: 8px;
  margin-block-start: 10px;
}

.notes {
  min-inline-size: 0;
}

.notes ul {
  margin: 0;
  padding-inline-start: 1.25rem;
}

.notes li {
  overflow-wrap: anywhere;
}

.notes-panel {
  margin-block-start: 10px;
  border: 1px solid var(--border-strong);
  background: var(--surface-3);
  padding: 8px;
  box-shadow: var(--bevel-sunken);
}

.notes-summary {
  cursor: pointer;
  color: var(--text-muted);
  font-weight: 600;
}

.error-box {
  display: grid;
  gap: 6px;
  margin-block-start: 10px;
  padding: 8px;
  border: 2px solid #000;
  border-color: #808080 #fff #fff #808080;
  border-inline-start-color: #7a0000;
  border-inline-start-width: 6px;
  background: var(--panel);
  color: #7a0000;
}

.error-box--center {
  min-block-size: 16rem;
  place-content: center;
  text-align: center;
}

.error-box p {
  margin: 0;
}

.stale-box {
  display: grid;
  gap: 6px;
  margin-block-start: 10px;
  padding: 8px;
  border: 1px solid #857343;
  background: color-mix(in srgb, #857343 14%, var(--surface));
}

.stale-box p {
  margin: 0;
}

.meal-block {
  border: 1px solid var(--meal-border, var(--border));
  border-inline-start-width: 7px;
  padding: 8px;
  display: grid;
  gap: 8px;
  background: var(--meal-bg, var(--surface));
  overflow: hidden;
  box-shadow: var(--bevel-raised);
}

.meal-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.meal-total,
.food-meta {
  color: var(--text-muted);
}

.meal-total-row {
  background: color-mix(in srgb, var(--meal-accent, var(--accent)) 18%, var(--surface-3));
}

.meal-total-row td {
  border-block-start: 2px solid var(--meal-border, var(--border));
  font-weight: 600;
}

.meal-total-label {
  color: var(--text-muted);
}

.meal-total-card {
  background: color-mix(in srgb, var(--meal-accent, var(--accent)) 18%, var(--surface-3));
  border-block-start: 2px solid var(--meal-border, var(--border)) !important;
  font-weight: 600;
}

.day-total-line {
  display: flex;
  justify-content: center;
  align-items: center;
  padding-block: 0.875rem;
  padding-inline: 0.5rem;
  border-block-start: 1px solid var(--meal-border, var(--border));
  text-align: center;
}

.day-total-line .meal-total {
  display: inline-flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.25rem;
  text-align: center;
}

.meal-block--day-total {
  --meal-accent: #6b6b6b;
}

.meal-table-wrap {
  overflow-x: auto;
  padding-block-end: 2px;
}

.meal-table {
  min-inline-size: 920px;
  inline-size: 100%;
  table-layout: auto;

  input {
    padding-inline-end: unset;
  }
}

.meal-col-food {
  width: 24%;
}

.meal-col-amount {
  width: 12%;
}

.meal-col-grams,
.meal-col-calories,
.meal-col-per100 {
  width: 9%;
}

.meal-col-protein,
.meal-col-fat,
.meal-col-fiber {
  width: 7%;
}

.meal-col-carbs {
  width: 8%;
}

.meal-col-actions {
  width: 6%;
}

.meal-cards {
  display: none;
}

.meal-table th {
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.15;
  font-size: 0.9rem;
  vertical-align: bottom;
}

.meal-table td {
  vertical-align: top;
}

.meal-table :is(input[type="number"], input[type="date"], select) {
  inline-size: min(100%, 7.5rem);
}

.food-cell {
  min-inline-size: 220px;
}

.food-name {
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.food-alt-name {
  color: var(--text-muted);
  margin-block-start: 0.2rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.amount-cell {
  min-inline-size: 150px;
}

.estimated-cue {
  display: block;
  margin-block-start: 0.25rem;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.is-estimated {
  border-style: dashed;
}

.per100-input {
  inline-size: min(100%, 5.5rem);
}

.action-cell {
  inline-size: 100%;
  min-inline-size: 4rem;
  white-space: normal;
  padding-inline: 0.45rem;
  vertical-align: middle;
  text-align: center;
}

.row-action-menu__toggle {
  cursor: pointer;
  user-select: none;
  inline-size: 2.35rem;
  block-size: 2.35rem;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-primary);
  font-size: 1.65rem;
  line-height: 1;
  padding: 0;
}

.row-action-menu__dialog {
  padding: 0;
  margin: auto;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 14px;
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.26);
  max-inline-size: min(92vw, 26rem);
  z-index: 1000;
}

.row-action-menu__dialog[open] {
  display: block;
}

.row-action-menu__dialog::backdrop {
  background: rgba(0, 0, 0, 0.4);
}

.row-action-menu__header {
  display: flex;
  justify-content: flex-end;
  padding: 0.25rem 0.25rem 0;
}

.row-action-menu__close {
  inline-size: 2rem;
  block-size: 2rem;
  display: grid;
  place-items: center;
  border: none;
  background: none;
  color: var(--text-primary);
  font-size: 2rem;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s ease;
}

.row-action-menu__close:hover,
.row-action-menu__close:focus-visible {
  opacity: 1;
}

.row-action-menu__content {
  display: grid;
  gap: 0.65rem;
  padding: 0.5rem;
  min-inline-size: 11rem;
}

.macro-assistant {
  display: grid;
  gap: 0.6rem;
  padding: 0.7rem;
  border: 1px solid color-mix(in srgb, var(--border-strong) 45%, transparent);
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--surface-2) 88%, transparent);
}

.macro-assistant__title,
.macro-assistant__manual-title {
  font-weight: 700;
}

.macro-assistant__subtitle {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.86rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.macro-assistant__mode-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem;
}

.macro-assistant__mode-btn {
  border: 1px solid color-mix(in srgb, var(--border-strong) 45%, transparent);
  background: var(--surface-1);
  color: var(--text-primary);
  border-radius: var(--radius);
  padding: 0.36rem 0.56rem;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 400;
  cursor: pointer;
  box-shadow: var(--bevel-raised);
  text-align: center;
}

.macro-assistant__mode-btn.is-active {
  color: var(--text-primary);
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border-strong));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-1));
}

.macro-assistant__actions,
.macro-assistant__save-actions {
  display: grid;
  gap: 0.45rem;
}

.macro-assistant__save-actions {
  border-block-start: 1px dashed color-mix(in srgb, var(--border-strong) 45%, transparent);
  padding-block-start: 0.6rem;
}

.macro-assistant__url-label {
  display: grid;
  gap: 0.2rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.macro-assistant__url-label input {
  direction: ltr;
  text-align: left;
}

.macro-assistant__url-hint {
  text-align: center;
}

.macro-assistant__fallback-link {
  color: var(--text-muted);
  font-size: 0.85rem;
  text-decoration: underline;
  text-underline-offset: 0.12em;
  text-align: center;
  overflow-wrap: anywhere;
}

.per100-macro-editor {
  display: grid;
  gap: 0.45rem;
}

.per100-macro-editor__hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-muted);
  line-height: 1.35;
}

.per100-macro-editor__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.4rem;
}

.per100-macro-editor__grid label {
  display: grid;
  gap: 0.2rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.row-action-menu__content .secondary-action {
  inline-size: 100%;
  text-align: center;
}

.food-card__actions .secondary-action--subtle {
  background: var(--surface-2);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.card-action-links {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: flex-end;
  align-items: baseline;
}

.card-action-link {
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface-1);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
  box-shadow: var(--bevel-raised);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.card-action-link:hover,
.card-action-link:focus-visible {
  background: var(--surface-1);
  border-color: var(--border-strong);
}

@media (max-width: 420px) {
  .card-action-links {
    justify-content: flex-start;
    gap: 0.6rem;
  }
}

@media (max-width: 960px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .compact-stat {
    padding: 0.45rem;
  }

  .compact-stat strong {
    line-height: 1.2;
  }

  .compact-stat > span {
    font-size: 1.05rem;
  }

  .stat-helper {
    min-block-size: 0;
    font-size: 0.82rem;
  }

  .meal-header {
    flex-direction: column;
    align-items: stretch;
  }

  .meal-table {
    min-inline-size: 780px;
  }

  .food-cell {
    min-inline-size: 180px;
  }

  .amount-cell {
    min-inline-size: 120px;
  }

  .meal-table :is(input[type="number"], input[type="date"], select) {
    inline-size: min(100%, 6.2rem);
  }

  .action-cell {
    min-inline-size: 4rem;
  }
}

@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .macro-range-row {
    grid-template-columns: 1fr;
    row-gap: 0.15rem;
    justify-items: end;
  }

  .macro-range-text {
    inline-size: 100%;
    justify-content: flex-end;
  }

  .meal-table {
    display: none;
  }

  .meal-table-wrap {
    overflow: visible;
  }

  .meal-cards {
    display: grid;
    gap: 8px;
  }

  .food-card {
    border: 1px solid var(--meal-border, var(--border));
    background: var(--meal-bg, var(--surface));
    box-shadow: var(--bevel-raised);
    padding: 8px;
    display: grid;
    gap: 8px;
  }

  .food-card__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .kv {
    display: grid;
    gap: 2px;
  }

  .k {
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .v {
    min-inline-size: 0;
  }

  .food-card :is(input[type="number"], input[type="date"], select) {
    inline-size: min(100%, 7.1rem);
    max-inline-size: 100%;
  }

  .food-card .per100-input {
    inline-size: min(100%, 6rem);
  }

  .day-total-line {
    padding-block: 0.75rem;
  }

  .food-card__actions {
    justify-content: flex-end;
  }

  .food-cell {
    min-inline-size: 150px;
  }

  .amount-cell {
    min-inline-size: 100px;
  }

  .action-cell {
    min-inline-size: 5rem;
  }
}
</style>
