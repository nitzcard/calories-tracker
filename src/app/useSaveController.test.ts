import { afterEach, describe, expect, it, vi } from "vitest";
import { useSaveController } from "./useSaveController";

describe("useSaveController", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid same-field edits and commits only the latest value", async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const changedScopes: string[][] = [];
    let latest = "a";

    const controller = useSaveController({
      debounceMs: 25,
      onChanged: (scopes) => {
        changedScopes.push(scopes);
      },
    });

    controller.schedule({
      fieldKey: "field",
      scopes: "field",
      save: async () => {
        saved.push(latest);
        return true;
      },
    });
    latest = "ab";
    controller.schedule({
      fieldKey: "field",
      scopes: "field",
      save: async () => {
        saved.push(latest);
        return true;
      },
    });
    latest = "abc";
    controller.schedule({
      fieldKey: "field",
      scopes: "field",
      save: async () => {
        saved.push(latest);
        return true;
      },
    });

    await vi.advanceTimersByTimeAsync(25);

    expect(saved).toEqual(["abc"]);
    expect(changedScopes).toEqual([["field"]]);
  });

  it("serializes different fields without dropping either save", async () => {
    const controller = useSaveController({ onChanged: vi.fn() });
    const events: string[] = [];

    await Promise.all([
      controller.runNow({
        fieldKey: "a",
        scopes: "a",
        save: async () => {
          events.push("a");
          return true;
        },
      }),
      controller.runNow({
        fieldKey: "b",
        scopes: "b",
        save: async () => {
          events.push("b");
          return true;
        },
      }),
    ]);

    expect(events).toEqual(["a", "b"]);
  });

  it("skips unchanged values before persistence", async () => {
    const save = vi.fn(async () => true);
    const onChanged = vi.fn();
    const controller = useSaveController({ onChanged });

    const changed = await controller.runNow({
      fieldKey: "same",
      scopes: "same",
      shouldSave: () => false,
      save,
    });

    expect(changed).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("runs a second pass when a newer edit arrives during an in-flight save", async () => {
    const controller = useSaveController({ onChanged: vi.fn() });
    const saved: string[] = [];
    let latest = "first";
    let releaseFirst: (() => void) | null = null;

    const first = controller.runNow({
      fieldKey: "field",
      scopes: "field",
      save: async () => {
        saved.push(latest);
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        return true;
      },
    });

    await Promise.resolve();
    latest = "second";
    const second = controller.runNow({
      fieldKey: "field",
      scopes: "field",
      save: async () => {
        saved.push(latest);
        return true;
      },
    });

    expect(saved).toEqual(["first"]);
    if (!releaseFirst) throw new Error("first save did not start");
    const release = releaseFirst as () => void;
    release();
    await Promise.all([first, second]);

    expect(saved).toEqual(["first", "second"]);
  });

  it("keeps failed dirty work retryable", async () => {
    const controller = useSaveController({ onChanged: vi.fn() });
    const save = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(true);

    await expect(
      controller.runNow({
        fieldKey: "field",
        scopes: "field",
        save,
      }),
    ).rejects.toThrow("boom");

    await expect(
      controller.runNow({
        fieldKey: "field",
        scopes: "field",
        save,
      }),
    ).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("coalesces different field spinners when they share a queue key", async () => {
    vi.useFakeTimers();
    const controller = useSaveController({ debounceMs: 20, onChanged: vi.fn() });
    const saved: string[] = [];

    controller.schedule({
      fieldKey: "profile.age",
      queueKey: "profile",
      scopes: "profile.age",
      save: async () => {
        saved.push("age");
        return true;
      },
    });
    controller.schedule({
      fieldKey: "profile.locale",
      queueKey: "profile",
      scopes: "profile.locale",
      save: async () => {
        saved.push("locale");
        return true;
      },
    });

    await vi.advanceTimersByTimeAsync(20);

    expect(saved).toEqual(["locale"]);
  });
});
