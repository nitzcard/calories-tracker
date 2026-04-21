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

  it("uses average calories and start-to-end weight change", () => {
    expect(calculateObservedTdee(makeObservedTdeeEntries())).toBe(3253);
  });
});

describe("buildTdeeSnapshot", () => {
  it("keeps formula rows present when required profile values are missing", () => {
    const snapshot = buildTdeeSnapshot(
      makeObservedTdeeEntries(),
      makeProfile({ age: null, height: null, estimatedWeight: null }),
    );

    expect(snapshot.formulaBreakdown).toMatchObject({
      mifflinStJeor: null,
      harrisBenedict: null,
      cunningham: null,
    });
    expect(snapshot.formulaTdeeAverage).toBeNull();
  });

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

  it("defaults to mifflin-st jeor and keeps formula breakdown", () => {
    const snapshot = buildTdeeSnapshot(makeObservedTdeeEntries(), makeProfile());

    expect(snapshot.selectedEquation).toBe("mifflinStJeor");
    expect(snapshot.selectedValue).toBe(snapshot.formulaBreakdown.mifflinStJeor);
    expect(snapshot.formulaBreakdown.mifflinStJeor).toBeTypeOf("number");
    expect(snapshot.formulaWeight).toBe(80);
  });
});
