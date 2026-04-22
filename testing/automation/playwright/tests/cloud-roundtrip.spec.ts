import { expect, test } from "@playwright/test";
import { clearAppStorage, isoDate, readPersistedAppState } from "./helpers";

type FakeBlobRow = {
  username: string;
  data: unknown;
  updated_at: string;
};

test("@cloud mocked Supabase roundtrip persists and reloads remote data", async ({ page }) => {
  const today = isoDate(0);
  const remoteRows = new Map<string, FakeBlobRow>();
  let writeCount = 0;

  await page.route("**/rest/v1/user_blobs*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const usernameFilter = url.searchParams.get("username");
    const username = usernameFilter?.startsWith("eq.") ? decodeURIComponent(usernameFilter.slice(3)) : null;

    if (request.method() === "GET") {
      const row = username ? remoteRows.get(username) ?? null : null;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(row ? [{ data: row.data, updated_at: row.updated_at }] : []),
      });
      return;
    }

    if (request.method() === "POST") {
      const payload = JSON.parse(request.postData() ?? "{}");
      const row = Array.isArray(payload) ? payload[0] : payload;
      const nextRow: FakeBlobRow = {
        username: row.username,
        data: row.data,
        updated_at: row.updated_at,
      };
      remoteRows.set(nextRow.username, nextRow);
      writeCount += 1;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.goto("/", { waitUntil: "networkidle" });
  const cloudPanel = page.locator("main.app-shell--blocked");
  await cloudPanel.locator('input[autocomplete="username"]').fill("playwright-user");
  await cloudPanel.locator('input[autocomplete="current-password"]').fill("secret-pass");

  await cloudPanel.getByRole("button", { name: "Login" }).click();

  await expect.poll(() => writeCount).toBeGreaterThan(0);
  await expect(page.locator("main.app-shell--blocked")).toHaveCount(0);
  await expect(page.locator("header .sync-pill")).toContainText("Cloud");

  await page.locator("#dailyDeskPanel .weight-input").first().fill("81.3");
  await page.locator("#dailyDeskPanel .weight-input").first().blur();
  await page.locator("#dailyDeskPanel textarea").first().fill("cloud synced oats and yogurt");
  await page.locator("#dailyDeskPanel textarea").first().blur();
  await page.locator("#appSetupPanel .constant-data-grid > *").nth(0).getByRole("button", { name: "Sync now" }).click();

  const savedRemote = remoteRows.get("playwright-user");
  expect(savedRemote).toBeTruthy();
  const remotePayload = savedRemote?.data as { kind?: string; box?: unknown; email?: string } | undefined;
  expect(remotePayload?.kind).toBe("encrypted-v1");

  await clearAppStorage(page);
  await page.reload({ waitUntil: "networkidle" });
  const freshCloudPanel = page.locator("main.app-shell--blocked");
  await freshCloudPanel.locator('input[autocomplete="username"]').fill("playwright-user");
  await freshCloudPanel.locator('input[autocomplete="current-password"]').fill("secret-pass");
  await freshCloudPanel.getByRole("button", { name: "Login" }).click();

  await expect
    .poll(async () => {
      const state = await readPersistedAppState(page);
      const entry = state.dailyEntries.find((item: { date: string }) => item.date === today);
      return entry?.foodLogText ?? "";
    }, { timeout: 15000 })
    .toBe("cloud synced oats and yogurt");

  const restored = await readPersistedAppState(page);
  const restoredToday = restored.dailyEntries.find((entry: { date: string }) => entry.date === today);
  expect(restoredToday).toMatchObject({
    date: today,
    foodLogText: "cloud synced oats and yogurt",
    weight: 81.3,
  });
});
