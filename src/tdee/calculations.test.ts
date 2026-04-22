import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTdeeSnapshot,
  calculateObservedTdee,
  calculateFormulaTdee,
} from "./calculations";
import {
  makeEntry,
  makeInsufficientObservedEntries,
  makeObservedTdeeEntries,
  makeProfile,
} from "../test/test-fixtures";

const originalTemporal = (globalThis as any).Temporal;

class MockPlainDate {
  year: number;
  month: number;
  day: number;

  constructor(year: number, month: number, day: number) {
    this.year = year;
    this.month = month;
    this.day = day;
  }

  toString() {
    const month = String(this.month).padStart(2, "0");
    const day = String(this.day).padStart(2, "0");
    return `${this.year}-${month}-${day}`;
  }

  until(other: MockPlainDate) {
    const start = Date.UTC(this.year, this.month - 1, this.day);
    const end = Date.UTC(other.year, other.month - 1, other.day);
    return { days: Math.round((end - start) / 86400000) };
  }
}

function toPlainDate(value: string | MockPlainDate) {
  if (value instanceof MockPlainDate) {
    return value;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new MockPlainDate(year, month, day);
}

function makeZonedDateTime(date: Date) {
  return {
    hour: date.getUTCHours(),
    subtract({ days }: { days: number }) {
      return makeZonedDateTime(new Date(date.getTime() - days * 86400000));
    },
    toPlainDate() {
      return new MockPlainDate(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
      );
    },
  };
}

function installTemporalMock() {
  (globalThis as any).Temporal = {
    Now: {
      timeZoneId: () => "UTC",
      plainDateISO: () => new MockPlainDate(2026, 4, 22),
      zonedDateTimeISO: () => makeZonedDateTime(new Date()),
    },
    Instant: {
      fromEpochMilliseconds: (ms: number) => ({
        toZonedDateTimeISO: () => makeZonedDateTime(new Date(ms)),
      }),
    },
    PlainDate: {
      from: (value: string | MockPlainDate) => toPlainDate(value),
      compare: (left: MockPlainDate, right: MockPlainDate) => {
        const a = Date.UTC(left.year, left.month - 1, left.day);
        const b = Date.UTC(right.year, right.month - 1, right.day);
        return a === b ? 0 : a < b ? -1 : 1;
      },
    },
  };
}

beforeEach(() => {
  installTemporalMock();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 3, 22, 12, 0, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
  (globalThis as any).Temporal = originalTemporal;
});

describe("calculateObservedTdee", () => {
  it("returns null when valid entries are below minimum count", () => {
    expect(calculateObservedTdee(makeInsufficientObservedEntries())).toBeNull();
  });

  it("uses average calories and start-to-end weight change", () => {
    expect(calculateObservedTdee(makeObservedTdeeEntries())).toBe(3252);
  });

  it("ignores today's incomplete entry", () => {
    const entries = [
      ...makeObservedTdeeEntries(),
      makeEntry({ date: "2026-04-22", weight: 79.5, manualCalories: 900 }),
    ];

    expect(calculateObservedTdee(entries)).toBe(3252);
  });
});

describe("calculateFormulaTdee", () => {
  it("uses the selected activity factor directly", () => {
    const profile = makeProfile({
      activityFactor: "moderate",
    });

    const result = calculateFormulaTdee(profile, 80);

    expect(result.activityMultiplier).toBe(1.55);
  });

  it("supports the extra active multiplier", () => {
    const profile = makeProfile({
      activityFactor: "extraActive",
    });

    const result = calculateFormulaTdee(profile, 80);

    expect(result.activityMultiplier).toBe(1.9);
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

  it("ends observed TDEE at yesterday when today has a partial log", () => {
    const entries = [
      ...makeObservedTdeeEntries(),
      makeEntry({ date: "2026-04-22", weight: 79.5, manualCalories: 900 }),
    ];

    const snapshot = buildTdeeSnapshot(entries, makeProfile({ tdeeEquation: "observedTdee" }));

    expect(snapshot.observedTdee).toBe(3252);
    expect(snapshot.observedToDate).toBe("2026-04-08");
    expect(snapshot.observedValidEntryCount).toBe(4);
  });
});
