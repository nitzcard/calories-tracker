import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareIsoDates, diffIsoDays, localIsoDate } from "./dates";

const originalTemporal = (globalThis as any).Temporal;

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as any).Temporal = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  (globalThis as any).Temporal = originalTemporal;
});

describe("localIsoDate", () => {
  it("falls back to Date when Temporal is unavailable", () => {
    vi.setSystemTime(new Date(2026, 3, 22, 12, 0, 0, 0));

    expect(localIsoDate()).toBe("2026-04-22");
  });

  it("treats pre-6am logging as previous day without Temporal", () => {
    expect(localIsoDate(new Date(2026, 3, 22, 3, 30, 0, 0))).toBe("2026-04-21");
    expect(localIsoDate(new Date(2026, 3, 22, 6, 0, 0, 0))).toBe("2026-04-22");
  });
});

describe("ISO date helpers", () => {
  it("compares ISO dates in calendar order", () => {
    expect(compareIsoDates("2026-04-21", "2026-04-22")).toBeLessThan(0);
    expect(compareIsoDates("2026-04-22", "2026-04-22")).toBe(0);
    expect(compareIsoDates("2026-04-23", "2026-04-22")).toBeGreaterThan(0);
  });

  it("calculates calendar-day span for ISO dates", () => {
    expect(diffIsoDays("2026-04-01", "2026-04-08")).toBe(7);
    expect(diffIsoDays("2026-04-08", "2026-04-01")).toBe(-7);
  });
});
