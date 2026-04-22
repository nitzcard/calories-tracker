import { expect, test, type Locator, type Page } from "@playwright/test";

async function openPanel(page: Page, selector: string) {
  await page.locator(selector).evaluate((element) => {
    if (element instanceof HTMLDetailsElement) {
      element.open = true;
    }
  });
}

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

  await openPanel(page, "#appSetupPanel");
  await openPanel(page, "#constantDataPanel");

  const usernameInput = page.locator('input[autocomplete="username"]').first();
  const cloudModeSelect = page.locator("#appSetupPanel select").first();
  const profileSelect = page.getByTestId("activity-factor-select");
  const weightInput = page.locator("#dailyDeskPanel .weight-input").first();

  await expectWithinViewport(page, usernameInput);
  await expectWithinViewport(page, cloudModeSelect);
  await expectWithinViewport(page, profileSelect);
  await expectWithinViewport(page, weightInput);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("desktop fields stay compact unless layout opts into full width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/");

  await openPanel(page, "#appSetupPanel");
  await openPanel(page, "#constantDataPanel");

  await expectMaxWidth(page.locator('input[autocomplete="username"]').first(), 320);
  await expectMaxWidth(page.locator('input[autocomplete="current-password"]').first(), 320);
  await expectMaxWidth(page.locator("#appSetupPanel select").first(), 280);
  await expectMaxWidth(page.locator('#constantDataPanel input[type="number"]').first(), 220);
});
