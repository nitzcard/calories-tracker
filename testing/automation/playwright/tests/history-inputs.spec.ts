import { expect, test } from "@playwright/test";
import { isoDate, seedProfileAndEntries, signInToCloud } from "./helpers";

test("@inputs history weight and calories persist independently", async ({ page }) => {
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

  await page.getByTestId(`history-calories-${yesterday}`).fill("2050");
  await page.getByTestId(`history-calories-${yesterday}`).blur();
  await page.waitForTimeout(900);

  await page.getByTestId(`history-weight-${yesterday}`).fill("79.9");
  await page.getByTestId(`history-weight-${yesterday}`).blur();
  await page.waitForTimeout(900);

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "History" }).click();
  await page.locator("#historyPanel").scrollIntoViewIfNeeded();

  await expect(page.getByTestId(`history-calories-${yesterday}`)).toHaveValue("2050");
  await expect(page.getByTestId(`history-weight-${yesterday}`)).toHaveValue("79.9");
});

test("@inputs today weight stays in sync with today's history row", async ({ page }) => {
  const today = isoDate(0);
  const yesterday = isoDate(-1);

  await page.goto("/", { waitUntil: "networkidle" });
  const auth = await seedProfileAndEntries(page, [
    { date: today, foodLogText: "today log", weight: 80.1, manualCalories: 2100 },
    { date: yesterday, foodLogText: "yesterday log", weight: 80.4, manualCalories: 1900 },
  ]);
  await signInToCloud(page, auth);

  await page.reload({ waitUntil: "networkidle" });

  const todayWeight = page.locator("#dailyDeskPanel .weight-input").first();
  await todayWeight.fill("79.8");
  await todayWeight.blur();
  await expect(todayWeight).toHaveValue("79.8");

  await page.getByRole("button", { name: "History" }).click();
  await page.locator("#historyPanel").scrollIntoViewIfNeeded();
  await expect(page.getByTestId(`history-weight-${today}`)).toHaveValue("79.8");

  await page.getByTestId(`history-weight-${today}`).fill("79.3");
  await page.getByTestId(`history-weight-${today}`).blur();
  await expect(page.getByTestId(`history-weight-${today}`)).toHaveValue("79.3");

  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.locator("#dailyDeskPanel .weight-input").first()).toHaveValue("79.3");
});

test("@inputs invalid history weight input does not overwrite saved value", async ({ page }) => {
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

  await page.getByTestId(`history-weight-${yesterday}`).fill("0");
  await page.getByTestId(`history-weight-${yesterday}`).blur();
  await page.waitForTimeout(900);

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "History" }).click();
  await page.locator("#historyPanel").scrollIntoViewIfNeeded();

  await expect(page.getByTestId(`history-weight-${yesterday}`)).toHaveValue("80.4");
});

test("@inputs clearing history calories persists explicit clear", async ({ page }) => {
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

  await page.getByTestId(`history-calories-${yesterday}`).fill("");
  await page.getByTestId(`history-calories-${yesterday}`).blur();
  await page.waitForTimeout(900);

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "History" }).click();
  await page.locator("#historyPanel").scrollIntoViewIfNeeded();

  await expect(page.getByTestId(`history-calories-${yesterday}`)).toHaveValue("");
});
