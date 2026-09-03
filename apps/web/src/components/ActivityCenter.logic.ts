import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

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
      const completedAt = thread.latestTurn?.completedAt;
      if (thread.archivedAt !== null || thread.latestTurn?.state !== "completed" || !completedAt) {
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

export function buildRunningThreads(
  threads: readonly EnvironmentThreadShell[],
): readonly ActivityCenterRunningThread[] {
  return threads
    .flatMap((thread): ActivityCenterRunningThread[] => {
      if (thread.archivedAt !== null) return [];
      const foregroundRunning =
        thread.latestTurn?.state === "running" ||
        thread.session?.status === "starting" ||
        thread.session?.status === "running";
      const status = foregroundRunning
        ? "Working"
        : thread.backgroundLiveness === "working"
          ? "Background work"
          : thread.backgroundLiveness === "monitoring"
            ? "Monitoring"
            : null;
      if (status === null) return [];

      const unfinishedTurn =
        thread.latestTurn !== null && thread.latestTurn.completedAt === null
          ? thread.latestTurn
          : null;
      const startedAt = validTimestamp(
        unfinishedTurn?.startedAt,
        unfinishedTurn?.requestedAt,
        thread.session?.updatedAt,
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
