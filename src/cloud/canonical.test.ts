import { describe, expect, it } from "vitest";
import { canonicalCloudFingerprint } from "./canonical";
import { makeEntry, makeExportedData, makeProfile } from "../test/test-fixtures";

describe("canonicalCloudFingerprint", () => {
  it("ignores exportedAt and syncQueue changes", () => {
    const base = makeExportedData({
      profile: [makeProfile()],
      dailyEntries: [makeEntry({ date: "2026-04-20", foodLogText: "eggs" })],
    });

    const variant = {
      ...base,
      exportedAt: "2026-04-22T12:00:00.000Z",
      syncQueue: [
        {
          id: 1,
          date: "2026-04-20",
          status: "pending" as const,
          attempts: 0,
          enqueuedAt: "2026-04-22T12:00:00.000Z",
          updatedAt: "2026-04-22T12:00:00.000Z",
          provider: "gemini-2.5-flash",
        },
      ],
    };

    expect(canonicalCloudFingerprint(base)).toBe(canonicalCloudFingerprint(variant));
  });

  it("changes when persisted cloud payload changes", () => {
    const base = makeExportedData({
      dailyEntries: [makeEntry({ date: "2026-04-20", foodLogText: "eggs" })],
    });
    const changed = makeExportedData({
      dailyEntries: [makeEntry({ date: "2026-04-20", foodLogText: "eggs and toast" })],
    });

    expect(canonicalCloudFingerprint(base)).not.toBe(canonicalCloudFingerprint(changed));
  });
});

