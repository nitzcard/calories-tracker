import { describe, expect, it } from "vitest";
import { createDefaultProfile, normalizeCloudAppState } from "./app-state";

describe("normalizeCloudAppState", () => {
  it("normalizes legacy exported payload arrays into cloud state", () => {
    const state = normalizeCloudAppState({
      schemaVersion: "1",
      exportedAt: "2026-04-21T10:00:00.000Z",
      profile: [
        {
          ...createDefaultProfile(),
          age: 33,
        },
      ],
      dailyEntries: [
        {
          date: "2026-04-20",
          foodLogText: "eggs toast",
          weight: 80.5,
          manualCalories: 2100,
          analysisStale: false,
          nutritionSnapshot: null,
          aiStatus: "idle",
          aiError: null,
          updatedAt: "2026-04-21T10:00:00.000Z",
          createdAt: "2026-04-21T10:00:00.000Z",
        },
      ],
    });

    expect(state.profile.age).toBe(33);
    expect(state.dailyEntries).toHaveLength(1);
    expect(state.dailyEntries[0]?.foodLogText).toBe("eggs toast");
  });

  it("maps legacy Harris-Benedict choices to Mifflin-St Jeor", () => {
    const state = normalizeCloudAppState({
      profile: [
        {
          ...createDefaultProfile(),
          tdeeEquation: "harrisBenedict",
        },
      ],
    });

    expect(state.profile.tdeeEquation).toBe("mifflinStJeor");
  });
});
