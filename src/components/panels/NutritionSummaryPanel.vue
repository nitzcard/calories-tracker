<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import type { AppLocale, DailyEntry, FoodBreakdownItem, MealBreakdownItem, Profile } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  entry?: DailyEntry;
  profile?: Profile | null;
  isAnalyzing: boolean;
  statusText: string;
  isStale?: boolean;
  correctionToken?: number;
}>();

const emit = defineEmits<{
  "save-correction": [
    foodId: string,
    foodName: string,
    grams: number | null,
    calories: number | null,
    caloriesPer100g: number | null,
  ];
}>();

const editableMeals = ref<MealBreakdownItem[]>([]);
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
const dailyTotals = computed(() => props.entry?.nutritionSnapshot?.dailyTotals ?? null);

watch(
  () => props.entry?.nutritionSnapshot?.meals,
  (meals) => {
    editableMeals.value = meals
      ? meals.map((meal) => ({
          ...meal,
          foods: meal.foods.map((food) => ({ ...food })),
        }))
      : [];
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
    // Flash only when results appear for the first time.
    if (next && !previous) {
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
  key: "grams" | "calories" | "caloriesPer100g",
  rawValue: string,
) {
  const nextValue = rawValue ? Number(rawValue) : null;
  editableMeals.value = editableMeals.value.map((meal) => ({
    ...meal,
    foods: meal.foods.map((food) =>
      food.id === foodId ? applyFoodEdit(food, key, nextValue) : food,
    ),
  }));
}

function emitSaveCorrection(food: FoodBreakdownItem) {
  emit(
    "save-correction",
    food.id,
    food.name,
    food.grams ?? null,
    food.calories ?? null,
    food.caloriesPer100g ?? null,
  );
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
  key: "grams" | "calories" | "caloriesPer100g",
  value: number | null,
): FoodBreakdownItem {
  if (key === "caloriesPer100g") {
    return {
      ...food,
      caloriesPer100g: value,
      calories: value && food.grams ? Math.round((food.grams * value) / 100) : food.calories,
      caloriesEstimated: false,
    };
  }

  if (key === "grams") {
    return {
      ...food,
      grams: value,
      calories:
        value && food.caloriesPer100g ? Math.round((value * food.caloriesPer100g) / 100) : food.calories,
      gramsEstimated: false,
    };
  }

  return {
    ...food,
    calories: value,
    caloriesPer100g:
      value && food.grams ? Math.round((value / food.grams) * 100) : food.caloriesPer100g,
    caloriesEstimated: false,
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

function macroTargetText(macro: "protein" | "carbs" | "fat" | "fiber") {
  const mode = props.profile?.goalMode ?? "maingain";
  const targets = macroGoalTargets(mode);

  if (macro === "protein") {
    return `${targets.protein.min}-${targets.protein.max} ${t("unitProteinPerKg")}`;
  }

  if (macro === "carbs") {
    return `${targets.carbsPct.min}-${targets.carbsPct.max}% ${t("macroShareOfCalories")}`;
  }

  if (macro === "fat") {
    return `${targets.fatPct.min}-${targets.fatPct.max}% ${t("macroShareOfCalories")}`;
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

function formatRecommendedMin(min: number) {
  return `${Math.round(min)}+`;
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
  return { min: weight * targets.protein.min, max: weight * targets.protein.max, unit: t("unitG") };
}

function macroGauge(macro: "protein" | "carbs" | "fat" | "fiber") {
  const range = macroRecommendedRange(macro);
  if (!range) return null;
  const actual = dailyTotals.value?.[macro] ?? null;
  if (actual == null || !Number.isFinite(actual) || range.max <= 0) return null;

  const scaleMax = macro === "protein" ? Math.max(range.min * 2, actual) : Math.max(range.max, actual);
  const actualPct = Math.min(100, Math.max(0, (actual / scaleMax) * 100));
  const minPct = Math.min(100, Math.max(0, (range.min / scaleMax) * 100));
  const maxPct =
    macro === "protein" ? 100 : Math.min(100, Math.max(0, (range.max / scaleMax) * 100));
  const state = actual < range.min ? "low" : actual > range.max ? "high" : "ok";

  return {
    actual,
    ...range,
    actualPct,
    minPct,
    maxPct,
    state,
    label: macro === "protein" ? formatRecommendedMin(range.min) : formatRecommendedRange(range.min, range.max),
    maxLabel: macro === "protein" ? "∞" : undefined,
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
    :loading="isAnalyzing && !entry?.aiError"
    :loading-title="t('analyzingNow')"
    :loading-helper="t('nutritionLoadingHelper')"
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

      <div v-if="entry?.nutritionSnapshot && isStale" class="stale-box">
      <strong>{{ t("staleNutritionTitle") }}</strong>
      <p>{{ t("staleNutritionHelper") }}</p>
    </div>

    <template v-else-if="entry?.nutritionSnapshot">
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
          <strong><span class="macro-heading-mark">{{ macroEmoji("protein") }}</span>{{ t("protein") }}</strong>
          <span>{{ entry.nutritionSnapshot.dailyTotals.protein ?? "-" }}</span>
          <small v-if="macroPercent('protein') !== null" class="stat-meta">
            {{ macroPercent("protein") }}% {{ t("macroShareOfCalories") }}
          </small>
          <div v-if="proteinGauge" class="macro-gauge" :data-state="proteinGauge.state">
            <div class="macro-bar" aria-hidden="true">
              <div
                class="macro-bar__range"
                :style="{
                  left: `${proteinGauge.minPct}%`,
                  width: `${Math.max(0, proteinGauge.maxPct - proteinGauge.minPct)}%`,
                }"
              ></div>
              <div class="macro-bar__marker" :style="{ left: `${proteinGauge.actualPct}%` }"></div>
            </div>
            <div class="macro-bar__ticks" aria-hidden="true">
              <div class="macro-bar__tick" :style="{ left: `${proteinGauge.minPct}%` }">
                <span>{{ Math.round(proteinGauge.min) }}</span>
              </div>
              <div class="macro-bar__tick" :style="{ left: `${proteinGauge.maxPct}%` }">
                <span>{{ proteinGauge.maxLabel ?? Math.round(proteinGauge.max) }}</span>
              </div>
            </div>
            <div class="stat-stack">
              <small class="stat-meta">{{ formatActual(proteinGauge.actual, proteinGauge.unit) }}</small>
              <small class="stat-meta">{{ t("recommendedRange") }}: {{ formatRecommendedValue(proteinGauge) }}</small>
              <small class="stat-meta">{{ macroTargetText("protein") }}</small>
            </div>
          </div>
          <small v-if="proteinPerEstimatedWeight !== null" class="stat-meta">
            {{ proteinPerEstimatedWeight }} {{ t("proteinPerBodyWeight") }}
          </small>
          <small v-if="proteinPerLeanBodyWeight !== null" class="stat-meta">
            {{ proteinPerLeanBodyWeight }} {{ t("proteinPerLeanBodyWeight") }}
          </small>
        </div>
        <div class="compact-stat compact-stat--carbs">
          <strong><span class="macro-heading-mark">{{ macroEmoji("carbs") }}</span>{{ t("carbs") }}</strong>
          <span>{{ entry.nutritionSnapshot.dailyTotals.carbs ?? "-" }}</span>
          <small v-if="macroPercent('carbs') !== null" class="stat-meta">
            {{ macroPercent("carbs") }}% {{ t("macroShareOfCalories") }}
          </small>
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
              <div class="macro-bar__tick" :style="{ left: `${carbsGauge.minPct}%` }">
                <span>{{ Math.round(carbsGauge.min) }}</span>
              </div>
              <div class="macro-bar__tick" :style="{ left: `${carbsGauge.maxPct}%` }">
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
          <strong><span class="macro-heading-mark">{{ macroEmoji("fat") }}</span>{{ t("fat") }}</strong>
          <span>{{ entry.nutritionSnapshot.dailyTotals.fat ?? "-" }}</span>
          <small v-if="macroPercent('fat') !== null" class="stat-meta">
            {{ macroPercent("fat") }}% {{ t("macroShareOfCalories") }}
          </small>
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
              <div class="macro-bar__tick" :style="{ left: `${fatGauge.minPct}%` }">
                <span>{{ Math.round(fatGauge.min) }}</span>
              </div>
              <div class="macro-bar__tick" :style="{ left: `${fatGauge.maxPct}%` }">
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
          <strong><span class="macro-heading-mark">{{ macroEmoji("fiber") }}</span>{{ t("fiber") }}</strong>
          <span>{{ entry.nutritionSnapshot.dailyTotals.fiber ?? "-" }}</span>
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
              <div class="macro-bar__tick" :style="{ left: `${fiberGauge.minPct}%` }">
                <span>{{ Math.round(fiberGauge.min) }}</span>
              </div>
              <div class="macro-bar__tick" :style="{ left: `${fiberGauge.maxPct}%` }">
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
        >
          <div class="meal-header">
            <strong>{{ displayMealLabel(meal.mealKey, meal.mealLabel) }}</strong>
          </div>

          <div class="meal-table-wrap">
            <table class="meal-table">
              <thead>
                <tr>
                  <th>{{ t("foodBreakdown") }}</th>
                  <th>{{ t("amount") }}</th>
                  <th>{{ t("grams") }}</th>
                  <th>{{ t("calories") }}</th>
                  <th>{{ t("kcalPer100g") }}</th>
                  <th>{{ t("protein") }}</th>
                  <th>{{ t("carbs") }}</th>
                  <th>{{ t("fat") }}</th>
                  <th>{{ t("fiber") }}</th>
                  <th></th>
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
                      @input="updateFood(food.id, 'grams', ($event.target as HTMLInputElement).value)"
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
                      @input="
                        updateFood(food.id, 'calories', ($event.target as HTMLInputElement).value)
                      "
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
                      @input="
                        updateFood(food.id, 'caloriesPer100g', ($event.target as HTMLInputElement).value)
                      "
                    />
                  </td>
                  <td>{{ food.protein ?? "-" }}</td>
                  <td>{{ food.carbs ?? "-" }}</td>
                  <td>{{ food.fat ?? "-" }}</td>
                  <td>{{ food.fiber ?? "-" }}</td>
                  <td class="action-cell">
                    <button class="secondary-action" @click="emitSaveCorrection(food)">
                      {{ t("saveFixAndReanalyze") }}
                    </button>
                  </td>
                </tr>
              </tbody>
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
                        @input="updateFood(food.id, 'grams', ($event.target as HTMLInputElement).value)"
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
                        @input="updateFood(food.id, 'calories', ($event.target as HTMLInputElement).value)"
                      />
                      <small v-if="food.caloriesEstimated" class="estimated-cue">
                        {{ t("estimatedValue") }}
                      </small>
                    </div>
                  </label>

                  <label class="kv">
                    <div class="k">{{ t("kcalPer100g") }}</div>
                    <div class="v">
                      <input
                        class="per100-input"
                        type="number"
                        :value="food.caloriesPer100g ?? ''"
                        @input="
                          updateFood(food.id, 'caloriesPer100g', ($event.target as HTMLInputElement).value)
                        "
                      />
                    </div>
                  </label>

                  <div class="kv">
                    <div class="k">{{ t("protein") }}</div>
                    <div class="v">{{ food.protein ?? "-" }}</div>
                  </div>
                  <div class="kv">
                    <div class="k">{{ t("carbs") }}</div>
                    <div class="v">{{ food.carbs ?? "-" }}</div>
                  </div>
                  <div class="kv">
                    <div class="k">{{ t("fat") }}</div>
                    <div class="v">{{ food.fat ?? "-" }}</div>
                  </div>
                  <div class="kv">
                    <div class="k">{{ t("fiber") }}</div>
                    <div class="v">{{ food.fiber ?? "-" }}</div>
                  </div>
                </div>

                <div class="food-card__actions">
                  <button class="secondary-action" @click="emitSaveCorrection(food)">
                    {{ t("saveFixAndReanalyze") }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="meal-footer">
            <span class="meal-total">
              {{ t("mealTotal") }}: {{ meal.totals.calories ?? "-" }} {{ t("unitKcal") }} /
              {{ t("protein") }} {{ meal.totals.protein ?? "-" }} / {{ t("carbs") }}
              {{ meal.totals.carbs ?? "-" }} / {{ t("fat") }} {{ meal.totals.fat ?? "-" }} /
              {{ t("fiber") }} {{ meal.totals.fiber ?? "-" }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <div v-else-if="entry?.aiError" class="error-box error-box--center">
      <strong>{{ t("aiError") }}</strong>
      <p dir="ltr">{{ entry.aiError }}</p>
    </div>

    <p v-else>{{ t("noNutritionYet") }}</p>
  </BasePanel>
</template>

<style scoped>
.summary-panel {
  align-self: start;
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

.macro-heading-mark {
  display: inline-block;
  margin-inline-end: 0.35rem;
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

.macro-bar__range {
  position: absolute;
  inset-block: 0;
  background: color-mix(in srgb, #27ae60 32%, transparent);
}

.compact-stat--protein .macro-bar__range,
.compact-stat--carbs .macro-bar__range,
.compact-stat--fat .macro-bar__range,
.compact-stat--fiber .macro-bar__range {
  background: color-mix(in srgb, var(--macro-accent) 44%, transparent);
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
}

.macro-bar__ticks {
  position: relative;
  block-size: 1rem;
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
  border: 1px solid #8a434d;
  background: color-mix(in srgb, #8a434d 14%, var(--surface));
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

.meal-footer {
  display: flex;
  justify-content: flex-start;
  justify-content: start;
  padding-block-start: 4px;
  border-block-start: 1px solid var(--meal-border, var(--border));
  text-align: start;
}

.meal-table-wrap {
  overflow-x: auto;
  padding-block-end: 2px;
}

.meal-table {
  min-inline-size: 920px;
}

.meal-cards {
  display: none;
}

.meal-table th {
  white-space: nowrap;
}

.meal-table td {
  vertical-align: top;
}

.meal-table :is(input[type="number"], input[type="date"], select) {
  inline-size: min(100%, 7rem);
}

.food-cell {
  min-inline-size: 220px;
}

.food-name {
  font-weight: 600;
  line-height: 1.25;
}

.food-alt-name {
  color: var(--text-muted);
  margin-block-start: 0.2rem;
  line-height: 1.25;
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
  inline-size: 1%;
  white-space: nowrap;
}

.action-cell .secondary-action {
  background: #87613a;
  color: #fff8ef;
  border-color: #53371a;
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
    inline-size: min(100%, 5.5rem);
  }
}

@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: 1fr;
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
    inline-size: min(100%, 6.5rem);
    max-inline-size: 100%;
  }

  .food-card .per100-input {
    inline-size: min(100%, 6rem);
  }

  .food-card__actions {
    display: flex;
    justify-content: flex-end;
  }

  .food-cell {
    min-inline-size: 150px;
  }

  .amount-cell {
    min-inline-size: 100px;
  }

  .action-cell .secondary-action {
    padding-inline: 0.4rem;
  }
}
</style>
