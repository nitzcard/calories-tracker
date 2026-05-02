import { expect, test } from "@playwright/test";
import { createDefaultProfile, type CloudAppState } from "../../../../src/cloud/app-state";
import { readRemoteUserBlob, readRemoteUserState, resetRemoteUser, writeRemoteUserState } from "./helpers";

test("@cloud supabase smoke writes and reads remote state directly", async () => {
  const username = `test_cloud-smoke-${Date.now()}`;
  const password = "cloud-smoke-pass";

  const state: CloudAppState = {
    schemaVersion: "2",
    updatedAt: new Date().toISOString(),
    profile: {
      ...createDefaultProfile("en"),
      email: "smoke@example.com",
      age: 37,
      height: 181,
      estimatedWeight: 82,
      targetWeight: 79,
      bodyFat: 17,
      activityFactor: "moderate",
      aiModel: "gemini-2.5-flash",
      updatedAt: new Date().toISOString(),
    },
    dailyEntries: [
      {
        date: new Date().toISOString().slice(0, 10),
        foodLogText: "supabase smoke test entry",
        weight: 82.4,
        manualCalories: 2190,
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
      gemini: "",
    },
  };

  await resetRemoteUser(username);
  await writeRemoteUserState(username, password, state);

  await expect
    .poll(async () => readRemoteUserBlob(username), { timeout: 20_000 })
    .not.toBeNull();

  const remote = await readRemoteUserState(username, password);
  expect(remote).toMatchObject({
    profile: {
      email: "smoke@example.com",
      age: 37,
      height: 181,
      estimatedWeight: 82,
      targetWeight: 79,
      bodyFat: 17,
    },
  });
  expect(remote?.dailyEntries).toHaveLength(1);
  expect(remote?.dailyEntries[0]).toMatchObject({
    foodLogText: "supabase smoke test entry",
    weight: 82.4,
    manualCalories: 2190,
  });
});
