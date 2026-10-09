import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import { buildCompletionNotifications, buildRunningThreads } from "./ActivityCenter.logic";

function thread(
  input: {
    readonly id?: string;
    readonly status?: "running" | "completed" | "failed";
    readonly requestedAt?: string;
    readonly completedAt?: string | null;
    readonly runtimeStatus?: "idle" | "starting" | "running" | "completed" | "failed";
    readonly background?: ReadonlyArray<"subagent" | "monitor" | "command">;
    readonly archivedAt?: string | null;
  } = {},
): EnvironmentThreadShell {
  const status = input.status ?? "completed";
  const runtimeStatus = input.runtimeStatus ?? (status === "running" ? "running" : undefined);
  return {
    environmentId: "environment-1",
    id: input.id ?? "thread-1",
    projectId: "project-1",
    title: input.id ?? "Thread",
    updatedAt: "2026-08-25T10:00:00.000Z",
    archivedAt: input.archivedAt ?? null,
    latestRun: {
      runId: `run-${input.id ?? "1"}`,
      status,
      requestedAt: input.requestedAt ?? "2026-08-25T10:00:00.000Z",
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
            activeRunId: runtimeStatus === "running" ? `run-${input.id ?? "1"}` : null,
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

describe("activity center completion notifications", () => {
  it("sorts unread completions and removes one after its thread is visited", () => {
    const older = thread({ id: "older", completedAt: "2026-08-25T10:05:00.000Z" });
    const newer = thread({ id: "newer", completedAt: "2026-08-25T11:05:00.000Z" });
    const notifications = buildCompletionNotifications({
      threads: [older, newer, thread({ id: "working", status: "running" })],
      lastVisitedAtByThreadKey: {
        "environment-1:older": "2026-08-25T10:05:00.000Z",
        "environment-1:newer": "2026-08-25T11:00:00.000Z",
      },
    });

    expect(notifications.map((notification) => notification.thread.id)).toEqual(["newer"]);
    expect(notifications[0]?.unread).toBe(true);
  });

  it("does not surface archived threads or manufacture a backlog without a visit marker", () => {
    const notifications = buildCompletionNotifications({
      threads: [thread(), thread({ id: "archived", archivedAt: "2026-08-25T12:00:00.000Z" })],
      lastVisitedAtByThreadKey: {},
    });

    expect(notifications).toEqual([]);
  });
});

describe("activity center running threads", () => {
  it("leaves a run blocked on the user out of Working", () => {
    const blocked = {
      ...thread({ id: "blocked", status: "running" }),
      hasPendingApprovals: true,
    } as EnvironmentThreadShell;
    expect(buildRunningThreads([blocked, thread({ id: "busy", status: "running" })])).toEqual([
      expect.objectContaining({
        status: "Working",
        thread: expect.objectContaining({ id: "busy" }),
      }),
    ]);
  });

  it("includes foreground runs, starting runtimes, and background work", () => {
    const running = buildRunningThreads([
      thread({ id: "run", status: "running", requestedAt: "2026-08-25T12:00:00.000Z" }),
      thread({ id: "starting", runtimeStatus: "starting" }),
      thread({ id: "agent", runtimeStatus: "idle", background: ["subagent", "monitor"] }),
      thread({ id: "watch", runtimeStatus: "idle", background: ["monitor"] }),
      thread({ id: "dev-server", runtimeStatus: "completed", background: ["command"] }),
      thread({ id: "idle", runtimeStatus: "completed" }),
    ]);

    expect(new Map(running.map((entry) => [entry.thread.id, entry.status]))).toEqual(
      new Map([
        ["run", "Working"],
        ["starting", "Working"],
        ["agent", "Background work"],
        ["watch", "Monitoring"],
      ]),
    );
  });

  it("ignores archived running threads", () => {
    expect(
      buildRunningThreads([
        thread({ id: "archived", status: "running", archivedAt: "2026-08-25T12:00:00.000Z" }),
      ]),
    ).toEqual([]);
  });
});
