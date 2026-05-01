import { describe, expect, it } from "vitest";
import { createBackupDocument, parseBackupDocument, BACKUP_FILE_KIND } from "./backup";
import { makeCloudAppState, makeEntry, makeProfile } from "../test/test-fixtures";

function withNormalizedDefaults<T extends ReturnType<typeof makeCloudAppState>>(state: T) {
  return {
    ...state,
    profile: {
      ...state.profile,
      themePreference: state.profile.themePreference ?? "system",
      historySummaryBaselineDate: state.profile.historySummaryBaselineDate ?? null,
    },
  };
}

describe("backup document", () => {
  it("round-trips a full cloud state", () => {
    const state = makeCloudAppState({
      profile: makeProfile({ locale: "he", email: "test@example.com" }),
      dailyEntries: [
        makeEntry({
          date: "2026-04-30",
          foodLogText: "salmon and rice",
        }),
      ],
    });
    state.aiKeys.gemini = "secret";

    const doc = createBackupDocument(state);
    const parsed = parseBackupDocument(doc, "en");

    expect(doc.kind).toBe(BACKUP_FILE_KIND);
    expect(parsed).toEqual(withNormalizedDefaults(state));
  });

  it("accepts raw cloud state backups too", () => {
    const state = makeCloudAppState({
      dailyEntries: [makeEntry({ date: "2026-04-28", foodLogText: "eggs" })],
    });

    expect(parseBackupDocument(state, "en")).toEqual(withNormalizedDefaults(state));
  });

  it("rejects unsupported payloads", () => {
    expect(() => parseBackupDocument({ hello: "world" }, "en")).toThrow(
      "Backup file format is not supported.",
    );
  });
});
