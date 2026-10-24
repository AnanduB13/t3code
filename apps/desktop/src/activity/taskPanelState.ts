import type { DesktopTask } from "@t3tools/contracts";

export const TASK_PANEL_ROTATION_MS = 4_000;

export const taskKey = (task: DesktopTask) => JSON.stringify([task.environmentId, task.threadId]);

/** Preserve the visible thread across shell updates; removal starts at the first remaining task. */
export function currentTask(tasks: readonly DesktopTask[], key: string | null) {
  return tasks.find((task) => taskKey(task) === key) ?? tasks[0];
}

export function nextTask(tasks: readonly DesktopTask[], key: string | null) {
  const index = tasks.findIndex((task) => taskKey(task) === key);
  return tasks[(index + 1) % tasks.length];
}

/** Clock time comes from the current turn, never from volatile shell update timestamps. */
export function formatTaskElapsed(task: DesktopTask, now: number): string {
  if (!task.startedAt) return "—";
  const start = Date.parse(task.startedAt);
  if (!Number.isFinite(start)) return "—";
  const seconds = Math.max(0, Math.floor((now - start) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
