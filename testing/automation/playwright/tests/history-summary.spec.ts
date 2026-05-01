import { expect, test } from "@playwright/test";
import { isoDate, seedProfileAndEntries, signInToCloud } from "./helpers";

test("@history last 7 days summary excludes older logged entries", async ({ page }) => {
  const dates = [0, -1, -2, -3, -4, -5, -20].map((offset) => isoDate(offset));

  await page.goto("/", { waitUntil: "networkidle" });
  const auth = await seedProfileAndEntries(
    page,
    dates.map((date, index) => ({
      date,
      foodLogText: `day ${index + 1}`,
      weight: 80 - index * 0.1,
      manualCalories: 2100,
    })),
  );
  await signInToCloud(page, auth);

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "History" }).click();
  await page.locator("#historyPanel").scrollIntoViewIfNeeded();

  await expect(page.getByTestId("history-all-time-delta")).toHaveText("2240");
  await expect(page.getByTestId("history-last7d-delta")).toHaveText("1920");
});
