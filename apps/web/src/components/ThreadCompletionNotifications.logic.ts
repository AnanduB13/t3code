import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { isLatestTurnCompleted } from "@t3tools/client-runtime/state/thread-settled";

export type ThreadCompletionSnapshot = ReadonlyMap<
  string,
  { readonly turnId: string; readonly state: string }
>;

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
    const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
    const completedAt = thread.latestTurn?.completedAt;
    const lastVisitedAt = input.lastVisitedAtByThreadKey[threadKey];
    if (!isLatestTurnCompleted(thread.latestTurn) || !completedAt || !lastVisitedAt) return false;
    const completedAtMs = Date.parse(completedAt);
    const lastVisitedAtMs = Date.parse(lastVisitedAt);
    if (Number.isNaN(completedAtMs)) return false;
    return Number.isNaN(lastVisitedAtMs) || completedAtMs > lastVisitedAtMs;
  });
}

export function shouldShowSystemCompletionNotification(input: {
  readonly permission: NotificationPermission;
  readonly documentVisible: boolean;
  readonly windowFocused: boolean;
}): boolean {
  return input.permission === "granted" && (!input.documentVisible || !input.windowFocused);
}
