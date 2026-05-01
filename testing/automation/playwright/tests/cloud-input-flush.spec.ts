import { expect, test } from "@playwright/test";
import { readPersistedAppState, readRemoteUserBlob, resetRemoteUser } from "./helpers";

test("@cloud auto sync flushes pending profile and email input changes before upload", async ({ page }) => {
  const username = `test_flush-user-${Date.now()}`;
  const password = "secret-pass";
  await resetRemoteUser(username);

  await page.goto("/login", { waitUntil: "networkidle" });
  const authPanel = page.locator(".login-card");
  await expect(authPanel.locator('input[autocomplete="username"]')).toBeVisible();
  await authPanel.locator('input[autocomplete="username"]').fill(username);
  await authPanel.locator('input[autocomplete="current-password"]').fill(password);
  await authPanel.locator('input[autocomplete="email"]').fill("flush@example.com");
  await authPanel.getByRole("button", { name: "Login" }).click();

  await expect(page.locator(".login-card")).toHaveCount(0);

  await page.getByRole("button", { name: "Settings" }).click();

  const ageInput = page.locator(".settings-column--profile").locator('input[type="number"]').first();
  await expect(ageInput).toBeVisible();
  await ageInput.fill("41");

  await expect
    .poll(async () => {
      const state = await readPersistedAppState(page);
      return {
        age: state.profile?.age ?? null,
        email: state.profile?.email ?? "",
      };
    }, { timeout: 20_000 })
    .toMatchObject({
      age: 41,
      email: "flush@example.com",
    });

  const savedRemote = await readRemoteUserBlob(username);
  const encryptedPayload = savedRemote?.data as { kind?: string; box?: unknown; email?: string } | undefined;
  expect(encryptedPayload?.kind).toBe("encrypted-v1");
  expect(encryptedPayload?.email).toBe("flush@example.com");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".login-card")).toHaveCount(0);
  await expect(page.locator(".sync-status")).toContainText(username);

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
