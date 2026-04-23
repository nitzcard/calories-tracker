import { expect, test } from "@playwright/test";
import { initializeCloudSyncState, isoDate, readPersistedAppState, seedProfileAndEntries } from "./helpers";

test("@inputs rapid edits coalesce into one committed revision per field", async ({ page }) => {
  const today = isoDate(0);
  await page.route("**/rest/v1/user_blobs*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: route.request().method() === "GET" ? "[]" : "[]",
    });
  });

  await page.goto("/login", { waitUntil: "networkidle" });
  await seedProfileAndEntries(page, [
    { date: today, foodLogText: "base log", weight: 80.1, manualCalories: 2100 },
  ], { signedInUsername: null });
  await initializeCloudSyncState(page, {
    revision: 5,
    lastSyncedRevision: 5,
    pendingScopes: [],
    lastRemoteFingerprint: "fingerprint-1",
  });

  await page.reload({ waitUntil: "networkidle" });

  const before = await readPersistedAppState(page);
  const beforeToday = before.dailyEntries.find((entry: { date: string }) => entry.date === today);

  const cloudPanel = page.locator("main.app-shell--blocked");
  await cloudPanel.locator('input[autocomplete="username"]').fill("coalesced-user");
  await cloudPanel.locator('input[autocomplete="current-password"]').fill("secret-pass");
  await cloudPanel.getByRole("button", { name: "Login" }).click();
  await expect(page.locator("main.app-shell--blocked")).toHaveCount(0);

  const foodLog = page.locator("#dailyDeskPanel textarea").first();
  await foodLog.fill("base log plus");
  await foodLog.fill("base log plus fruit");
  await foodLog.fill("base log plus fruit and yogurt");
  await foodLog.blur();
  await page.locator("#dailyDeskPanel").getByRole("button", { name: "Save only" }).click();

  const ageInput = page.locator("#constantDataPanel .constant-data-grid > *").nth(0).locator('input[type="number"]').nth(0);
  await ageInput.fill("35");
  await ageInput.fill("36");
  await ageInput.fill("37");

  await expect
    .poll(async () => {
      const state = await readPersistedAppState(page);
      const entry = state.dailyEntries.find((item: { date: string }) => item.date === today);
      return {
        age: state.profile?.age ?? null,
        foodLogText: entry?.foodLogText ?? "",
      };
    })
    .toMatchObject({
      age: 37,
      foodLogText: "base log plus fruit and yogurt",
    });

  const after = await readPersistedAppState(page);
  const afterToday = after.dailyEntries.find((entry: { date: string }) => entry.date === today);

  expect(after.profile?.age).toBe(37);
  expect(afterToday?.foodLogText).toBe("base log plus fruit and yogurt");
  expect(after.profile?.updatedAt).not.toBe(before.profile?.updatedAt);
  expect(afterToday?.updatedAt).not.toBe(beforeToday?.updatedAt);
  expect(after.cloudSyncState?.revision ?? 0).toBeGreaterThanOrEqual(6);
});
