import { describe, expect, it } from "vitest";
import { createSerialTaskQueue } from "./serialTaskQueue";

describe("createSerialTaskQueue", () => {
  it("runs tasks one after the other so a later save cannot overtake an earlier one", async () => {
    const queue = createSerialTaskQueue();
    const events: string[] = [];
    const releaseHandle: { current: null | (() => void) } = { current: null };

    const first = queue.enqueue(async () => {
      events.push("first:start");
      await new Promise<void>((resolve) => {
        releaseHandle.current = resolve;
      });
      events.push("first:end");
    });

    const second = queue.enqueue(async () => {
      events.push("second:start");
      events.push("second:end");
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    if (!releaseHandle.current) {
      throw new Error("first task did not register its release handle");
    }
    releaseHandle.current();
    await first;
    await second;

    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });
});
