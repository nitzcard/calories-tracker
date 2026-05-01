import { describe, expect, it } from "vitest";
import { canonicalCloudFingerprint } from "./canonical";
import { makeCloudAppState, makeEntry, makeProfile } from "../test/test-fixtures";

describe("canonicalCloudFingerprint", () => {
  it("ignores updatedAt changes", () => {
    const base = makeCloudAppState({
      profile: makeProfile(),
      dailyEntries: [makeEntry({ date: "2026-04-20", foodLogText: "eggs" })],
    });

    const variant = {
      ...base,
      updatedAt: "2026-04-22T12:00:00.000Z",
    };

    expect(canonicalCloudFingerprint(base)).toBe(canonicalCloudFingerprint(variant));
  });

  it("changes when persisted cloud payload changes", () => {
    const base = makeCloudAppState({
      dailyEntries: [makeEntry({ date: "2026-04-20", foodLogText: "eggs" })],
    });
    const changed = makeCloudAppState({
      dailyEntries: [makeEntry({ date: "2026-04-20", foodLogText: "eggs and toast" })],
    });

    expect(canonicalCloudFingerprint(base)).not.toBe(canonicalCloudFingerprint(changed));
  });
});
