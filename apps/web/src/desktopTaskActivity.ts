import type {
  DesktopTask,
  EnvironmentId,
  OrchestrationProjectShell,
  OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import { resolveThreadAwarenessPhaseV2 } from "@t3tools/shared/agentAwareness";

export type DesktopTaskThread = Parameters<typeof resolveThreadAwarenessPhaseV2>[0] &
  Pick<OrchestrationV2ThreadShell, "archivedAt" | "lineage" | "projectId">;

/** Project only live shell summaries; transcripts never cross the desktop bridge. */
export function projectDesktopTasks(
  environmentId: EnvironmentId,
  snapshot: {
    readonly projects: ReadonlyArray<Pick<OrchestrationProjectShell, "id" | "title">>;
    readonly threads: ReadonlyArray<DesktopTaskThread>;
  },
): DesktopTask[] {
  const projects = new Map(snapshot.projects.map((project) => [project.id, project.title]));
  const tasks: DesktopTask[] = [];
  for (const thread of snapshot.threads) {
    if (thread.archivedAt !== null || thread.lineage.relationshipToParent === "subagent") continue;
    const phase = resolveThreadAwarenessPhaseV2(thread);
    // A finished run held open by subagents or monitors is still being watched.
    const status =
      phase === "waiting_for_approval"
        ? "approval"
        : phase === "waiting_for_input"
          ? "input"
          : phase === "running" && thread.status === "completed"
            ? "monitoring"
            : phase === "running" || phase === "starting"
              ? "running"
              : null;
    if (!status) continue;
    const detail =
      status === "approval"
        ? "Approval needed"
        : status === "input"
          ? "Waiting for input"
          : status === "monitoring"
            ? "Monitoring"
            : phase === "starting"
              ? "Starting agent"
              : "Agent is working";
    tasks.push({
      environmentId,
      threadId: thread.id,
      title: thread.title.slice(0, 240),
      project: (projects.get(thread.projectId) ?? "T3 Code").slice(0, 120),
      detail,
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
