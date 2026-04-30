import { expect, test } from "@playwright/test";
import { isoDate, readPersistedAppState, seedProfileAndEntries } from "./helpers";

test("@inputs all persisted inputs save in cloud-only UI", async ({ page }) => {
  const today = isoDate(0);
  const yesterday = isoDate(-1);
  await page.route("**/rest/v1/user_blobs*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: route.request().method() === "GET" ? "[]" : "[]",
    });
  });

  await page.goto("/login", { waitUntil: "networkidle" });
  await seedProfileAndEntries(page, [
    { date: today, foodLogText: "seed today", weight: 80.1, manualCalories: 2100 },
    { date: yesterday, foodLogText: "seed yesterday", weight: 80.4, manualCalories: 1900 },
  ], { signedInUsername: null });

  await page.reload({ waitUntil: "networkidle" });
  const cloudPanel = page.locator(".login-card");
  await expect(cloudPanel.locator('input[autocomplete="username"]')).toBeVisible();
  await cloudPanel.locator('input[autocomplete="username"]').fill("persist-user");
  await cloudPanel.locator('input[autocomplete="current-password"]').fill("secret-pass");
  await cloudPanel.getByRole("button", { name: "Login" }).click();
  await expect(page.locator(".login-card")).toHaveCount(0);

  await page.getByRole("button", { name: "Settings" }).click();

  await page.locator('input[type="password"]').fill("gemini-test-key");
  await page.locator('input[type="password"]').blur();

  const profilePanel = page.locator(".settings-column--profile").first();

  const profileSelects = profilePanel.locator("select");
  await profileSelects.nth(0).selectOption("female");
  await profileSelects.nth(1).selectOption("cut");
  await profileSelects.nth(2).selectOption("veryActive");

  const profileNumberInputs = profilePanel.locator('input[type="number"]');
  await profileNumberInputs.nth(0).fill("36");
  await profileNumberInputs.nth(1).fill("181");
  await profileNumberInputs.nth(2).fill("82.5");
  await profileNumberInputs.nth(3).fill("77.4");
  await profileNumberInputs.nth(4).fill("15.5");
  await profileNumberInputs.nth(4).blur();
  await page.waitForTimeout(2600);

  await page.locator("article").filter({ hasText: "Harris-Benedict" }).locator('input[type="radio"]').check();

  await page.getByRole("button", { name: "Today" }).click();
  await page.locator("#dailyDeskPanel .weight-input").first().fill("81.2");
  await page.locator("#dailyDeskPanel .weight-input").first().blur();

  await page.locator("#dailyDeskPanel textarea").first().fill("eggs toast salad");
  await page.locator("#dailyDeskPanel textarea").first().blur();
  await page.locator("#dailyDeskPanel").getByRole("button", { name: "Save only" }).click();

  await page.locator("#food-rules-textarea").fill("banana: 90 calories for 100 gr");
  await page.locator("header .title").click();
  await expect
    .poll(async () => (await readPersistedAppState(page)).profile?.foodInstructions ?? "")
    .toBe("banana: 90 calories for 100 gr");

  await page.getByRole("button", { name: "History" }).click();
  await page.getByTestId(`history-calories-${yesterday}`).fill("2050");
  await page.getByTestId(`history-calories-${yesterday}`).blur();
  await page.getByTestId(`history-weight-${yesterday}`).fill("79.9");
  await page.getByTestId(`history-weight-${yesterday}`).blur();

  await expect
    .poll(async () => {
      const state = await readPersistedAppState(page);
      const entry = state.dailyEntries.find((item: { date: string }) => item.date === today);
      return {
        foodLogText: entry?.foodLogText ?? "",
        weight: entry?.weight ?? null,
      };
    })
    .toMatchObject({
      foodLogText: "eggs toast salad",
      weight: 81.2,
    });

  await page.getByRole("button", { name: "עברית" }).click();
  await expect
    .poll(async () => {
      const state = await readPersistedAppState(page);
      return {
        locale: state.profile?.locale ?? "",
        foodInstructions: state.profile?.foodInstructions ?? "",
      };
    })
    .toMatchObject({
      locale: "he",
      foodInstructions: "banana: 90 calories for 100 gr",
    });
  await page.reload({ waitUntil: "networkidle" });

  await expect(page.locator(".sync-status")).toContainText("persist-user");

  const persisted = await readPersistedAppState(page);
  const todayEntry = persisted.dailyEntries.find((entry: { date: string }) => entry.date === today);
  const yesterdayEntry = persisted.dailyEntries.find((entry: { date: string }) => entry.date === yesterday);

  expect(persisted.localStorage.locale).toBe("he");

  expect(persisted.profile).toMatchObject({
    sex: "female",
    age: 36,
    height: 181,
    estimatedWeight: 82.5,
    targetWeight: 77.4,
    bodyFat: 15.5,
    goalMode: "cut",
    activityFactor: "veryActive",
    tdeeEquation: "harrisBenedict",
    foodInstructions: "banana: 90 calories for 100 gr",
    locale: "he",
  });

  expect(persisted.aiKeys).toMatchObject({
    gemini: "gemini-test-key",
  });

  expect(todayEntry).toMatchObject({
    date: today,
    foodLogText: "eggs toast salad",
    weight: 81.2,
  });

  expect(yesterdayEntry).toMatchObject({
    date: yesterday,
    weight: 79.9,
    manualCalories: 2050,
  });
});
