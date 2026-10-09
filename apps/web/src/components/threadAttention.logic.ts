import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import { resolveSidebarThreadStatus } from "./Sidebar.logic";

/** A thread state that is waiting on the user rather than on the agent. */
export type ThreadAttention = "approval" | "input" | "failed" | "limited";

export const THREAD_ATTENTION_TITLES = {
  approval: "Approval needed",
  input: "Input needed",
  failed: "Thread failed",
  limited: "Usage limit reached",
} satisfies Record<ThreadAttention, string>;

/**
 * Shared by notifications and the activity center so both agree on what needs
 * the user. A failed latest run counts even after the runtime settles.
 */
export function resolveThreadAttention(
  thread: Pick<
    EnvironmentThreadShell,
    "hasPendingApprovals" | "hasPendingUserInput" | "runtime" | "latestRun"
  >,
): ThreadAttention | null {
  const status = resolveSidebarThreadStatus(thread);
  if (status === "approval" || status === "input" || status === "failed" || status === "limited") {
    return status;
  }
  return status === "ready" && thread.latestRun?.status === "failed" ? "failed" : null;
}

export interface AttentionEntry {
  readonly thread: EnvironmentThreadShell;
  readonly attention: ThreadAttention;
  readonly since: string;
}

/**
 * Threads waiting on the user, most urgent first. Pending approvals and
 * questions always show. Failures follow the completion rule: they show until
 * the thread is visited, and only when this client saw the thread before.
 */
export function buildAttentionEntries(input: {
  readonly threads: readonly EnvironmentThreadShell[];
  readonly lastVisitedAtByThreadKey: Readonly<Record<string, string>>;
}): readonly AttentionEntry[] {
  const rank = { approval: 0, input: 0, limited: 1, failed: 1 } satisfies Record<
    ThreadAttention,
    number
  >;
  return input.threads
    .flatMap((thread): AttentionEntry[] => {
      if (thread.archivedAt !== null || thread.lineage.relationshipToParent === "subagent") {
        return [];
      }
      const attention = resolveThreadAttention(thread);
      if (attention === null) return [];
      const since =
        [thread.latestRun?.completedAt, thread.runtime?.updatedAt, thread.updatedAt].find(
          (value) => value != null && Number.isFinite(Date.parse(value)),
        ) ?? null;
      if (since === null) return [];
      if (attention === "failed" || attention === "limited") {
        const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
        const visitedAt = Date.parse(input.lastVisitedAtByThreadKey[key] ?? "");
        if (!Number.isFinite(visitedAt) || visitedAt >= Date.parse(since)) return [];
      }
      return [{ thread, attention, since }];
    })
    .toSorted(
      (left, right) =>
        rank[left.attention] - rank[right.attention] ||
        Date.parse(right.since) - Date.parse(left.since) ||
        left.thread.id.localeCompare(right.thread.id),
    );
}
