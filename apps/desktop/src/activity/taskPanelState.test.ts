import { EnvironmentId, ThreadId, type DesktopTask } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { currentTask, formatTaskElapsed, nextTask, taskKey } from "./taskPanelState.ts";

const task: DesktopTask = {
  environmentId: EnvironmentId.make("one"),
  threadId: ThreadId.make("same-id"),
  title: "Tests",
  project: "App",
  detail: "Working",
  status: "running",
  startedAt: "2026-10-24T10:00:00Z",
};

describe("task panel timing and rotation", () => {
  it.each([
    [0, "0s"],
    [59_000, "59s"],
    [60_000, "1m 0s"],
    [312_000, "5m 12s"],
    [3_661_000, "1h 1m"],
    [-10_000, "0s"],
  ])("formats elapsed time at %i milliseconds", (offset, expected) => {
    expect(formatTaskElapsed(task, Date.parse(task.startedAt!) + offset)).toBe(expected);
  });
  it("does not invent elapsed time for older payloads or invalid timestamps", () => {
    expect(formatTaskElapsed({ ...task, startedAt: null }, 0)).toBe("—");
    expect(formatTaskElapsed({ ...task, startedAt: "invalid" }, 0)).toBe("—");
  });
  it("rotates and wraps across environments even when thread IDs match", () => {
    const other = { ...task, environmentId: EnvironmentId.make("two") };
    expect(nextTask([task, other], taskKey(task))).toBe(other);
    expect(nextTask([task, other], taskKey(other))).toBe(task);
    expect(currentTask([other, task], taskKey(task))).toBe(task);
    expect(currentTask([other], taskKey(task))).toBe(other);
    expect(nextTask([], null)).toBeUndefined();
  });
});
