import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import {
  aggregateProjectActivity,
  buildProjectActivityByPhysicalKey,
} from "./ProjectScopeActivity.logic";

function thread(input: {
  readonly id: string;
  readonly environmentId?: string;
  readonly projectId?: string;
  readonly status?: "running" | "completed";
  readonly completedAt?: string | null;
  readonly runtimeStatus?: "idle" | "starting" | "running" | "completed";
  readonly background?: ReadonlyArray<"subagent" | "monitor" | "command">;
  readonly archivedAt?: string | null;
}): EnvironmentThreadShell {
  const status = input.status ?? "completed";
  const runtimeStatus = input.runtimeStatus ?? (status === "running" ? "running" : undefined);
  return {
    environmentId: input.environmentId ?? "environment-1",
    id: input.id,
    projectId: input.projectId ?? "project-1",
    title: input.id,
    updatedAt: "2026-08-25T10:00:00.000Z",
    archivedAt: input.archivedAt ?? null,
    latestRun: {
      runId: `run-${input.id}`,
      status,
      requestedAt: "2026-08-25T10:00:00.000Z",
      startedAt: "2026-08-25T10:00:01.000Z",
      completedAt:
        input.completedAt === undefined
          ? status === "completed"
            ? "2026-08-25T10:05:00.000Z"
            : null
          : input.completedAt,
      assistantMessageId: null,
    },
    runtime:
      runtimeStatus === undefined
        ? null
        : {
            status: runtimeStatus,
            activeRunId: null,
            providerInstanceId: "codex",
            providerName: null,
            lastError: null,
            updatedAt: "2026-08-25T10:00:02.000Z",
          },
    pendingBackgroundTasks: (input.background ?? []).map((kind, index) => ({
      taskId: `task-${index}`,
      kind,
    })),
  } as unknown as EnvironmentThreadShell;
}

describe("project scope activity", () => {
  it("counts every form of live work per physical project", () => {
    const activity = buildProjectActivityByPhysicalKey({
      threads: [
        thread({ id: "run", status: "running" }),
        thread({ id: "starting", runtimeStatus: "starting" }),
        thread({ id: "background", runtimeStatus: "idle", background: ["subagent"] }),
        thread({ id: "monitor", runtimeStatus: "idle", background: ["monitor"] }),
      ],
      lastVisitedAtByThreadKey: {},
    });

    expect(activity.get("environment-1:project-1")?.runningCount).toBe(4);
  });

  it("counts only unvisited completions and ignores archived threads", () => {
    const unread = thread({ id: "unread" });
    const read = thread({ id: "read" });
    const activity = buildProjectActivityByPhysicalKey({
      threads: [
        unread,
        read,
        thread({ id: "archived", status: "running", archivedAt: "2026-08-25T11:00:00Z" }),
      ],
      lastVisitedAtByThreadKey: {
        "environment-1:unread": "2026-08-25T10:04:00.000Z",
        "environment-1:read": "2026-08-25T10:06:00.000Z",
      },
    });

    expect(activity.get("environment-1:project-1")).toEqual({
      runningCount: 0,
      unreadCount: 1,
    });
  });

  it("combines physical projects that belong to one logical project", () => {
    const activity = buildProjectActivityByPhysicalKey({
      threads: [
        thread({ id: "local", status: "running" }),
        thread({
          id: "remote",
          environmentId: "environment-2",
          projectId: "project-2",
        }),
      ],
      lastVisitedAtByThreadKey: {
        "environment-2:remote": "2026-08-25T10:04:00.000Z",
      },
    });

    expect(
      aggregateProjectActivity(
        [
          { environmentId: "environment-1", projectId: "project-1" },
          { environmentId: "environment-2", projectId: "project-2" },
        ],
        activity,
      ),
    ).toEqual({ runningCount: 1, unreadCount: 1 });
  });
});
