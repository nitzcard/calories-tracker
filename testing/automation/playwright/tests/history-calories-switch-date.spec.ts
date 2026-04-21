import { expect, test } from "@playwright/test";
import { isoDate, seedProfileAndEntries } from "./helpers";

test("@history history calories survive date switch and refresh", async ({ page }) => {
  const today = isoDate(0);
  const yesterday = isoDate(-1);

  await page.goto("/", { waitUntil: "networkidle" });
  await seedProfileAndEntries(page, [
    { date: today, foodLogText: "eggs and toast", weight: 80.2, manualCalories: null },
    { date: yesterday, foodLogText: "chicken and rice", weight: 80.4, manualCalories: 1900 },
  ]);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#historyPanel").scrollIntoViewIfNeeded();

  const todayCaloriesInput = page
    .locator("#historyPanel table tbody tr:nth-child(3) td.calories-column input")
    .first();
  await todayCaloriesInput.fill("2100");
  await todayCaloriesInput.blur();
  await page.waitForTimeout(900);

  const selectedDateInput = page.locator("#dailyDeskPanel input[type='date']").first();
  await selectedDateInput.fill(yesterday);
  await selectedDateInput.blur();
  await page.waitForTimeout(300);

  await selectedDateInput.fill(today);
  await selectedDateInput.blur();
  await page.waitForTimeout(1200);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#historyPanel").scrollIntoViewIfNeeded();

  await expect(
    page.locator("#historyPanel table tbody tr:nth-child(3) td.calories-column input").first(),
  ).toHaveValue("2100");
});
