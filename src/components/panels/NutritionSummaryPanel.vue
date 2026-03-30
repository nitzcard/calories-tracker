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
let correctionCueTimeout: ReturnType<typeof setTimeout> | null = null;
const { t } = useI18n();
const visibleNotes = computed(() => {
  const assumptions = props.entry?.nutritionSnapshot?.assumptions ?? [];
  const warnings = props.entry?.nutritionSnapshot?.warnings ?? [];
  return [...assumptions.map((text) => ({ key: `a-${text}`, text })), ...warnings.map((text) => ({ key: `w-${text}`, text }))].filter(
    (item) => props.locale === "he" || !containsHebrew(item.text),
  );
});

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

function macroRecommendationKey(macro: "protein" | "carbs" | "fat" | "fiber") {
  const keys = {
    protein: "macroProteinRecommendation",
    carbs: "macroCarbsRecommendation",
    fat: "macroFatRecommendation",
    fiber: "macroFiberRecommendation",
  } as const;

  return keys[macro];
}

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
    id="nutritionSummaryPanel"
    :title="t('nutritionSummary')"
    :helper="t('nutritionHelper')"
    :loading="isAnalyzing"
    :loading-title="t('analyzingNow')"
    :loading-helper="t('nutritionLoadingHelper')"
  >
    <template #meta>
      <div class="meta-row">
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
        <div class="compact-stat">
          <strong>{{ t("calories") }}</strong>
          <span>{{ entry.nutritionSnapshot.dailyTotals.calories ?? "-" }}</span>
          <small class="stat-helper">&nbsp;</small>
        </div>
        <div class="compact-stat">
          <strong>{{ t("protein") }}</strong>
          <span>{{ entry.nutritionSnapshot.dailyTotals.protein ?? "-" }}</span>
          <small v-if="macroPercent('protein') !== null" class="stat-meta">
            {{ macroPercent("protein") }}% {{ t("macroShareOfCalories") }}
          </small>
          <small v-if="proteinPerEstimatedWeight !== null" class="stat-meta">
            {{ proteinPerEstimatedWeight }} {{ t("proteinPerBodyWeight") }}
          </small>
          <small v-if="proteinPerLeanBodyWeight !== null" class="stat-meta">
            {{ proteinPerLeanBodyWeight }} {{ t("proteinPerLeanBodyWeight") }}
          </small>
          <small class="stat-helper">{{ t(macroRecommendationKey("protein")) }}</small>
        </div>
        <div class="compact-stat">
          <strong>{{ t("carbs") }}</strong>
          <span>{{ entry.nutritionSnapshot.dailyTotals.carbs ?? "-" }}</span>
          <small v-if="macroPercent('carbs') !== null" class="stat-meta">
            {{ macroPercent("carbs") }}% {{ t("macroShareOfCalories") }}
          </small>
          <small class="stat-helper">{{ t(macroRecommendationKey("carbs")) }}</small>
        </div>
        <div class="compact-stat">
          <strong>{{ t("fat") }}</strong>
          <span>{{ entry.nutritionSnapshot.dailyTotals.fat ?? "-" }}</span>
          <small v-if="macroPercent('fat') !== null" class="stat-meta">
            {{ macroPercent("fat") }}% {{ t("macroShareOfCalories") }}
          </small>
          <small class="stat-helper">{{ t(macroRecommendationKey("fat")) }}</small>
        </div>
        <div class="compact-stat">
          <strong>{{ t("fiber") }}</strong>
          <span>{{ entry.nutritionSnapshot.dailyTotals.fiber ?? "-" }}</span>
          <small class="stat-helper">{{ t(macroRecommendationKey("fiber")) }}</small>
        </div>
        <div class="compact-stat">
          <strong>{{ t("provider") }}</strong>
          <span>{{ entry.nutritionSnapshot.sourceModel }}</span>
          <small class="stat-helper">&nbsp;</small>
        </div>
      </div>

      <details v-if="visibleNotes.length || visibleUnmatchedItems.length" class="notes-panel">
        <summary class="notes-summary">{{ t("aiNotes") }}</summary>
        <div class="notes">
          <ul v-if="visibleNotes.length">
            <li v-for="item in visibleNotes" :key="item.key">{{ item.text }}</li>
          </ul>
          <div v-if="visibleUnmatchedItems.length" class="unmatched">
            <strong>{{ t("unmatchedItems") }}</strong>
            <ul>
              <li v-for="item in visibleUnmatchedItems" :key="item">{{ item }}</li>
            </ul>
          </div>
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
            <span class="meal-total">
              {{ t("mealTotal") }}: {{ meal.totals.calories ?? "-" }} {{ t("unitKcal") }} /
              {{ t("protein") }} {{ meal.totals.protein ?? "-" }} / {{ t("carbs") }}
              {{ meal.totals.carbs ?? "-" }} / {{ t("fat") }} {{ meal.totals.fat ?? "-" }}
            </span>
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
          </div>
        </div>
      </div>
    </template>

    <div v-else-if="entry?.aiError" class="error-box">
      <strong>{{ t("aiError") }}</strong>
      <p>{{ entry.aiError }}</p>
    </div>

    <p v-else>{{ t("noNutritionYet") }}</p>
  </BasePanel>
</template>

<style scoped>
.summary-panel {
  align-self: start;
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

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
  margin-block-start: 10px;
}

.compact-stat {
  align-content: start;
}

.compact-stat > span {
  font-variant-numeric: tabular-nums;
}

.stat-meta {
  color: var(--text-muted);
}

.stat-helper {
  color: var(--text-muted);
  line-height: 1.3;
  min-block-size: 2.6em;
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

.meal-table-wrap {
  overflow-x: auto;
  padding-block-end: 2px;
}

.meal-table {
  min-inline-size: 920px;
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
    min-block-size: 3.2em;
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
</style>
