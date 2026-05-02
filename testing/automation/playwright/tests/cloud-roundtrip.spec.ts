import { expect, test } from "@playwright/test";
import { isoDate, readPersistedAppState, readRemoteUserBlob, resetRemoteUser } from "./helpers";

test("@cloud real Supabase roundtrip persists and reloads remote data", async ({ page }) => {
  const today = isoDate(0);
  const username = `test_playwright-user-${Date.now()}`;
  const password = "secret-pass";
  await resetRemoteUser(username);
  try {
    await page.goto("/login", { waitUntil: "networkidle" });
    const cloudPanel = page.locator(".login-card");
    await expect(cloudPanel.locator('input[autocomplete="username"]')).toBeVisible();
    await cloudPanel.locator('input[autocomplete="username"]').fill(username);
    await cloudPanel.locator('input[autocomplete="current-password"]').fill(password);
    await cloudPanel.locator('input[autocomplete="email"]').fill("playwright@example.com");
    await cloudPanel.getByRole("button", { name: "Login" }).click();

    await expect(page.locator(".login-card")).toHaveCount(0);
    await expect(page.locator("header .sync-status")).toContainText(username);

    await page.locator("#dailyDeskPanel .weight-input").first().fill("81.3");
    await page.locator("#dailyDeskPanel .weight-input").first().blur();
    await page.locator("#dailyDeskPanel textarea").first().fill("cloud synced oats and yogurt");
    await page.locator("#dailyDeskPanel textarea").first().blur();

    await expect
      .poll(async () => readRemoteUserBlob(username), { timeout: 25_000 })
      .not.toBeNull();

    const savedRemote = await readRemoteUserBlob(username);
    expect(savedRemote).toBeTruthy();
    const remotePayload = savedRemote?.data as { kind?: string; box?: unknown; email?: string } | undefined;
    expect(remotePayload?.kind).toBe("encrypted-v1");
    expect(remotePayload?.email).toBe("playwright@example.com");

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".login-card")).toHaveCount(0);
    await expect(page.locator(".sync-status")).toContainText(username);

    await expect
      .poll(async () => readRemoteUserBlob(username), { timeout: 20_000 })
      .not.toBeNull();

    await expect
      .poll(async () => {
        const state = await readPersistedAppState(page);
        const entry = state.dailyEntries.find((item: { date: string }) => item.date === today);
        return entry?.foodLogText ?? "";
      }, { timeout: 25_000 })
      .toBe("cloud synced oats and yogurt");

    const restored = await readPersistedAppState(page);
    const restoredToday = restored.dailyEntries.find((entry: { date: string }) => entry.date === today);
    expect(restoredToday).toMatchObject({
      date: today,
      foodLogText: "cloud synced oats and yogurt",
      weight: 81.3,
    });
  } finally {
    await resetRemoteUser(username);
  }
});
