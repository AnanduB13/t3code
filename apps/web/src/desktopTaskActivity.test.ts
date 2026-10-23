import {
  DesktopTaskActivity,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import {
  type DesktopTaskThread,
  projectDesktopTasks,
  sortDesktopTasks,
} from "./desktopTaskActivity";

const decodeTaskActivity = Schema.decodeUnknownSync(DesktopTaskActivity);
const environmentId = EnvironmentId.make("remote-env");
const now = DateTime.makeUnsafe("2026-10-23T10:00:00.000Z");
const projects = [{ id: ProjectId.make("project-1"), title: "T3 Code" }];

function thread(overrides: Partial<DesktopTaskThread> = {}): DesktopTaskThread {
  const id = overrides.id ?? ThreadId.make("thread-1");
  return {
    id,
    projectId: ProjectId.make("project-1"),
    title: "Fix keyboard navigation",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    updatedAt: now,
    archivedAt: null,
    lineage: { rootThreadId: id, parentThreadId: null, relationshipToParent: null },
    status: "running",
    activityRunStatus: "running",
    pendingBackgroundTasks: [],
    pendingRuntimeRequest: null,
    ...overrides,
  };
}

function request(kind: "user_input" | "command") {
  return { id: RuntimeRequestId.make(`request-${kind}`), kind, createdAt: now };
}

describe("desktop task activity", () => {
  it("reports running work and preserves the remote thread target", () => {
    expect(projectDesktopTasks(environmentId, { projects, threads: [thread()] })).toEqual([
      {
        environmentId,
        threadId: "thread-1",
        title: "Fix keyboard navigation",
        project: "T3 Code",
        detail: "Agent is working",
        status: "running",
      },
    ]);
  });

  it("prioritizes pending approval and input over running work", () => {
    const tasks = projectDesktopTasks(environmentId, {
      projects,
      threads: [
        thread({ id: ThreadId.make("running") }),
        thread({ id: ThreadId.make("input"), pendingRuntimeRequest: request("user_input") }),
        thread({
          id: ThreadId.make("approval"),
          pendingRuntimeRequest: request("command"),
        }),
      ],
    });
    expect(sortDesktopTasks(tasks).map(({ threadId, detail }) => [threadId, detail])).toEqual([
      ["approval", "Approval needed"],
      ["input", "Waiting for input"],
      ["running", "Agent is working"],
    ]);
  });

  it("removes archived, subagent, idle, completed, and failed threads", () => {
    expect(
      projectDesktopTasks(environmentId, {
        projects,
        threads: [
          thread({ archivedAt: now }),
          thread({
            lineage: {
              rootThreadId: ThreadId.make("parent"),
              parentThreadId: ThreadId.make("parent"),
              relationshipToParent: "subagent",
            },
          }),
          thread({ status: "idle", activityRunStatus: null }),
          thread({ status: "completed", activityRunStatus: null }),
          thread({ status: "failed", activityRunStatus: null }),
        ],
      }),
    ).toEqual([]);
  });

  it("keeps a finished run visible while a monitor holds it open", () => {
    const tasks = projectDesktopTasks(environmentId, {
      projects,
      threads: [
        thread({
          status: "completed",
          activityRunStatus: null,
          pendingBackgroundTasks: [{ kind: "monitor", taskId: "monitor-1" }],
        }),
      ],
    });
    expect(tasks.map(({ status, detail }) => [status, detail])).toEqual([
      ["monitoring", "Monitoring"],
    ]);
  });

  it("bounds text before IPC without changing thread identifiers", () => {
    const tasks = projectDesktopTasks(environmentId, {
      projects,
      threads: [thread({ title: "x".repeat(600) })],
    });
    expect(tasks[0]?.title).toHaveLength(240);
    expect(decodeTaskActivity({ enabled: true, tasks }).tasks).toEqual(tasks);
  });
});
