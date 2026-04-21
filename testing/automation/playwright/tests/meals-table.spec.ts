import { expect, test } from "@playwright/test";
import { seedProfileAndEntries, todayIso } from "./helpers";

test("@meals meals table persists edits and avoids duplicate correction toast", async ({ page }) => {
  const date = todayIso();

  const oats = {
    id: "food-oats",
    mealKey: "breakfast",
    mealLabel: "Breakfast",
    name: "Oats",
    canonicalName: "Oats",
    amountText: "1 bowl",
    grams: 50,
    gramsEstimated: false,
    calories: 190,
    caloriesEstimated: false,
    caloriesPer100g: 380,
    protein: 7,
    carbs: 33,
    fat: 3,
    fiber: 5,
    confidence: 0.95,
    assumptions: [],
    needsReview: false,
  };

  const yogurt = {
    id: "food-yogurt",
    mealKey: "breakfast",
    mealLabel: "Breakfast",
    name: "Yogurt",
    canonicalName: "Yogurt",
    amountText: "1 cup",
    grams: 130,
    gramsEstimated: false,
    calories: 130,
    caloriesEstimated: false,
    caloriesPer100g: 100,
    protein: 12,
    carbs: 11,
    fat: 5,
    fiber: 1,
    confidence: 0.95,
    assumptions: [],
    needsReview: false,
  };

  await page.goto("/", { waitUntil: "networkidle" });
  await seedProfileAndEntries(page, [
    {
      date,
      foodLogText: "oats and yogurt",
      weight: 80,
      manualCalories: null,
      aiStatus: "done",
      nutritionSnapshot: {
        schemaVersion: "1.0",
        calories: 320,
        protein: 19,
        carbs: 44,
        fat: 8,
        dailyTotals: { calories: 320, protein: 19, carbs: 44, fat: 8, fiber: 6 },
        nutrients: {
          fiber: 6,
          sodiumMg: 180,
          potassiumMg: 340,
          calciumMg: 220,
          ironMg: 2,
          magnesiumMg: 60,
          vitaminAIu: 0,
          vitaminCMg: 0,
          vitaminDMcg: 0,
          vitaminB12Mcg: 0,
        },
        meals: [
          {
            id: "meal-breakfast",
            mealKey: "breakfast",
            mealLabel: "Breakfast",
            color: "#8C6A43",
            foods: [oats, yogurt],
            totals: { calories: 320, protein: 19, carbs: 44, fat: 8, fiber: 6 },
          },
        ],
        foods: [oats, yogurt],
        unmatchedItems: [],
        assumptions: [],
        warnings: [],
        confidence: 0.95,
        sourceModel: "gemini-2.5-flash",
        updatedAt: new Date().toISOString(),
      },
    },
  ]);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#nutritionSummaryPanel").scrollIntoViewIfNeeded();

  const oatsRow = page.locator("tr", { has: page.getByText("Oats", { exact: true }) }).first();
  const foodInputs = oatsRow.locator("input[type='number']");

  await foodInputs.nth(1).fill("222");
  await page.waitForTimeout(900);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#nutritionSummaryPanel").scrollIntoViewIfNeeded();

  const oatsAfterReload = page.locator("tr", { has: page.getByText("Oats", { exact: true }) }).first();
  await expect(oatsAfterReload.locator("input[type='number']").nth(1)).toHaveValue("222");
  await expect(oatsAfterReload.locator("input[type='number']").nth(3)).toHaveValue("8.2");

  const per100Input = oatsAfterReload.locator("input[type='number']").nth(2);
  await per100Input.fill("410");
  await per100Input.blur();

  let sawResultsUpdated = false;
  const started = Date.now();
  while (Date.now() - started < 4200) {
    const toast = page.locator(".status-toast__message").first();
    if (await toast.count()) {
      const text = (await toast.textContent()) || "";
      if (text.toLowerCase().includes("results updated")) {
        sawResultsUpdated = true;
        break;
      }
    }
    await page.waitForTimeout(200);
  }

  expect(sawResultsUpdated).toBe(false);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#nutritionSummaryPanel").scrollIntoViewIfNeeded();
  const oatsAfterSecondReload = page.locator("tr", { has: page.getByText("Oats", { exact: true }) }).first();

  await expect(oatsAfterSecondReload.locator("input[type='number']").nth(2)).toHaveValue("410");

  const proteinInput = oatsAfterSecondReload.locator("input[type='number']").nth(3);
  await proteinInput.fill("15");
  await proteinInput.blur();
  await page.waitForTimeout(900);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#nutritionSummaryPanel").scrollIntoViewIfNeeded();
  await expect(
    page.locator("tr", { has: page.getByText("Oats", { exact: true }) }).first().locator("input[type='number']").nth(3),
  ).toHaveValue("15");
});
