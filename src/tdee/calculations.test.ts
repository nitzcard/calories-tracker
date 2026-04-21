import { describe, expect, it } from "vitest";
import { buildTdeeSnapshot, calculateObservedTdee } from "./calculations";
import {
  makeEntry,
  makeInsufficientObservedEntries,
  makeObservedTdeeEntries,
  makeProfile,
} from "../test/test-fixtures";

describe("calculateObservedTdee", () => {
  it("returns null when valid entries are below minimum count", () => {
    expect(calculateObservedTdee(makeInsufficientObservedEntries())).toBeNull();
  });

  it("returns observed value when entry count and span are sufficient", () => {
    const observed = calculateObservedTdee(makeObservedTdeeEntries());

    expect(observed).not.toBeNull();
    expect(observed).toBeGreaterThan(0);
  });
});

describe("buildTdeeSnapshot", () => {
  it("reports insufficient span when count is enough but range is too short", () => {
    const entries = [
      makeEntry({ date: "2026-04-01", weight: 82, manualCalories: 2400 }),
      makeEntry({ date: "2026-04-02", weight: 81.8, manualCalories: 2380 }),
      makeEntry({ date: "2026-04-03", weight: 81.7, manualCalories: 2370 }),
      makeEntry({ date: "2026-04-05", weight: 81.5, manualCalories: 2350 }),
    ];

    const snapshot = buildTdeeSnapshot(entries, makeProfile({ tdeeEquation: "observedTdee" }));

    expect(snapshot.observedTdee).toBeNull();
    expect(snapshot.observedReason).toBe("insufficient_span");
  });

  it("uses custom tdee when selected and keeps formula breakdown", () => {
    const snapshot = buildTdeeSnapshot(
      makeObservedTdeeEntries(),
      makeProfile({
        tdeeEquation: "custom",
        customTdee: 2550,
      }),
    );

    expect(snapshot.selectedValue).toBe(2550);
    expect(snapshot.formulaBreakdown.mifflinStJeor).toBeTypeOf("number");
    expect(snapshot.formulaWeight).toBe(80);
  });
});
