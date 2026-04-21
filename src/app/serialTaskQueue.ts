export function createSerialTaskQueue() {
  let tail: Promise<void> = Promise.resolve();

  function enqueue(task: () => Promise<void>) {
    const run = tail.then(task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return { enqueue };
}
