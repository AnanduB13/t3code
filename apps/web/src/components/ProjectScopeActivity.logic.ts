import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";

import { isThreadCompletionUnread } from "./ThreadCompletionNotifications.logic";

export type ProjectScopeActivity = {
  readonly runningCount: number;
  readonly unreadCount: number;
};

const EMPTY_PROJECT_SCOPE_ACTIVITY: ProjectScopeActivity = {
  runningCount: 0,
  unreadCount: 0,
};

function physicalProjectKey(environmentId: string, projectId: string): string {
  return `${environmentId}:${projectId}`;
}

function isThreadRunning(thread: EnvironmentThreadShell): boolean {
  return (
    thread.latestTurn?.state === "running" ||
    thread.session?.status === "starting" ||
    thread.session?.status === "running" ||
    thread.backgroundLiveness === "working" ||
    thread.backgroundLiveness === "monitoring"
  );
}

export function buildProjectActivityByPhysicalKey(input: {
  readonly threads: readonly EnvironmentThreadShell[];
  readonly lastVisitedAtByThreadKey: Readonly<Record<string, string>>;
}): ReadonlyMap<string, ProjectScopeActivity> {
  const activityByProject = new Map<string, ProjectScopeActivity>();

  for (const thread of input.threads) {
    if (thread.archivedAt !== null) continue;

    const key = physicalProjectKey(thread.environmentId, thread.projectId);
    const current = activityByProject.get(key) ?? EMPTY_PROJECT_SCOPE_ACTIVITY;
    const running = isThreadRunning(thread);
    const unread = isThreadCompletionUnread(thread, input.lastVisitedAtByThreadKey);
    if (!running && !unread) continue;

    activityByProject.set(key, {
      runningCount: current.runningCount + Number(running),
      unreadCount: current.unreadCount + Number(unread),
    });
  }

  return activityByProject;
}

export function aggregateProjectActivity(
  projectRefs: readonly { readonly environmentId: string; readonly projectId: string }[],
  activityByPhysicalKey: ReadonlyMap<string, ProjectScopeActivity>,
): ProjectScopeActivity {
  let runningCount = 0;
  let unreadCount = 0;

  for (const projectRef of projectRefs) {
    const activity = activityByPhysicalKey.get(
      physicalProjectKey(projectRef.environmentId, projectRef.projectId),
    );
    if (!activity) continue;
    runningCount += activity.runningCount;
    unreadCount += activity.unreadCount;
  }

  return { runningCount, unreadCount };
}
