import { expect, test } from "@playwright/test";
import {
  isoDate,
  makeFoodSeed,
  makeNutritionSnapshot,
  seedProfileAndEntries,
} from "./helpers";

test("@responsive authenticated routes stay within target viewports", async ({ page }) => {
  test.setTimeout(90_000);

  const today = isoDate(0);
  const foods = [
    makeFoodSeed({
      id: "meal-eggs",
      mealKey: "breakfast",
      mealLabel: "Breakfast",
      name: "Eggs",
      amountText: "2 large",
      grams: 100,
      calories: 155,
      caloriesPer100g: 155,
      protein: 13,
      carbs: 1.1,
      fat: 11,
      fiber: 0,
    }),
    makeFoodSeed({
      id: "meal-rice",
      mealKey: "lunch",
      mealLabel: "Lunch",
      name: "Rice",
      amountText: "1 bowl",
      grams: 180,
      calories: 234,
      caloriesPer100g: 130,
      protein: 4.3,
      carbs: 50.4,
      fat: 0.4,
      fiber: 0.7,
    }),
    makeFoodSeed({
      id: "meal-salmon",
      mealKey: "dinner",
      mealLabel: "Dinner",
      name: "Salmon",
      amountText: "1 fillet",
      grams: 150,
      calories: 312,
      caloriesPer100g: 208,
      protein: 30,
      carbs: 0,
      fat: 19.5,
      fiber: 0,
    }),
  ];

  await page.goto("/", { waitUntil: "networkidle" });
  await seedProfileAndEntries(page, [
    {
      date: today,
      foodLogText: "eggs, rice, salmon",
      weight: 80.2,
      manualCalories: 2100,
      nutritionSnapshot: makeNutritionSnapshot(foods),
      aiStatus: "done",
    },
  ]);

  const routes = [
    { path: "/today", selector: "#dailyDeskPanel" },
    { path: "/progress", selector: "#historyPanel" },
    { path: "/settings", selector: "[data-testid='activity-factor-select']" },
  ];
  const viewports = [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1536, height: 864 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    for (const route of routes) {
      await page.goto(route.path, { waitUntil: "networkidle" });
      await expect(page.locator(route.selector).first()).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(
        overflow,
        `${route.path} should avoid horizontal overflow at ${viewport.width}x${viewport.height}`,
      ).toBeLessThanOrEqual(1);

      if (route.path === "/today" && viewport.width <= 430) {
        const macroPieText = page.locator("#nutritionSummaryPanel .macro-pie-text").first();
        await expect(macroPieText).toBeVisible();

        const fontSize = await macroPieText.evaluate((node) =>
          Number.parseFloat(window.getComputedStyle(node).fontSize),
        );
        expect(fontSize).toBeLessThanOrEqual(9.5);
      }

      if (route.path === "/progress") {
        await expect(page.getByLabel("7 days").first()).toBeVisible();
        await expect(page.getByLabel("30 days").first()).toBeVisible();
        await expect(page.getByLabel("All").first()).toBeVisible();
      }
    }
  }
});
