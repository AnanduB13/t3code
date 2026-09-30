import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { projectThreadAwareness, type AgentAwarenessPhase } from "@t3tools/shared/agentAwareness";

export interface AndroidChatNotification {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly deepLink: string;
  readonly phase: AgentAwarenessPhase;
  readonly turnId: string | null;
  readonly ongoing: boolean;
  readonly completedSteps: number;
  readonly totalSteps: number;
}

export function projectAndroidChatNotification(
  thread: EnvironmentThreadShell,
): AndroidChatNotification | null {
  if (thread.archivedAt) return null;
  const activity = projectThreadAwareness({
    environmentId: thread.environmentId,
    project: { title: "" },
    thread,
  });
  if (!activity) return null;
  const ongoing = activity.phase === "running" || activity.phase === "starting";
  const progress = ongoing ? thread.planProgress : null;
  return {
    key: JSON.stringify([thread.environmentId, thread.id]),
    title: thread.title,
    body: progress
      ? `${progress.completedSteps}/${progress.totalSteps} steps · ${progress.step}`
      : activity.headline,
    deepLink: activity.deepLink,
    phase: activity.phase,
    turnId: thread.latestTurn?.turnId ?? null,
    ongoing,
    completedSteps: progress?.completedSteps ?? 0,
    totalSteps: progress?.totalSteps ?? 0,
  };
}

/** Initial snapshots establish a baseline; only newly observed transitions alert. */
export function shouldAlertAndroidChat(
  previous: AndroidChatNotification | undefined,
  next: AndroidChatNotification,
): boolean {
  if (!previous || next.ongoing || next.phase === "stale") return false;
  return previous.phase !== next.phase || previous.turnId !== next.turnId;
}

/** Preserve running state across disconnects without treating cached snapshots as new events. */
export function reconcileAndroidChatNotifications(
  previous: ReadonlyMap<string, AndroidChatNotification>,
  threads: readonly EnvironmentThreadShell[],
  liveEnvironments: ReadonlySet<string>,
  cloudOwnedEnvironments: ReadonlySet<string> = new Set(),
) {
  const next = new Map<string, AndroidChatNotification>();
  const alerts: AndroidChatNotification[] = [];
  const monitored: AndroidChatNotification[] = [];
  const clearAlertKeys: string[] = [];
  for (const thread of threads) {
    if (cloudOwnedEnvironments.has(thread.environmentId)) continue;
    const projected = projectAndroidChatNotification(thread);
    if (!projected) continue;
    const prior = previous.get(projected.key);
    const live = liveEnvironments.has(thread.environmentId);
    const chat = live ? projected : prior;
    if (!chat) continue;
    next.set(chat.key, chat);
    if (live && shouldAlertAndroidChat(prior, chat)) alerts.push(chat);
    if (chat.ongoing && prior && !prior.ongoing) clearAlertKeys.push(chat.key);
    if (
      chat.ongoing ||
      chat.phase === "waiting_for_approval" ||
      chat.phase === "waiting_for_input"
    ) {
      monitored.push(
        live ? chat : { ...chat, body: "Connection lost · waiting to reconnect", ongoing: false },
      );
    }
  }
  for (const key of previous.keys()) if (!next.has(key)) clearAlertKeys.push(key);
  return { next, alerts, monitored, clearAlertKeys };
}
