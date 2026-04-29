import { expect, test } from "@playwright/test";
import { readPersistedAppState } from "./helpers";

type FakeBlobRow = {
  username: string;
  data: unknown;
  updated_at: string;
};

test("@cloud sync now flushes pending profile and email input changes before upload", async ({ page }) => {
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

  await page.goto("/login", { waitUntil: "networkidle" });
  const authPanel = page.locator(".login-card");
  await expect(authPanel.locator('input[autocomplete="username"]')).toBeVisible();
  await authPanel.locator('input[autocomplete="username"]').fill("flush-user");
  await authPanel.locator('input[autocomplete="current-password"]').fill("secret-pass");
  await authPanel.getByRole("button", { name: "Login" }).click();

  await expect.poll(() => writeCount).toBeGreaterThan(0);
  await expect(page.locator(".login-card")).toHaveCount(0);

  await page.goto("/settings", { waitUntil: "networkidle" });

  const ageInput = page.locator(".settings-grid").nth(1).locator('input[type="number"]').first();
  await expect(ageInput).toBeVisible();
  await ageInput.fill("41");

  const emailInput = page.locator('input[autocomplete="email"]');
  await emailInput.fill("flush@example.com");

  await page.getByRole("button", { name: "Sync now" }).click();
  await expect.poll(() => writeCount).toBeGreaterThan(1);

  const savedRemote = remoteRows.get("flush-user");
  const encryptedPayload = savedRemote?.data as { kind?: string; box?: unknown; email?: string } | undefined;
  expect(encryptedPayload?.kind).toBe("encrypted-v1");
  expect(encryptedPayload?.email).toBe("flush@example.com");

  await page.evaluate(async () => {
    const deleteDb = (name: string) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`deleteDatabase blocked for ${name}`));
      });

    await deleteDb("calorie-tracker");
  });

  await page.reload({ waitUntil: "networkidle" });

  await expect
    .poll(async () => {
      const state = await readPersistedAppState(page);
      return {
        age: state.profile?.age ?? null,
        email: state.profile?.email ?? "",
      };
    })
    .toMatchObject({
      age: 41,
      email: "flush@example.com",
    });
});
