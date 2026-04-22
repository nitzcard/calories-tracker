import { describe, expect, it } from "vitest";
import { mergeExportedAppData } from "./merge";
import { makeEntry, makeExportedData, makeNutritionSnapshot, makeProfile } from "../test/test-fixtures";

describe("mergeExportedAppData", () => {
  it("preserves explicit cleared weight from newer entry", () => {
    const remote = makeExportedData({
      dailyEntries: [
        makeEntry({
          date: "2026-04-20",
          weight: 82.1,
          updatedAt: "2026-04-20T09:00:00.000Z",
        }),
      ],
    });
    const local = makeExportedData({
      dailyEntries: [
        makeEntry({
          date: "2026-04-20",
          weight: null,
          updatedAt: "2026-04-21T09:00:00.000Z",
        }),
      ],
    });

    const merged = mergeExportedAppData(local, remote);

    expect(merged.dailyEntries[0]?.weight).toBeNull();
  });

  it("prefers richer newer nutrition snapshot while keeping newer manual calories", () => {
    const remote = makeExportedData({
      dailyEntries: [
        makeEntry({
          date: "2026-04-20",
          foodLogText: "oats and yogurt",
          manualCalories: null,
          nutritionSnapshot: makeNutritionSnapshot({
            updatedAt: "2026-04-21T08:00:00.000Z",
            calories: 320,
          }),
          aiStatus: "done",
          updatedAt: "2026-04-21T08:00:00.000Z",
        }),
      ],
    });
    const local = makeExportedData({
      dailyEntries: [
        makeEntry({
          date: "2026-04-20",
          foodLogText: "oats and yogurt",
          manualCalories: 2100,
          nutritionSnapshot: null,
          updatedAt: "2026-04-21T09:00:00.000Z",
        }),
      ],
    });

    const merged = mergeExportedAppData(local, remote);
    const entry = merged.dailyEntries[0];

    expect(entry?.manualCalories).toBe(2100);
    expect(entry?.nutritionSnapshot?.calories).toBe(320);
    expect(entry?.aiStatus).toBe("done");
  });

  it("marks analysis stale when newer food log no longer matches preserved nutrition", () => {
    const remote = makeExportedData({
      dailyEntries: [
        makeEntry({
          date: "2026-04-20",
          foodLogText: "oats and yogurt",
          nutritionSnapshot: makeNutritionSnapshot(),
          aiStatus: "done",
          updatedAt: "2026-04-21T08:00:00.000Z",
        }),
      ],
    });
    const local = makeExportedData({
      dailyEntries: [
        makeEntry({
          date: "2026-04-20",
          foodLogText: "oats yogurt and banana",
          nutritionSnapshot: null,
          updatedAt: "2026-04-21T09:00:00.000Z",
        }),
      ],
    });

    const merged = mergeExportedAppData(local, remote);

    expect(merged.dailyEntries[0]?.analysisStale).toBe(true);
  });

  it("keeps the newer food log even when the older one is longer", () => {
    const remote = makeExportedData({
      dailyEntries: [
        makeEntry({
          date: "2026-04-20",
          foodLogText: "eggs toast yogurt banana",
          updatedAt: "2026-04-21T08:00:00.000Z",
        }),
      ],
    });
    const local = makeExportedData({
      dailyEntries: [
        makeEntry({
          date: "2026-04-20",
          foodLogText: "eggs toast",
          updatedAt: "2026-04-21T09:00:00.000Z",
        }),
      ],
    });

    const merged = mergeExportedAppData(local, remote);

    expect(merged.dailyEntries[0]?.foodLogText).toBe("eggs toast");
  });

  it("prefers stronger remote profile over baseline local defaults", () => {
    const local = makeExportedData({
      profile: [
        makeProfile({
          age: null,
          height: null,
          estimatedWeight: null,
          targetWeight: null,
          bodyFat: null,
          themeMode: "system",
          updatedAt: "2026-04-21T10:00:00.000Z",
        }),
      ],
    });
    const remote = makeExportedData({
      profile: [
        makeProfile({
          age: 30,
          height: 175,
          activityFactor: "moderate",
          themeMode: "dark",
          updatedAt: "2026-04-20T10:00:00.000Z",
        }),
      ],
    });

    const merged = mergeExportedAppData(local, remote);

    expect(merged.profile[0]?.age).toBe(30);
    expect(merged.profile[0]?.height).toBe(175);
    expect(merged.profile[0]?.activityFactor).toBe("moderate");
    expect(merged.profile[0]?.themeMode).toBe("dark");
  });

  it("keeps a newer male sex choice instead of treating it like a weak default", () => {
    const local = makeExportedData({
      profile: [
        makeProfile({
          sex: "male",
          updatedAt: "2026-04-21T11:00:00.000Z",
        }),
      ],
    });
    const remote = makeExportedData({
      profile: [
        makeProfile({
          sex: "female",
          updatedAt: "2026-04-21T10:00:00.000Z",
        }),
      ],
    });

    const merged = mergeExportedAppData(local, remote);

    expect(merged.profile[0]?.sex).toBe("male");
  });
});
