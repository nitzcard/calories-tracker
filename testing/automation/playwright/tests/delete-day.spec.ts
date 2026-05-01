import { expect, test } from "@playwright/test";
import { isoDate, seedProfileAndEntries, signInToCloud } from "./helpers";

test("@delete deleting selected day removes it from history", async ({ page }) => {
  const today = isoDate(0);
  const yesterday = isoDate(-1);

  await page.goto("/", { waitUntil: "networkidle" });
  const auth = await seedProfileAndEntries(page, [
    { date: today, foodLogText: "today log", weight: 80.1, manualCalories: 2100 },
    { date: yesterday, foodLogText: "yesterday log", weight: 80.4, manualCalories: 1900 },
  ]);
  await signInToCloud(page, auth);

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "History" }).click();
  await page.locator("#historyPanel").scrollIntoViewIfNeeded();

  await expect(page.locator("#historyPanel .history-table-wrap button[data-delete-date]")).toHaveCount(2);

  await page.locator(`#historyPanel .history-table-wrap button[data-delete-date='${yesterday}']`).first().click();
  await page.locator("[data-delete-dialog-confirm]").click();

  await page.waitForTimeout(700);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "History" }).click();
  await page.locator("#historyPanel").scrollIntoViewIfNeeded();

  await expect(page.locator(`#historyPanel .history-table-wrap button[data-delete-date='${yesterday}']`)).toHaveCount(0);
  await expect(page.locator(`#historyPanel .history-table-wrap button[data-delete-date='${today}']`)).toHaveCount(1);
  await expect(page.locator("#historyPanel .history-table-wrap button[data-delete-date]")).toHaveCount(1);
});

test("@delete deleting a day updates the all-time deficit summary", async ({ page }) => {
  const today = isoDate(0);
  const yesterday = isoDate(-1);

  await page.goto("/", { waitUntil: "networkidle" });
  const auth = await seedProfileAndEntries(page, [
    { date: today, foodLogText: "today log", weight: 80.1, manualCalories: 2100 },
    { date: yesterday, foodLogText: "yesterday log", weight: 80.4, manualCalories: 1900 },
  ]);
  await signInToCloud(page, auth);

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "History" }).click();
  await page.locator("#historyPanel").scrollIntoViewIfNeeded();

  const beforeDelta = Number((await page.getByTestId("history-all-time-delta").textContent()) ?? "0");

  await page.locator(`#historyPanel .history-table-wrap button[data-delete-date='${yesterday}']`).first().click();
  await page.locator("[data-delete-dialog-confirm]").click();
  await page.waitForTimeout(700);

  const afterDelta = Number((await page.getByTestId("history-all-time-delta").textContent()) ?? "0");
  expect(afterDelta).toBeLessThan(beforeDelta);
});
