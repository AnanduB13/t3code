import type { DesktopTask, EnvironmentId, OrchestrationShellSnapshot } from "@t3tools/contracts";
import { resolveThreadAwarenessPhase } from "@t3tools/shared/agentAwareness";

/** Project only live shell summaries; transcripts never cross the desktop bridge. */
export function projectDesktopTasks(
  environmentId: EnvironmentId,
  snapshot: OrchestrationShellSnapshot,
): DesktopTask[] {
  const projects = new Map(snapshot.projects.map((project) => [project.id, project.title]));
  const tasks: DesktopTask[] = [];
  for (const thread of snapshot.threads) {
    if (thread.archivedAt !== null) continue;
    const phase = resolveThreadAwarenessPhase(thread);
    const status =
      phase === "waiting_for_approval"
        ? "approval"
        : phase === "waiting_for_input"
          ? "input"
          : phase === "running" || phase === "starting" || thread.backgroundLiveness === "working"
            ? "running"
            : thread.backgroundLiveness === "monitoring"
              ? "monitoring"
              : null;
    if (!status) continue;
    const progress = thread.planProgress;
    const detail =
      status === "approval"
        ? "Approval needed"
        : status === "input"
          ? "Waiting for input"
          : status === "monitoring"
            ? "Monitoring"
            : phase === "starting"
              ? "Starting agent"
              : progress
                ? `${progress.step} · ${progress.completedSteps} of ${progress.totalSteps}`
                : "Agent is working";
    tasks.push({
      environmentId,
      threadId: thread.id,
      title: thread.title.slice(0, 240),
      project: (projects.get(thread.projectId) ?? "T3 Code").slice(0, 120),
      detail: detail.slice(0, 240),
      status,
    });
  }
  return tasks;
}

export function sortDesktopTasks(tasks: readonly DesktopTask[]): DesktopTask[] {
  const priority = { approval: 0, input: 1, running: 2, monitoring: 3 };
  return [...tasks].sort(
    (a, b) =>
      priority[a.status] - priority[b.status] ||
      a.title.localeCompare(b.title) ||
      a.environmentId.localeCompare(b.environmentId) ||
      a.threadId.localeCompare(b.threadId),
  );
}
