import {
  DesktopTaskActivity,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationThreadShell,
  type OrchestrationShellSnapshot,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { projectDesktopTasks, sortDesktopTasks } from "./desktopTaskActivity";

const decodeTaskActivity = Schema.decodeUnknownSync(DesktopTaskActivity);
const environmentId = EnvironmentId.make("remote-env");
const now = "2026-10-23T10:00:00.000Z";
function thread(overrides: Partial<OrchestrationThreadShell> = {}): OrchestrationThreadShell {
  return {
    id: ThreadId.make("thread-1"),
    projectId: ProjectId.make("project-1"),
    title: "Fix keyboard navigation",
    modelSelection: { instanceId: ProviderInstanceId.make("provider-1"), model: "test-model" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    pullRequests: [],
    latestTurn: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    latestUserMessageAt: now,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    session: {
      threadId: ThreadId.make("thread-1"),
      status: "running",
      providerName: "Any provider",
      runtimeMode: "full-access",
      activeTurnId: TurnId.make("turn-1"),
      lastError: null,
      updatedAt: now,
    },
    ...overrides,
  };
}
function snapshot(threads: readonly OrchestrationThreadShell[]): OrchestrationShellSnapshot {
  return {
    snapshotSequence: 1,
    updatedAt: now,
    threads,
    projects: [
      {
        id: ProjectId.make("project-1"),
        title: "T3 Code",
        workspaceRoot: "/project",
        defaultModelSelection: null,
        scripts: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

describe("desktop task activity", () => {
  it("reports actual plan progress and preserves the remote thread target", () => {
    const tasks = projectDesktopTasks(
      environmentId,
      snapshot([
        thread({
          planProgress: { step: "Test focus order", completedSteps: 2, totalSteps: 4 },
        }),
      ]),
    );
    expect(tasks).toEqual([
      {
        environmentId,
        threadId: "thread-1",
        title: "Fix keyboard navigation",
        project: "T3 Code",
        detail: "Test focus order · 2 of 4",
        status: "running",
      },
    ]);
  });

  it("prioritizes pending approval and input over running plans", () => {
    const tasks = projectDesktopTasks(
      environmentId,
      snapshot([
        thread({ id: ThreadId.make("running") }),
        thread({ id: ThreadId.make("input"), hasPendingUserInput: true }),
        thread({
          id: ThreadId.make("approval"),
          hasPendingApprovals: true,
          hasPendingUserInput: true,
        }),
      ]),
    );
    expect(sortDesktopTasks(tasks).map(({ threadId, detail }) => [threadId, detail])).toEqual([
      ["approval", "Approval needed"],
      ["input", "Waiting for input"],
      ["running", "Agent is working"],
    ]);
  });

  it("removes archived, completed, failed, and stopped threads", () => {
    expect(
      projectDesktopTasks(
        environmentId,
        snapshot([
          thread({ archivedAt: now }),
          thread({ session: null }),
          thread({ session: { ...thread().session!, status: "ready", activeTurnId: null } }),
          thread({ session: { ...thread().session!, status: "error" } }),
        ]),
      ),
    ).toEqual([]);
  });

  it("keeps background work and monitoring visible after a turn settles", () => {
    const tasks = projectDesktopTasks(
      environmentId,
      snapshot([
        thread({ session: null, backgroundLiveness: "working" }),
        thread({ session: null, backgroundLiveness: "monitoring" }),
      ]),
    );
    expect(tasks.map(({ status, detail }) => [status, detail])).toEqual([
      ["running", "Agent is working"],
      ["monitoring", "Monitoring"],
    ]);
  });

  it("bounds text before IPC without changing thread identifiers", () => {
    const tasks = projectDesktopTasks(
      environmentId,
      snapshot([
        thread({
          title: "x".repeat(600),
          planProgress: { step: "y".repeat(600), completedSteps: 0, totalSteps: 1 },
        }),
      ]),
    );
    expect(tasks[0]?.title).toHaveLength(240);
    expect(tasks[0]?.detail).toHaveLength(240);
    expect(decodeTaskActivity({ enabled: true, tasks }).tasks).toEqual(tasks);
  });
});
