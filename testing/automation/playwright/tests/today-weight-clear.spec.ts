import { expect, test } from "@playwright/test";
import { seedProfileAndEntries, todayIso } from "./helpers";

test("@weight clearing current-day weight persists after refresh", async ({ page }) => {
  const date = todayIso();

  await page.goto("/", { waitUntil: "networkidle" });
  await seedProfileAndEntries(page, [
    {
      date,
      foodLogText: "test food log",
      weight: 80.4,
      manualCalories: null,
    },
  ]);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#dailyDeskPanel").scrollIntoViewIfNeeded();

  const todayWeightInput = page.locator("#dailyDeskPanel .weight-input").first();
  await expect(todayWeightInput).toHaveValue("80.4");

  await todayWeightInput.fill("");
  await todayWeightInput.blur();
  await page.waitForTimeout(1100);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#dailyDeskPanel").scrollIntoViewIfNeeded();
  await expect(page.locator("#dailyDeskPanel .weight-input").first()).toHaveValue("");
});
