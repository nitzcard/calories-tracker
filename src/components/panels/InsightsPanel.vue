<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import BasePanel from "../base/BasePanel.vue";
import type { AppLocale, InsightStatus, NutritionInsights } from "../../types";

const props = defineProps<{
  locale: AppLocale;
  insights: NutritionInsights;
}>();

const { t } = useI18n();

const showEmptyState = computed(() => props.insights.micronutrients.analyzedDays30d === 0);

function nutrientLabel(
  nutrientKey: NutritionInsights["micronutrients"]["items"][number]["nutrientKey"],
) {
  const labels: Record<typeof nutrientKey, string> = {
    calciumMg: t("nutrientCalcium"),
    ironMg: t("nutrientIron"),
    magnesiumMg: t("nutrientMagnesium"),
    potassiumMg: t("nutrientPotassium"),
    vitaminDMcg: t("nutrientVitaminD"),
    vitaminB12Mcg: t("nutrientVitaminB12"),
  };

  return labels[nutrientKey];
}

function nutrientWhy(
  nutrientKey: NutritionInsights["micronutrients"]["items"][number]["nutrientKey"],
) {
  const map: Record<typeof nutrientKey, string> = {
    calciumMg: t("nutrientCalciumWhy"),
    ironMg: t("nutrientIronWhy"),
    magnesiumMg: t("nutrientMagnesiumWhy"),
    potassiumMg: t("nutrientPotassiumWhy"),
    vitaminDMcg: t("nutrientVitaminDWhy"),
    vitaminB12Mcg: t("nutrientVitaminB12Why"),
  };
  return map[nutrientKey];
}

function nutrientLink(
  nutrientKey: NutritionInsights["micronutrients"]["items"][number]["nutrientKey"],
) {
  const map: Record<typeof nutrientKey, string> = {
    calciumMg: t("nutrientCalciumLink"),
    ironMg: t("nutrientIronLink"),
    magnesiumMg: t("nutrientMagnesiumLink"),
    potassiumMg: t("nutrientPotassiumLink"),
    vitaminDMcg: t("nutrientVitaminDLink"),
    vitaminB12Mcg: t("nutrientVitaminB12Link"),
  };
  return map[nutrientKey];
}

function macroLabel(key: NutritionInsights["macros"][number]["key"]) {
  const labels: Record<typeof key, string> = {
    calories: t("calories"),
    protein: t("protein"),
    carbs: t("carbs"),
    fat: t("fat"),
    fiber: t("fiber"),
  };

  return labels[key];
}

function statusLabel(status: InsightStatus) {
  const labels: Record<InsightStatus, string> = {
    likely_low: t("insightStatusLikelyLow"),
    borderline: t("insightStatusBorderline"),
    covered: t("insightStatusCovered"),
    insufficient_data: t("insightStatusInsufficient"),
  };

  return labels[status];
}

function unitLabel(unit: "kcal" | "g" | "mg" | "mcg") {
  const labels = {
    kcal: t("unitKcal"),
    g: t("unitG"),
    mg: t("unitMg"),
    mcg: t("unitMcg"),
  } as const;

  return labels[unit];
}

function formatNumber(value: number | null, unit: string) {
  return value === null ? "-" : `${value} ${unit}`;
}

