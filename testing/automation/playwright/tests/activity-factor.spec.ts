import { expect, test } from "@playwright/test";
import { signInToCloud, todayIso, seedProfileAndEntries } from "./helpers";

test("@profile activity factor selection updates the displayed multiplier", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const auth = await seedProfileAndEntries(page, [
    { date: todayIso(), foodLogText: "today log", weight: 80, manualCalories: 2200 },
  ]);
  await signInToCloud(page, auth);

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Settings" }).click();
  const selectedValue = page.locator(".tdee-card[data-selected='true'] .tdee-card__value").first();
  const before = (await selectedValue.textContent())?.trim();

  await page.getByTestId("activity-factor-select").selectOption("extraActive");
  await expect(selectedValue).not.toHaveText(before ?? "-");
});
