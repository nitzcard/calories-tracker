import { expect, test } from "@playwright/test";
import { ensureCloudSession, isoDate, seedProfileAndEntries, signInToCloud } from "./helpers";

test("@history history calories survive date switch and refresh", async ({ page }) => {
  const today = isoDate(0);
  const yesterday = isoDate(-1);

  await page.goto("/", { waitUntil: "networkidle" });
  const auth = await seedProfileAndEntries(page, [
    { date: today, foodLogText: "eggs and toast", weight: 80.2, manualCalories: null },
    { date: yesterday, foodLogText: "chicken and rice", weight: 80.4, manualCalories: 1900 },
  ]);
  await signInToCloud(page, auth);

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "History" }).click();
  await page.locator("#historyPanel").scrollIntoViewIfNeeded();

  const todayCaloriesInput = page
    .locator("#historyPanel table tbody tr:nth-child(3) td.calories-column input")
    .first();
  await todayCaloriesInput.fill("2100");
  await todayCaloriesInput.blur();
  await page.waitForTimeout(900);

  await page.goto("/today", { waitUntil: "networkidle" });
  const selectedDateInput = page.locator("#dailyDeskPanel input[type='date']").first();
  await selectedDateInput.fill(yesterday);
  await selectedDateInput.blur();
  await page.waitForTimeout(300);

  await selectedDateInput.fill(today);
  await selectedDateInput.blur();
  await page.waitForTimeout(1200);

  await page.getByRole("button", { name: "History" }).click();
  await page.locator("#historyPanel").scrollIntoViewIfNeeded();

  await expect(
    page.locator("#historyPanel table tbody tr:nth-child(3) td.calories-column input").first(),
  ).toHaveValue("2100");
});

test("@history switching dates keeps each day's food log distinct", async ({ page }) => {
  const today = isoDate(0);
  const yesterday = isoDate(-1);

  await page.goto("/", { waitUntil: "networkidle" });
  const auth = await seedProfileAndEntries(page, [
    { date: today, foodLogText: "today seed", weight: 80.2, manualCalories: null },
    { date: yesterday, foodLogText: "yesterday seed", weight: 80.4, manualCalories: 1900 },
  ]);
  await signInToCloud(page, auth);

  const foodLog = page.locator("#dailyDeskPanel textarea").first();
  const selectedDateInput = page.locator("#dailyDeskPanel input[type='date']").first();

  await expect(foodLog).toHaveValue("today seed");
  await foodLog.fill("today unique entry");

  await selectedDateInput.fill(yesterday);
  await selectedDateInput.blur();
  await expect(foodLog).toHaveValue("yesterday seed");

  await foodLog.fill("yesterday unique entry");
  await selectedDateInput.fill(today);
  await selectedDateInput.blur();
  await expect(foodLog).toHaveValue("today unique entry");

  await page.reload({ waitUntil: "networkidle" });
  await ensureCloudSession(page, auth);

  const reloadedDateInput = page.locator("#dailyDeskPanel input[type='date']").first();
  const reloadedFoodLog = page.locator("#dailyDeskPanel textarea").first();
  await expect(reloadedFoodLog).toHaveValue("today unique entry");

  await reloadedDateInput.fill(yesterday);
  await reloadedDateInput.blur();
  await expect(reloadedFoodLog).toHaveValue("yesterday unique entry");
});
