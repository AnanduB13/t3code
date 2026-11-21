import {
  resolveThreadWorkingStartedAt,
  threadRuntimeIsActive,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { isLatestTurnCompleted } from "@t3tools/client-runtime/state/thread-settled";
import { msg } from "gt-react";

import { m, type MessageResolver } from "~/i18n/messages";

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
 * Idle or waiting on the user is null. A settled run whose background work only watches
 * reads as "Monitoring", other background work as "Background work"; commands left running
 * (a dev server) do not count.
 */
export function resolveThreadActivityStatus(
  thread: Pick<
    EnvironmentThreadShell,
    "runtime" | "pendingBackgroundTasks" | "hasPendingApprovals" | "hasPendingUserInput"
  >,
): ActivityCenterRunningThread["status"] | null {
  // A thread blocked on an approval or question waits on the user, not the
  // agent, so it belongs under "Needs you" rather than "Working".
  if (thread.hasPendingApprovals || thread.hasPendingUserInput) return null;
  // oxlint-disable-next-line t3code/no-untranslated-copy -- Status id; threadActivityStatusLabel translates it.
  if (threadRuntimeIsActive(thread.runtime)) return "Working";
  if (thread.runtime?.status !== "idle") return null;
  const holding = thread.pendingBackgroundTasks.filter((task) => task.kind !== "command");
  if (holding.length === 0) return null;
  // oxlint-disable-next-line t3code/no-untranslated-copy -- Status ids; threadActivityStatusLabel translates them.
  return holding.every((task) => task.kind === "monitor") ? "Monitoring" : "Background work";
}

export function threadActivityStatusLabel(
  status: ActivityCenterRunningThread["status"],
  resolve: MessageResolver = m,
): string {
  switch (status) {
    case "Working":
      return resolve(msg("Working", { $context: "thread activity status" }));
    case "Background work":
      return resolve(msg("Background work"));
    case "Monitoring":
      return resolve(msg("Monitoring", { $context: "thread activity status" }));
  }
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
