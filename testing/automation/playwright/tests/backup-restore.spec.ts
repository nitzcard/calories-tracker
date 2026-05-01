import fs from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { isoDate, readRemoteUserState, seedProfileAndEntries } from "./helpers";

test("@cloud backup download exports full app state as JSON", async ({ page }, testInfo) => {
  const today = isoDate(0);
  const auth = await seedProfileAndEntries(page, [
    { date: today, foodLogText: "backup oats and yogurt", weight: 80.4, manualCalories: 2150 },
  ]);

  await page.goto("/settings", { waitUntil: "networkidle" });
  await expect(page.locator(".login-card")).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const download = await downloadPromise;
  const targetPath = testInfo.outputPath(await download.suggestedFilename());
  await download.saveAs(targetPath);

  const raw = await fs.readFile(targetPath, "utf8");
  const parsed = JSON.parse(raw) as {
    kind: string;
    appState: {
      profile: { locale: string };
      dailyEntries: Array<{ date: string; foodLogText: string; weight: number | null }>;
    };
  };

  expect(parsed.kind).toBe("calorie-tracker-backup-v1");
  expect(parsed.appState.profile.locale).toBe("en");
  expect(parsed.appState.dailyEntries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        date: today,
        foodLogText: "backup oats and yogurt",
        weight: 80.4,
      }),
    ]),
  );

  const remote = await readRemoteUserState(auth.username, auth.password);
  expect(remote?.dailyEntries.some((entry) => entry.date === today && entry.foodLogText === "backup oats and yogurt")).toBe(true);
});

test("@cloud backup restore replaces cloud state and reloads after refresh", async ({ page }) => {
  const today = isoDate(0);
  const yesterday = isoDate(-1);
  const auth = await seedProfileAndEntries(page, [
    { date: today, foodLogText: "old cloud text", weight: 79.9, manualCalories: 2000 },
  ]);

  await page.goto("/settings", { waitUntil: "networkidle" });
  await expect(page.locator(".login-card")).toHaveCount(0);

  const backupJson = JSON.stringify({
    kind: "calorie-tracker-backup-v1",
    exportedAt: new Date().toISOString(),
    appState: {
      schemaVersion: "2",
      updatedAt: new Date().toISOString(),
      profile: {
        id: "default",
        sex: "female",
        email: "backup-restore@example.com",
        age: 36,
        height: 181,
        estimatedWeight: 82.5,
        targetWeight: 77.1,
        bodyFat: 15.2,
        goalMode: "cut",
        tdeeEquation: "cunningham",
        activityFactor: "veryActive",
        foodInstructions: "backup bread is 250 kcal per 100g",
        aiModel: "gemini-2.5-flash",
        locale: "en",
        themePreference: "system",
        historySummaryBaselineDate: yesterday,
        updatedAt: new Date().toISOString(),
      },
      dailyEntries: [
        {
          date: today,
          foodLogText: "restored backup text",
          weight: 81.7,
          manualCalories: 2345,
          analysisStale: false,
          nutritionSnapshot: null,
          aiStatus: "idle",
          aiError: null,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        {
          date: yesterday,
          foodLogText: "backup yesterday",
          weight: 81.2,
          manualCalories: 2100,
          analysisStale: false,
          nutritionSnapshot: null,
          aiStatus: "idle",
          aiError: null,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
      foodRules: [],
      aiKeys: {
        gemini: "restored-gemini-key",
      },
    },
  }, null, 2);

  await page.locator('#backupPanel input[type="file"]').setInputFiles({
    name: "restore-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backupJson, "utf8"),
  });

  await expect
    .poll(
      async () => {
        const remote = await readRemoteUserState(auth.username, auth.password);
        const todayEntry = remote?.dailyEntries.find((entry) => entry.date === today);
        return {
          foodLogText: todayEntry?.foodLogText ?? "",
          weight: todayEntry?.weight ?? null,
          manualCalories: todayEntry?.manualCalories ?? null,
          gemini: remote?.aiKeys.gemini ?? "",
          email: remote?.profile.email ?? "",
          equation: remote?.profile.tdeeEquation ?? "",
          instructions: remote?.profile.foodInstructions ?? "",
          baseline: remote?.profile.historySummaryBaselineDate ?? null,
        };
      },
      { timeout: 20_000 },
    )
    .toMatchObject({
      foodLogText: "restored backup text",
      weight: 81.7,
      manualCalories: 2345,
      gemini: "restored-gemini-key",
      email: "backup-restore@example.com",
      equation: "cunningham",
      instructions: "backup bread is 250 kcal per 100g",
      baseline: yesterday,
    });

  await page.goto("/today", { waitUntil: "networkidle" });
  await expect(page.locator("#dailyDeskPanel textarea").first()).toHaveValue("restored backup text");

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".login-card")).toHaveCount(0);
  await page.goto("/settings", { waitUntil: "networkidle" });
  await expect(page.locator('input[type="password"]').first()).toHaveValue("restored-gemini-key");
});
