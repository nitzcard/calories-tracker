import { expect, test } from "@playwright/test";
import { isoDate, readPersistedAppState, seedProfileAndEntries } from "./helpers";

test("@inputs rapid edits coalesce into one committed state per field", async ({ page }) => {
  const today = isoDate(0);
  await seedProfileAndEntries(page, [
    { date: today, foodLogText: "base log", weight: 80.1, manualCalories: 2100 },
  ], { signedInUsername: null, seedUsername: "test_coalesced-user" });
  await page.goto("/login", { waitUntil: "networkidle" });

  const before = await readPersistedAppState(page);
  const beforeToday = before.dailyEntries.find((entry: { date: string }) => entry.date === today);

  const cloudPanel = page.locator(".login-card");
  await cloudPanel.locator('input[autocomplete="username"]').fill("test_coalesced-user");
  await cloudPanel.locator('input[autocomplete="current-password"]').fill("secret-pass");
  await cloudPanel.getByRole("button", { name: "Login" }).click();
  await expect(page.locator(".login-card")).toHaveCount(0);

  const foodLog = page.locator("#dailyDeskPanel textarea").first();
  await foodLog.fill("base log plus");
  await foodLog.fill("base log plus fruit");
  await foodLog.fill("base log plus fruit and yogurt");
  await expect
    .poll(async () => {
      const state = await readPersistedAppState(page);
      const entry = state.dailyEntries.find((item: { date: string }) => item.date === today);
      return entry?.foodLogText ?? "";
    })
    .toBe("base log plus fruit and yogurt");

  await page.getByRole("button", { name: "Settings" }).click();
  const ageInput = page.locator(".settings-column--profile").locator('input[type="number"]').nth(0);
  await ageInput.fill("35");
  await ageInput.fill("36");
  await ageInput.fill("37");

  await expect
    .poll(async () => {
      const state = await readPersistedAppState(page);
      return state.profile?.age ?? null;
    })
    .toBe(37);

  const after = await readPersistedAppState(page);
  const afterToday = after.dailyEntries.find((entry: { date: string }) => entry.date === today);

  expect(after.profile?.age).toBe(37);
  expect(afterToday?.updatedAt).not.toBe(beforeToday?.updatedAt);
});