function formatSigned(value: number | null, unit: string) {
  if (value === null) return "-";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value} ${unit}`;
}
</script>

<template>
  <BasePanel
    id="insightsPanel"
    :title="t('insightsTitle')"
    :helper="t('insightsHelper')"
    collapsible
    :default-open="false"
  >
    <div class="stats-grid">
      <div class="compact-stat">
        <strong>{{ t("insightsAnalyzedDays7d") }}</strong>
        <span>{{ insights.micronutrients.analyzedDays7d }}</span>
      </div>
      <div class="compact-stat">
        <strong>{{ t("insightsAnalyzedDays30d") }}</strong>
        <span>{{ insights.micronutrients.analyzedDays30d }}</span>
      </div>
      <div class="compact-stat">
        <strong>{{ t("insightsLikelyLow7d") }}</strong>
        <span>{{ insights.micronutrients.likelyLowCount7d }}</span>
      </div>
      <div class="compact-stat">
        <strong>{{ t("insightsLikelyLow30d") }}</strong>
        <span>{{ insights.micronutrients.likelyLowCount30d }}</span>
      </div>
      <div class="compact-stat">
        <strong>{{ t("macroProteinPerKg7d") }}</strong>
        <span>{{ formatNumber(insights.averageProteinPerKg7d, t("unitProteinPerKg")) }}</span>
      </div>
      <div class="compact-stat">
        <strong>{{ t("macroCaloriesVsTdee7d") }}</strong>
        <span>{{ formatSigned(insights.averageCaloriesVsTdee7d, t("unitKcal")) }}</span>
      </div>
    </div>

    <p class="anchor-line">
      {{ t("insightsAnchorDate") }}: {{ insights.micronutrients.anchorDate }}
    </p>

    <p v-if="showEmptyState" class="empty-state">{{ t("insightsEmpty") }}</p>

    <template v-else>
      <div class="section-block">
        <strong>{{ t("macroSectionTitle") }}</strong>
        <div class="table-wrap">
          <table class="insights-table">
            <thead>
              <tr>
                <th>{{ t("macroMetric") }}</th>
                <th>{{ t("insights7dAvg") }}</th>
                <th>{{ t("insights30dAvg") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in insights.macros" :key="item.key">
                <td>{{ macroLabel(item.key) }}</td>
                <td>{{ formatNumber(item.average7d, unitLabel(item.unit)) }}</td>
                <td>{{ formatNumber(item.average30d, unitLabel(item.unit)) }}</td>
              </tr>
              <tr>
                <td>{{ t("macroProteinPerKg") }}</td>
                <td>{{ formatNumber(insights.averageProteinPerKg7d, t("unitProteinPerKg")) }}</td>
                <td>{{ formatNumber(insights.averageProteinPerKg30d, t("unitProteinPerKg")) }}</td>
              </tr>
              <tr>
                <td>{{ t("macroCaloriesVsTdee") }}</td>
                <td>{{ formatSigned(insights.averageCaloriesVsTdee7d, t("unitKcal")) }}</td>
                <td>-</td>
              </tr>
              <tr>
                <td>{{ t("macroCalorieConsistency") }}</td>
                <td>{{ formatNumber(insights.calorieConsistency7d, t("unitKcal")) }}</td>
                <td>-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="section-block">
        <strong>{{ t("insightsTitle") }}</strong>
        <div class="table-wrap">
          <table class="insights-table">
            <thead>
              <tr>
                <th>{{ t("insightsNutrient") }}</th>
                <th>{{ t("insightsTarget") }}</th>
                <th>{{ t("insights7dAvg") }}</th>
                <th>{{ t("insights7dStatus") }}</th>
                <th>{{ t("insights30dAvg") }}</th>
                <th>{{ t("insights30dStatus") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in insights.micronutrients.items" :key="item.nutrientKey">
                <td>
                  <a
                    class="nutrient-link"
                    :href="nutrientLink(item.nutrientKey)"
                    target="_blank"
                    rel="noreferrer"
                    :title="nutrientWhy(item.nutrientKey)"
                  >{{ nutrientLabel(item.nutrientKey) }}</a>
                  <small class="nutrient-why">{{ nutrientWhy(item.nutrientKey) }}</small>
                </td>
                <td>{{ formatNumber(item.target, unitLabel(item.unit)) }}</td>
                <td>{{ formatNumber(item.average7d, unitLabel(item.unit)) }}</td>
                <td>
                  <span class="status-box" :data-status="item.status7d">
                    {{ statusLabel(item.status7d) }}
                  </span>
                </td>
                <td>{{ formatNumber(item.average30d, unitLabel(item.unit)) }}</td>
                <td>
                  <span class="status-box" :data-status="item.status30d">
                    {{ statusLabel(item.status30d) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <p class="note-line">{{ t("insightsNote") }}</p>
  </BasePanel>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  margin-block-start: 10px;
}

.anchor-line,
.note-line,
.empty-state {
  margin: 10px 0 0;
  color: var(--text-muted);
}

.section-block {
  display: grid;
  gap: 8px;
  margin-block-start: 12px;
}

.table-wrap {
  overflow-x: auto;
}

.insights-table {
  /* Increased from 760px to accommodate the new per-nutrient explanation text column. */
  min-inline-size: 820px;
}

.status-box {
  display: inline-block;
  padding: 0.2rem 0.45rem;
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  box-shadow: var(--bevel-raised);
  white-space: nowrap;
}

.status-box[data-status="likely_low"] {
  background: #7a3d36;
  color: #fff1ef;
  border-color: #4e221d;
}

.status-box[data-status="borderline"] {
  background: #87613a;
  color: #fff8ef;
  border-color: #53371a;
}

.status-box[data-status="covered"] {
  background: #38634a;
  color: #eefcf3;
  border-color: #1d3c2b;
}

.status-box[data-status="insufficient_data"] {
  background: transparent;
  color: var(--text-muted);
  border: 0;
  box-shadow: none;
  font-style: italic;
  padding-inline: 0;
}

.nutrient-link {
  color: var(--text-primary);
  font-weight: 600;
  text-decoration: underline dotted;
}

.nutrient-link:hover {
  text-decoration: underline;
}

.nutrient-why {
  display: block;
  margin-block-start: 3px;
  color: var(--text-muted);
  font-size: 0.78rem;
  line-height: 1.35;
  max-inline-size: 28rem;
  overflow-wrap: anywhere;
}
</style>
