import { expect, test } from "@playwright/test";

test("@cloud missing Supabase hard-blocks app in cloud-only mode", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const blockedShell = page.locator("main.app-shell--blocked");
  await expect(blockedShell).toBeVisible();
  await expect(blockedShell).toContainText("Supabase is not configured in this build.");
  await expect(blockedShell.getByRole("button", { name: "Local" })).toHaveCount(0);

  await expect(page.locator("#dailyDeskPanel")).toHaveCount(0);
  await expect(page.locator("#appSetupPanel")).toHaveCount(0);
});
