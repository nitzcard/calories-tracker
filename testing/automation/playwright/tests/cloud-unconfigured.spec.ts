import { expect, test } from "@playwright/test";

test("@cloud selecting cloud mode without Supabase blocks the app and allows local fallback", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#appSetupPanel").evaluate((node) => {
    if (node instanceof HTMLDetailsElement) node.open = true;
  });

  const cloudPanel = page.locator("#appSetupPanel .constant-data-grid > *").nth(0);
  await expect(cloudPanel.locator(".cloud-mode-field select")).toHaveValue("offline");

  await cloudPanel.locator(".cloud-mode-field select").selectOption("cloud");

  const blockedShell = page.locator("main.app-shell--blocked");
  await expect(blockedShell).toBeVisible();
  await expect(blockedShell).toContainText("Supabase is not configured in this build.");
  await expect(blockedShell.getByRole("button", { name: "Local" })).toBeVisible();

  await expect(page.locator("#dailyDeskPanel")).toHaveCount(0);
  await expect(page.locator("#appSetupPanel")).toHaveCount(0);

  await blockedShell.getByRole("button", { name: "Local" }).click();

  await expect(page.locator("main.app-shell--blocked")).toHaveCount(0);
  await expect(page.locator("#appSetupPanel")).toBeVisible();
  await expect(page.locator("#dailyDeskPanel")).toBeVisible();

  const restoredCloudPanel = page.locator("#appSetupPanel .constant-data-grid > *").nth(0);
  await expect(restoredCloudPanel.locator(".cloud-mode-field select")).toHaveValue("offline");
});
