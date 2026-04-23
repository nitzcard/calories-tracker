import { expect, test } from "@playwright/test";
import { initializeCloudSyncState, isoDate, readPersistedAppState, seedProfileAndEntries } from "./helpers";

test("@inputs unchanged saves do not rewrite persisted timestamps or sync revision", async ({ page }) => {
  const today = isoDate(0);
  const yesterday = isoDate(-1);

  await page.goto("/", { waitUntil: "networkidle" });
  await seedProfileAndEntries(page, [
    { date: today, foodLogText: "same today log", weight: 80.1, manualCalories: 2100 },
    { date: yesterday, foodLogText: "same yesterday log", weight: 80.4, manualCalories: 1900 },
  ]);
  await initializeCloudSyncState(page, {
    revision: 7,
    lastSyncedRevision: 7,
    pendingScopes: [],
    lastRemoteFingerprint: "fingerprint-1",
  });

  await page.reload({ waitUntil: "networkidle" });

  const before = await readPersistedAppState(page);
  const beforeToday = before.dailyEntries.find((entry: { date: string }) => entry.date === today);
  const beforeYesterday = before.dailyEntries.find((entry: { date: string }) => entry.date === yesterday);

  expect(before.profile).toBeTruthy();
  expect(beforeToday).toBeTruthy();
  expect(beforeYesterday).toBeTruthy();
  expect(before.cloudSyncState?.revision).toBe(7);

  const headerSelects = page.locator("header select");
  await headerSelects.nth(0).selectOption("en");

  await page.locator("#dailyDeskPanel .weight-input").first().fill("80.1");
  await page.locator("#dailyDeskPanel .weight-input").first().blur();

  await page.locator("#dailyDeskPanel textarea").first().fill("same today log");
  await page.locator("#dailyDeskPanel textarea").first().blur();

  await page.locator("#food-rules-textarea").fill("");
  await page.locator("#food-rules-textarea").blur();

  await page.locator("#constantDataPanel .constant-data-grid > *").nth(1)
    .locator("tr")
    .filter({ hasText: "Mifflin-St Jeor" })
    .locator('input[type="radio"]')
    .first()
    .check();

  await page.locator("#historyPanel").scrollIntoViewIfNeeded();
  await page.getByTestId(`history-calories-${yesterday}`).fill("1900");
  await page.getByTestId(`history-calories-${yesterday}`).blur();
  await page.getByTestId(`history-weight-${yesterday}`).fill("80.4");
  await page.getByTestId(`history-weight-${yesterday}`).blur();

  await page.waitForTimeout(2600);

  const after = await readPersistedAppState(page);
  const afterToday = after.dailyEntries.find((entry: { date: string }) => entry.date === today);
  const afterYesterday = after.dailyEntries.find((entry: { date: string }) => entry.date === yesterday);

  expect(after.profile?.updatedAt).toBe(before.profile?.updatedAt);
  expect(afterToday?.updatedAt).toBe(beforeToday?.updatedAt);
  expect(afterYesterday?.updatedAt).toBe(beforeYesterday?.updatedAt);
  expect(after.cloudSyncState?.revision).toBe(7);
  expect(after.cloudSyncState?.pendingScopes ?? []).toEqual([]);
  expect(after.cloudSyncState?.lastRemoteFingerprint).toBe("fingerprint-1");
});
