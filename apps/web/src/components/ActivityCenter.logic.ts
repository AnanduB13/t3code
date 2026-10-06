import {
  resolveThreadWorkingStartedAt,
  threadRuntimeIsActive,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { isLatestTurnCompleted } from "@t3tools/client-runtime/state/thread-settled";

import { isThreadCompletionUnread } from "./ThreadCompletionNotifications.logic";

export type ActivityCenterNotification = {
  readonly thread: EnvironmentThreadShell;
  readonly completedAt: string;
  readonly unread: boolean;
};

export type ActivityCenterRunningThread = {
  readonly thread: EnvironmentThreadShell;
  readonly startedAt: string;
  readonly status: "Working" | "Background work" | "Monitoring";
};

function validTimestamp(...values: readonly (string | null | undefined)[]): string | null {
  return (
    values.find(
      (value) => value !== null && value !== undefined && !Number.isNaN(Date.parse(value)),
    ) ?? null
  );
}

export function buildCompletionNotifications(input: {
  readonly threads: readonly EnvironmentThreadShell[];
  readonly lastVisitedAtByThreadKey: Readonly<Record<string, string>>;
}): readonly ActivityCenterNotification[] {
  return input.threads
    .flatMap((thread): ActivityCenterNotification[] => {
      const completedAt = thread.latestRun?.completedAt;
      if (thread.archivedAt !== null || !isLatestTurnCompleted(thread.latestRun) || !completedAt) {
        return [];
      }
      const unread = isThreadCompletionUnread(thread, input.lastVisitedAtByThreadKey);
      if (!unread) return [];
      return [
        {
          thread,
          completedAt,
          unread,
        },
      ];
    })
    .toSorted(
      (left, right) =>
        Date.parse(right.completedAt) - Date.parse(left.completedAt) ||
        left.thread.id.localeCompare(right.thread.id),
    );
}

/**
 * What a thread is doing right now, or null when it is idle. A run in progress
 * is "Working"; after the run settles, background work that will wake the
 * agent reads as "Monitoring" when only watch loops remain and "Background
 * work" otherwise. Commands left running (a dev server) do not count.
 */
export function resolveThreadActivityStatus(
  thread: Pick<EnvironmentThreadShell, "runtime" | "pendingBackgroundTasks">,
): ActivityCenterRunningThread["status"] | null {
  if (threadRuntimeIsActive(thread.runtime)) return "Working";
  if (thread.runtime?.status !== "idle") return null;
  const holding = thread.pendingBackgroundTasks.filter((task) => task.kind !== "command");
  if (holding.length === 0) return null;
  return holding.every((task) => task.kind === "monitor") ? "Monitoring" : "Background work";
}

export function buildRunningThreads(
  threads: readonly EnvironmentThreadShell[],
): readonly ActivityCenterRunningThread[] {
  return threads
    .flatMap((thread): ActivityCenterRunningThread[] => {
      if (thread.archivedAt !== null) return [];
      const status = resolveThreadActivityStatus(thread);
      if (status === null) return [];

      const unfinishedRun =
        thread.latestRun !== null && thread.latestRun.completedAt === null
          ? thread.latestRun
          : null;
      const startedAt = validTimestamp(
        resolveThreadWorkingStartedAt(thread),
        unfinishedRun?.startedAt,
        unfinishedRun?.requestedAt,
        thread.runtime?.updatedAt,
        thread.updatedAt,
      );
      return startedAt === null ? [] : [{ thread, startedAt, status }];
    })
    .toSorted(
      (left, right) =>
        Date.parse(right.startedAt) - Date.parse(left.startedAt) ||
        left.thread.id.localeCompare(right.thread.id),
    );
}
