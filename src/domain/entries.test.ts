import { describe, expect, it } from "vitest";
import { deducedWeightFromEntries, resolvedDailyCalories } from "./entries";
import { makeEntry, makeNutritionSnapshot } from "../test/test-fixtures";

describe("resolvedDailyCalories", () => {
  it("prefers manual calories over analyzed calories", () => {
    const entry = makeEntry({
      date: "2026-04-20",
      manualCalories: 2100,
      nutritionSnapshot: makeNutritionSnapshot({ calories: 320 }),
    });

    expect(resolvedDailyCalories(entry)).toBe(2100);
  });

  it("falls back to analyzed calories when manual calories missing", () => {
    const entry = makeEntry({
      date: "2026-04-20",
      nutritionSnapshot: makeNutritionSnapshot({ calories: 320 }),
    });

    expect(resolvedDailyCalories(entry)).toBe(320);
  });
});

describe("deducedWeightFromEntries", () => {
  it("returns exact logged weight for anchor date", () => {
    const entries = [
      makeEntry({ date: "2026-04-19", weight: 81.2 }),
      makeEntry({ date: "2026-04-20", weight: 80.96 }),
    ];

    expect(deducedWeightFromEntries(entries, "2026-04-20")).toBe(81);
  });

  it("falls back to previous logged weight when anchor date missing weight", () => {
    const entries = [
      makeEntry({ date: "2026-04-18", weight: 81.2 }),
      makeEntry({ date: "2026-04-19", weight: null }),
      makeEntry({ date: "2026-04-20", weight: null }),
    ];

    expect(deducedWeightFromEntries(entries, "2026-04-20")).toBe(81.2);
  });
});
