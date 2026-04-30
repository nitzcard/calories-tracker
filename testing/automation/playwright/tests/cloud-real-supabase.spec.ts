import { expect, test } from "@playwright/test";
import { clearAppStorage, readPersistedAppState } from "./helpers";

test("@cloud real Supabase roundtrip restores encrypted remote data", async ({ page }) => {
  const username = `codex-real-cloud-${Date.now()}`;
  const password = "codex-real-cloud-pass";
  const foodLogText = `real cloud sync oats ${Date.now()}`;

  await page.goto("/login", { waitUntil: "networkidle" });
  const login = page.locator(".login-card");
  await expect(login.locator('input[autocomplete="username"]')).toBeVisible();
  await login.locator('input[autocomplete="username"]').fill(username);
  await login.locator('input[autocomplete="current-password"]').fill(password);
  await login.getByRole("button", { name: "Login" }).click();
  await expect(page.locator(".login-card")).toHaveCount(0, { timeout: 20_000 });

  await page.locator("#dailyDeskPanel textarea").first().fill(foodLogText);
  await page.locator("#dailyDeskPanel").getByRole("button", { name: "Save only" }).click();

  await expect
    .poll(
      async () => {
        const state = await readPersistedAppState(page);
        return state.cloudSyncState?.pendingScopes ?? ["pending"];
      },
      { timeout: 25_000 },
    )
    .toEqual([]);

  await clearAppStorage(page);

  await page.goto("/login", { waitUntil: "networkidle" });
  const secondLogin = page.locator(".login-card");
  if (await secondLogin.count()) {
    await expect(secondLogin.locator('input[autocomplete="username"]')).toBeVisible();
    await secondLogin.locator('input[autocomplete="username"]').fill(username);
    await secondLogin.locator('input[autocomplete="current-password"]').fill(password);
    await secondLogin.getByRole("button", { name: "Login" }).click();
    await expect(page.locator(".login-card")).toHaveCount(0, { timeout: 20_000 });
  }

  await expect
    .poll(
      async () => {
        const state = await readPersistedAppState(page);
        return state.dailyEntries.some((entry: { foodLogText?: string }) => entry.foodLogText === foodLogText);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
});
