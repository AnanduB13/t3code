import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { isLatestTurnCompleted } from "@t3tools/client-runtime/state/thread-settled";

import { resolveThreadLastVisitedAt } from "./Sidebar.logic";

export type ThreadCompletionSnapshot = ReadonlyMap<
  string,
  { readonly runId: string; readonly status: string }
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
      const run = thread.latestRun;
      return run === null
        ? []
        : [
            [
              scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
              { runId: run.runId, status: run.status },
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
    const run = thread.latestRun;
    if (!isLatestTurnCompleted(run) || run === null) return false;

    const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
    const prior = previous.get(key);
    if (prior === undefined) return false;
    return prior.runId !== run.runId || prior.status !== "completed";
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
 * A completion is unread only when the thread was observed before it finished
 * and the finished run has not been visited. The server's shared visit marker
 * wins when the environment tracks visits; the local marker covers older
 * servers. Missing markers are deliberately treated as read so connecting a
 * new client does not turn the entire thread history into a notification
 * backlog.
 */
export function isThreadCompletionUnread(
  thread: Pick<EnvironmentThreadShell, "environmentId" | "id" | "latestRun" | "lastVisitedAt">,
  lastVisitedAtByThreadKey: Readonly<Record<string, string>>,
): boolean {
  const completedAt = thread.latestRun?.completedAt;
  if (!isLatestTurnCompleted(thread.latestRun) || !completedAt) return false;
  const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
  const lastVisitedAt = resolveThreadLastVisitedAt(
    thread.lastVisitedAt,
    lastVisitedAtByThreadKey[threadKey],
  );
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
