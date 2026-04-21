import { expect, test } from "@playwright/test";
import { makeFoodSeed, makeNutritionSnapshot, seedProfileAndEntries, todayIso } from "./helpers";

test("@meals meals table persists edits and avoids duplicate correction toast", async ({ page }) => {
  const date = todayIso();
  const oats = makeFoodSeed({
    id: "food-oats",
    name: "Oats",
    amountText: "1 bowl",
    grams: 50,
    calories: 190,
    caloriesPer100g: 380,
    protein: 7,
    carbs: 33,
    fat: 3,
    fiber: 5,
  });
  const yogurt = makeFoodSeed({
    id: "food-yogurt",
    name: "Yogurt",
    amountText: "1 cup",
    grams: 130,
    calories: 130,
    caloriesPer100g: 100,
    protein: 12,
    carbs: 11,
    fat: 5,
    fiber: 1,
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await seedProfileAndEntries(page, [
    {
      date,
      foodLogText: "oats and yogurt",
      weight: 80,
      manualCalories: null,
      aiStatus: "done",
      nutritionSnapshot: makeNutritionSnapshot([oats, yogurt]),
    },
  ]);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#nutritionSummaryPanel").scrollIntoViewIfNeeded();

  await page.getByTestId("food-input-food-oats-calories").fill("222");
  await page.waitForTimeout(900);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#nutritionSummaryPanel").scrollIntoViewIfNeeded();

  await expect(page.getByTestId("food-input-food-oats-calories")).toHaveValue("222");
  await expect(page.getByTestId("food-input-food-oats-protein")).toHaveValue("8.2");

  const per100Input = page.getByTestId("food-input-food-oats-caloriesPer100g");
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
  await expect(page.getByTestId("food-input-food-oats-caloriesPer100g")).toHaveValue("410");

  const proteinInput = page.getByTestId("food-input-food-oats-protein");
  await proteinInput.fill("15");
  await proteinInput.blur();
  await page.waitForTimeout(900);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#nutritionSummaryPanel").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("food-input-food-oats-protein")).toHaveValue("15");
});

test("@meals meal totals persist and survive date switch", async ({ page }) => {
  const today = todayIso();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  const oats = makeFoodSeed({
    id: "food-oats",
    name: "Oats",
    grams: 50,
    calories: 190,
    caloriesPer100g: 380,
    protein: 7,
    carbs: 33,
    fat: 3,
    fiber: 5,
  });
  const yogurt = makeFoodSeed({
    id: "food-yogurt",
    name: "Yogurt",
    grams: 130,
    calories: 130,
    caloriesPer100g: 100,
    protein: 12,
    carbs: 11,
    fat: 5,
    fiber: 1,
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await seedProfileAndEntries(page, [
    {
      date: today,
      foodLogText: "oats and yogurt",
      weight: 80,
      manualCalories: null,
      aiStatus: "done",
      nutritionSnapshot: makeNutritionSnapshot([oats, yogurt]),
    },
    {
      date: yesterdayIso,
      foodLogText: "rice and chicken",
      weight: 80.2,
      manualCalories: 1900,
    },
  ]);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#nutritionSummaryPanel").scrollIntoViewIfNeeded();

  await page.getByTestId("meal-total-input-meal-breakfast-calories").fill("355");
  await page.getByTestId("meal-total-input-meal-breakfast-calories").blur();
  await page.waitForTimeout(900);

  const dateInput = page.locator("#dailyDeskPanel input[type='date']").first();
  await dateInput.fill(yesterdayIso);
  await dateInput.blur();
  await page.waitForTimeout(300);
  await dateInput.fill(today);
  await dateInput.blur();
  await page.waitForTimeout(1200);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#nutritionSummaryPanel").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("meal-total-input-meal-breakfast-calories")).toHaveValue("355");
});

test("@meals grams and macro edits persist without dropping latest value", async ({ page }) => {
  const date = todayIso();
  const oats = makeFoodSeed({
    id: "food-oats",
    name: "Oats",
    grams: 50,
    calories: 190,
    caloriesPer100g: 380,
    protein: 7,
    carbs: 33,
    fat: 3,
    fiber: 5,
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await seedProfileAndEntries(page, [
    {
      date,
      foodLogText: "oats only",
      weight: 80,
      manualCalories: null,
      aiStatus: "done",
      nutritionSnapshot: makeNutritionSnapshot([oats]),
    },
  ]);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#nutritionSummaryPanel").scrollIntoViewIfNeeded();

  await page.getByTestId("food-input-food-oats-grams").fill("60");
  await page.getByTestId("food-input-food-oats-grams").blur();
  await page.waitForTimeout(900);

  await expect(page.getByTestId("food-input-food-oats-calories")).toHaveValue("228");

  await page.getByTestId("food-input-food-oats-fiber").fill("9");
  await page.getByTestId("food-input-food-oats-fiber").blur();
  await page.waitForTimeout(900);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#nutritionSummaryPanel").scrollIntoViewIfNeeded();

  await expect(page.getByTestId("food-input-food-oats-grams")).toHaveValue("60");
  await expect(page.getByTestId("food-input-food-oats-calories")).toHaveValue("224");
  await expect(page.getByTestId("food-input-food-oats-fiber")).toHaveValue("9");
});
