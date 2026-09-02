import { describe, expect, it, vi } from "vite-plus/test";

import { createSerializedAbortableExecutor } from "./computerUseExecution.ts";

describe("serialized Computer Use execution", () => {
  it("cancels queued work before it reaches native input", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const run = vi.fn(async (value: string, signal: AbortSignal) => {
      if (value === "first") await firstGate;
      if (signal.aborted) throw new Error("cancelled");
      return value;
    });
    const executor = createSerializedAbortableExecutor(run);
    const first = executor.execute("first-request", "first");
    const second = executor.execute("second-request", "second");

    executor.cancel("second-request");
    releaseFirst();

    await expect(first).resolves.toBe("first");
    await expect(second).rejects.toThrow("cancelled");
    expect(run.mock.calls.map(([value]) => value)).toEqual(["first", "second"]);
  });

  it("aborts every active and queued request when the host stops", async () => {
    const run = (value: string, signal: AbortSignal) =>
      new Promise<string>((resolve, reject) => {
        if (signal.aborted) {
          reject(new Error("cancelled"));
          return;
        }
        signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
      });
    const executor = createSerializedAbortableExecutor(run);
    const active = executor.execute("active-request", "active");
    const queued = executor.execute("queued-request", "queued");

    executor.cancelAll();

    await expect(active).rejects.toThrow("cancelled");
    await expect(queued).rejects.toThrow("cancelled");
  });
});
