import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { projectThreadAwarenessV2, type AgentAwarenessPhase } from "@t3tools/shared/agentAwareness";

export interface AndroidChatNotification {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly deepLink: string;
  readonly phase: AgentAwarenessPhase;
  /** The run this state belongs to; the native monitor keys Stop dismissal on it. */
  readonly runId: string | null;
  readonly ongoing: boolean;
  /** Plan step counts for the native progress card. V2 shells carry none, so they stay 0. */
  readonly completedSteps: number;
  readonly totalSteps: number;
}

export function projectAndroidChatNotification(
  thread: EnvironmentThreadShell,
): AndroidChatNotification | null {
  if (thread.archivedAt) return null;
  const activity = projectThreadAwarenessV2({
    environmentId: thread.environmentId,
    project: { title: "" },
    thread: thread.source,
  });
  if (!activity) return null;
  return {
    key: JSON.stringify([thread.environmentId, thread.id]),
    title: thread.title,
    body: activity.headline,
    deepLink: activity.deepLink,
    phase: activity.phase,
    runId: thread.latestRun?.runId ?? null,
    ongoing: activity.phase === "running" || activity.phase === "starting",
    completedSteps: 0,
    totalSteps: 0,
  };
}

/** Initial snapshots establish a baseline; only newly observed transitions alert. */
export function shouldAlertAndroidChat(
  previous: AndroidChatNotification | undefined,
  next: AndroidChatNotification,
): boolean {
  if (!previous || next.ongoing || next.phase === "stale") return false;
  // A run ID can appear or disappear around the same finished state. Only two
  // known, different IDs prove that another run completed.
  return (
    previous.phase !== next.phase ||
    (previous.runId !== null && next.runId !== null && previous.runId !== next.runId)
  );
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
