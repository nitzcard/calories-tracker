import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectWithinViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(391);
}

async function expectMaxWidth(locator: Locator, maxWidth: number) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeLessThanOrEqual(maxWidth);
}

test("mobile layout stays usable without Temporal", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "Temporal", {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator("h1")).toBeVisible();

  const usernameInput = page.locator('input[autocomplete="username"]').first();
  const passwordInput = page.locator('input[autocomplete="current-password"]').first();
  const languageSelect = page.locator("header select").nth(0);

  await expectWithinViewport(page, usernameInput);
  await expectWithinViewport(page, passwordInput);
  await expectWithinViewport(page, languageSelect);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("desktop fields stay compact unless layout opts into full width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/");

  await expectMaxWidth(page.locator('input[autocomplete="username"]').first(), 320);
  await expectMaxWidth(page.locator('input[autocomplete="current-password"]').first(), 320);
  await expectMaxWidth(page.locator("header select").first(), 220);
});
