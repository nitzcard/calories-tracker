export type ThemeMode =
  | "system"
  | "light"
  | "dark"
  | "purple-dark"
  | "jasmine"
  | "cs16"
  | "steam"
  | "cyberpunk-2077";
export type AppLocale = "en" | "he";
export type AiStatus = "idle" | "pending" | "processing" | "done" | "failed";
export type BiologicalSex = "female" | "male" | "other";
export type GoalMode = "cut" | "leanMass" | "maingain";
export type MissingWeightStrategy = "previousDay" | "deducedWeight";
export type TdeeEquation =
  | "mifflinStJeor"
  | "harrisBenedict"
  | "cunningham"
  | "custom"
  | "observedTdee";

export interface AiProviderOption {
  id: string;
  label: string;
  helper: string;
  experimental: boolean;
  source?: "builtin" | "detected" | "saved";
}

export interface Profile {
  id: "default";
  sex: BiologicalSex;
  email?: string;
  age: number | null;
  height: number | null;
  estimatedWeight: number | null;
  targetWeight: number | null;
  customTdee: number | null;
  bodyFat: number | null;
  goalMode: GoalMode;
  weightMissingStrategy: MissingWeightStrategy;
  tdeeEquation: TdeeEquation;
  activityPrompt: string;
  foodInstructions: string;
  aiModel: string;
  locale: AppLocale;
  themeMode: ThemeMode;
  updatedAt?: string;
}

export interface FoodRule {
  id: string;
  label: string;
  instructionText: string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface NutrientMap {
  fiber: number | null;
  sodiumMg: number | null;
  potassiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  magnesiumMg: number | null;
  vitaminAIu: number | null;
  vitaminCMg: number | null;
  vitaminDMcg: number | null;
  vitaminB12Mcg: number | null;
}

export interface NutritionTotals {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
}

export interface FoodBreakdownItem {
  id: string;
  mealKey: string;
  mealLabel: string;
  name: string;
  canonicalName: string | null;
  amountText: string;
  grams: number | null;
  gramsEstimated?: boolean;
  calories: number | null;
  caloriesEstimated?: boolean;
  caloriesPer100g?: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
  confidence: number | null;
  assumptions: string[];
  needsReview: boolean;
  notes?: string;
}

export interface MealBreakdownItem {
  id: string;
  mealKey: string;
  mealLabel: string;
  color: string;
  foods: FoodBreakdownItem[];
  totals: NutritionTotals;
}

export interface AiFoodResult {
  foodName: string;
  canonicalName: string | null;
  amountText: string;
  servings: number | null;
  unit: string | null;
  estimatedGrams: number | null;
  nutrition: NutritionTotals;
  confidence: number | null;
  assumptions: string[];
  needsReview: boolean;
}

export interface AiMealResult {
  mealKey: "breakfast" | "lunch" | "dinner" | "snack" | "other";
  mealLabel: string;
  color: string;
  foods: AiFoodResult[];
  totals: NutritionTotals;
}

export interface AiNutritionResponse {
  schemaVersion: "1.0";
  locale: AppLocale;
  date: string;
  meals: AiMealResult[];
  dailyTotals: NutritionTotals;
  micronutrients: NutrientMap;
  unmatchedItems: string[];
  globalAssumptions: string[];
  warnings: string[];
}

export interface NutritionSnapshot {
  schemaVersion: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  dailyTotals: NutritionTotals;
  nutrients: NutrientMap;
  meals: MealBreakdownItem[];
  foods: FoodBreakdownItem[];
  unmatchedItems: string[];
  assumptions: string[];
  warnings: string[];
  confidence: number | null;
  sourceModel: string;
  updatedAt: string;
}

export interface DailyEntry {
  date: string;
  foodLogText: string;
  weight: number | null;
  manualCalories: number | null;
  customTdee: number | null;
  analysisStale: boolean;
  nutritionSnapshot: NutritionSnapshot | null;
  aiStatus: AiStatus;
  aiError: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface SyncQueueItem {
  id?: number;
  date: string;
  status: Exclude<AiStatus, "idle">;
  attempts: number;
  enqueuedAt: string;
  updatedAt: string;
  provider: string;
}

export interface TdeeSnapshot {
  observedTdee: number | null;
  observedFromDate: string | null;
  observedToDate: string | null;
  observedValidEntryCount: number;
  observedDaySpanDays: number | null;
  observedReason: "insufficient_entries" | "insufficient_span" | "out_of_range" | null;
  observedMinEntries: number;
  observedMinDays: number;
  formulaTdeeAverage: number | null;
  formulaBreakdown: Record<string, number>;
  formulaWeight: number | null;
  formulaWeightSource: "estimated" | "deduced" | "logged" | null;
  activityMultiplier: number | null;
  selectedEquation: TdeeEquation;
  selectedValue: number | null;
  targetWeight: number | null;
  targetTdee: number | null;
  lastComputedAt: string;
}

export interface FormulaTdeeResult {
  average: number | null;
  breakdown: Record<string, number>;
  activityMultiplier: number | null;
}

export type InsightStatus = "likely_low" | "borderline" | "covered" | "insufficient_data";

export interface MicronutrientInsightItem {
  nutrientKey:
    | "calciumMg"
    | "ironMg"
    | "magnesiumMg"
    | "potassiumMg"
    | "vitaminDMcg"
    | "vitaminB12Mcg";
  target: number;
  unit: "mg" | "mcg";
  average7d: number | null;
  average30d: number | null;
  validDays7d: number;
  validDays30d: number;
  status7d: InsightStatus;
  status30d: InsightStatus;
}

export interface MicronutrientInsights {
  anchorDate: string;
  analyzedDays7d: number;
  analyzedDays30d: number;
  likelyLowCount7d: number;
  likelyLowCount30d: number;
  items: MicronutrientInsightItem[];
}

export interface MacroInsightStat {
  key: "calories" | "protein" | "carbs" | "fat" | "fiber";
  average7d: number | null;
  average30d: number | null;
  unit: "kcal" | "g";
}

export interface TopFoodInsightItem {
  name: string;
  daysSeen30d: number;
  totalCalories30d: number | null;
}

export interface NutritionInsights {
  micronutrients: MicronutrientInsights;
  macros: MacroInsightStat[];
  averageProteinPerKg7d: number | null;
  averageProteinPerKg30d: number | null;
  averageCaloriesVsTdee7d: number | null;
  calorieConsistency7d: number | null;
  topFoods30d: TopFoodInsightItem[];
}

export interface DailyEntryInput {
  date: string;
  foodLogText?: string;
  weight?: number | null;
  manualCalories?: number | null;
  customTdee?: number | null;
}

export interface AiAnalysisInput {
  date: string;
  foodLogText: string;
  profile: Profile;
  foodRules: FoodRule[];
}

export interface NormalizedNutritionResult extends NutritionSnapshot {}
