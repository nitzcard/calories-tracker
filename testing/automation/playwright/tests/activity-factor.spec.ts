import { expect, test } from "@playwright/test";
import { todayIso, seedProfileAndEntries } from "./helpers";

test("@profile activity factor selection updates the displayed multiplier", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await seedProfileAndEntries(page, [
    { date: todayIso(), foodLogText: "today log", weight: 80, manualCalories: 2200 },
  ]);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#constantDataPanel").evaluate((panel) => {
    (panel as HTMLDetailsElement).open = true;
  });
  await expect(page.locator(".tdee-formula-meta", { hasText: "Activity multiplier: 1.375" }).first()).toBeVisible();

  await page.getByTestId("activity-factor-select").selectOption("extraActive");

  await expect(page.locator(".tdee-formula-meta", { hasText: "Activity multiplier: 1.9" }).first()).toBeVisible();
});
