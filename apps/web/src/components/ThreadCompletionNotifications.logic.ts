import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { isLatestTurnCompleted } from "@t3tools/client-runtime/state/thread-settled";

export type ThreadCompletionSnapshot = ReadonlyMap<
  string,
  { readonly turnId: string; readonly state: string }
>;

type CloseableNotification = {
  close: () => void;
};

export function closeThreadSystemNotification<T extends CloseableNotification>(
  notifications: Map<string, T>,
  threadKey: string,
): boolean {
  const notification = notifications.get(threadKey);
  if (!notification) return false;
  notifications.delete(threadKey);
  notification.close();
  return true;
}

export function snapshotThreadCompletions(
  threads: readonly EnvironmentThreadShell[],
): ThreadCompletionSnapshot {
  return new Map(
    threads.flatMap((thread) => {
      const turn = thread.latestTurn;
      return turn === null
        ? []
        : [
            [
              scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
              { turnId: turn.turnId, state: turn.state },
            ] as const,
          ];
    }),
  );
}

/**
 * Returns only live completion edges. The first shell snapshot is used as a
 * baseline by the caller, so reconnecting cannot replay old completed work.
 */
export function findNewlyCompletedThreads(
  previous: ThreadCompletionSnapshot,
  threads: readonly EnvironmentThreadShell[],
): EnvironmentThreadShell[] {
  return threads.filter((thread) => {
    const turn = thread.latestTurn;
    if (turn?.state !== "completed") return false;

    const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
    const prior = previous.get(key);
    if (prior === undefined) return false;
    return prior.turnId !== turn.turnId || prior.state !== "completed";
  });
}

export function hasUnseenCompletionInProjectKind(input: {
  readonly threads: readonly EnvironmentThreadShell[];
  readonly lastVisitedAtByThreadKey: Readonly<Record<string, string>>;
  readonly isIncludedProject: (thread: EnvironmentThreadShell) => boolean;
}): boolean {
  return input.threads.some((thread) => {
    if (thread.archivedAt !== null || !input.isIncludedProject(thread)) {
      return false;
    }
    return isThreadCompletionUnread(thread, input.lastVisitedAtByThreadKey);
  });
}

/**
 * A completion is unread only when this client observed the thread before it
 * finished and has not visited the finished turn. Missing visit markers are
 * deliberately treated as read so connecting a new client does not turn the
 * entire thread history into a notification backlog.
 */
export function isThreadCompletionUnread(
  thread: EnvironmentThreadShell,
  lastVisitedAtByThreadKey: Readonly<Record<string, string>>,
): boolean {
  const completedAt = thread.latestTurn?.completedAt;
  if (!isLatestTurnCompleted(thread.latestTurn) || !completedAt) return false;
  const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
  const lastVisitedAt = lastVisitedAtByThreadKey[threadKey];
  if (!lastVisitedAt) return false;
  const completedAtMs = Date.parse(completedAt);
  const lastVisitedAtMs = Date.parse(lastVisitedAt);
  if (Number.isNaN(completedAtMs)) return false;
  return Number.isNaN(lastVisitedAtMs) || completedAtMs > lastVisitedAtMs;
}

export function shouldShowSystemCompletionNotification(input: {
  readonly permission: NotificationPermission;
  readonly documentVisible: boolean;
  readonly windowFocused: boolean;
}): boolean {
  return input.permission === "granted" && (!input.documentVisible || !input.windowFocused);
}
