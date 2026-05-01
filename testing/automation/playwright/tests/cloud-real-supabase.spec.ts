import { expect, test } from "@playwright/test";
import { readPersistedAppState, readRemoteUserState, resetRemoteUser } from "./helpers";

test("@cloud real Supabase roundtrip restores encrypted remote data", async ({ page }) => {
  const username = `test_codex-real-cloud-${Date.now()}`;
  const password = "codex-real-cloud-pass";
  const foodLogText = `real cloud sync oats ${Date.now()}`;
  await resetRemoteUser(username);

  await page.goto("/login", { waitUntil: "networkidle" });
  const login = page.locator(".login-card");
  await expect(login.locator('input[autocomplete="username"]')).toBeVisible();
  await login.locator('input[autocomplete="username"]').fill(username);
  await login.locator('input[autocomplete="current-password"]').fill(password);
  await login.getByRole("button", { name: "Login" }).click();
  await expect(page.locator(".login-card")).toHaveCount(0, { timeout: 20_000 });

  await page.locator("#dailyDeskPanel textarea").first().fill(foodLogText);

  await expect
    .poll(
      async () => {
        const state = await readPersistedAppState(page);
        return state.dailyEntries.some((entry: { foodLogText?: string }) => entry.foodLogText === foodLogText);
      },
      { timeout: 25_000 },
    )
    .toBe(true);

  await expect
    .poll(
      async () =>
        (await readRemoteUserState(username, password))?.dailyEntries.some(
          (entry: { foodLogText?: string }) => entry.foodLogText === foodLogText,
        ) ?? false,
      { timeout: 25_000 },
    )
    .toBe(true);

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".login-card")).toHaveCount(0);
  await expect(page.locator(".sync-status")).toContainText(username);

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
