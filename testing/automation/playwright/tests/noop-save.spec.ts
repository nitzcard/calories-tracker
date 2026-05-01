import { expect, test } from "@playwright/test";
import { isoDate, readPersistedAppState, seedProfileAndEntries, signInToCloud } from "./helpers";

test("@inputs unchanged saves do not rewrite persisted timestamps", async ({ page }) => {
  const today = isoDate(0);
  const yesterday = isoDate(-1);

  const auth = await seedProfileAndEntries(page, [
    { date: today, foodLogText: "same today log", weight: 80.1, manualCalories: 2100 },
    { date: yesterday, foodLogText: "same yesterday log", weight: 80.4, manualCalories: 1900 },
  ]);
  await signInToCloud(page, auth);

  const before = await readPersistedAppState(page);
  const beforeToday = before.dailyEntries.find((entry: { date: string }) => entry.date === today);
  const beforeYesterday = before.dailyEntries.find((entry: { date: string }) => entry.date === yesterday);

  expect(before.profile).toBeTruthy();
  expect(beforeToday).toBeTruthy();
  expect(beforeYesterday).toBeTruthy();

  await page.getByRole("button", { name: "English" }).click();

  await page.locator("#dailyDeskPanel .weight-input").first().fill("80.1");
  await page.locator("#dailyDeskPanel .weight-input").first().blur();

  await page.locator("#dailyDeskPanel textarea").first().fill("same today log");
  await page.locator("#dailyDeskPanel textarea").first().blur();

  await page.locator("#food-rules-textarea").fill("");
  await page.locator("#food-rules-textarea").blur();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator("article").filter({ hasText: "Mifflin-St Jeor" }).locator('input[type="radio"]').check();

  await page.getByRole("button", { name: "History" }).click();
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
});
