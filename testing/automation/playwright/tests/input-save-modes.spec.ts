import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { isoDate, readPersistedAppState, seedProfileAndEntries } from "./helpers";

async function forceOpenPanel(page: Page, selector: string) {
  await page.locator(selector).evaluate((node: Element) => {
    if (node instanceof HTMLDetailsElement) {
      node.open = true;
    }
  });
}

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

  await page.goto("/", { waitUntil: "networkidle" });
  await seedProfileAndEntries(page, [
    { date: today, foodLogText: "seed today", weight: 80.1, manualCalories: 2100 },
    { date: yesterday, foodLogText: "seed yesterday", weight: 80.4, manualCalories: 1900 },
  ]);

  await page.reload({ waitUntil: "networkidle" });
  const cloudPanel = page.locator("main.app-shell--blocked");
  await expect(page.locator("header .sync-pill")).toContainText("Sign in");
  await cloudPanel.locator('input[autocomplete="username"]').fill("persist-user");
  await cloudPanel.locator('input[autocomplete="current-password"]').fill("secret-pass");
  await cloudPanel.getByRole("button", { name: "Login" }).click();
  await expect(page.locator("main.app-shell--blocked")).toHaveCount(0);

  await forceOpenPanel(page, "#appSetupPanel");
  await forceOpenPanel(page, "#constantDataPanel");

  const appSetup = page.locator("#appSetupPanel");
  const appSetupGridItems = appSetup.locator(".constant-data-grid > *");
  const cloudPanelInsideApp = appSetupGridItems.nth(0);
  const apiKeysPanel = appSetupGridItems.nth(1);
  const profilePanel = page.locator("#constantDataPanel .constant-data-grid > *").nth(0);
  const tdeePanel = page.locator("#constantDataPanel .constant-data-grid > *").nth(1);

  await cloudPanelInsideApp.locator('input[type="email"]').fill("qa@example.com");
  await cloudPanelInsideApp.locator('input[type="email"]').blur();

  await apiKeysPanel.locator('input[type="password"]').fill("gemini-test-key");
  await apiKeysPanel.locator('input[type="password"]').blur();

  const headerSelects = page.locator("header select");
  await headerSelects.nth(1).selectOption("dark");

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

  await tdeePanel
    .locator("tr")
    .filter({ hasText: "Harris-Benedict" })
    .locator('input[type="radio"]')
    .first()
    .check();

  await page.locator("#dailyDeskPanel .weight-input").first().fill("81.2");
  await page.locator("#dailyDeskPanel .weight-input").first().blur();

  await page.locator("#dailyDeskPanel textarea").first().fill("eggs toast salad");
  await page.locator("#dailyDeskPanel textarea").first().blur();

  await page.locator("#food-rules-textarea").fill("banana: 90 calories for 100 gr");
  await page.locator("header .title").click();
  await expect
    .poll(async () => (await readPersistedAppState(page)).profile?.foodInstructions ?? "")
    .toBe("banana: 90 calories for 100 gr");

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

  await headerSelects.nth(0).selectOption("he");
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "networkidle" });

  await expect(page.locator("header .sync-pill")).toContainText("התחבר");

  const persisted = await readPersistedAppState(page);
  const todayEntry = persisted.dailyEntries.find((entry: { date: string }) => entry.date === today);
  const yesterdayEntry = persisted.dailyEntries.find((entry: { date: string }) => entry.date === yesterday);

  expect(persisted.localStorage.locale).toBe("he");
  expect(persisted.localStorage.themeMode).toBe("dark");

  expect(persisted.profile).toMatchObject({
    sex: "female",
    email: "qa@example.com",
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
    themeMode: "dark",
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
