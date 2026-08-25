import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import { buildCompletionNotifications, buildRunningThreads } from "./ActivityCenter.logic";

function thread(
  input: {
    readonly id?: string;
    readonly state?: "running" | "completed" | "error";
    readonly requestedAt?: string;
    readonly completedAt?: string | null;
    readonly sessionStatus?: "idle" | "starting" | "running" | "ready" | "error";
    readonly backgroundLiveness?: "working" | "monitoring" | null;
    readonly archivedAt?: string | null;
  } = {},
): EnvironmentThreadShell {
  const state = input.state ?? "completed";
  return {
    environmentId: "environment-1",
    id: input.id ?? "thread-1",
    projectId: "project-1",
    title: input.id ?? "Thread",
    updatedAt: "2026-08-25T10:00:00.000Z",
    archivedAt: input.archivedAt ?? null,
    latestTurn: {
      turnId: `turn-${input.id ?? "1"}`,
      state,
      requestedAt: input.requestedAt ?? "2026-08-25T10:00:00.000Z",
      startedAt: "2026-08-25T10:00:01.000Z",
      completedAt:
        input.completedAt === undefined
          ? state === "completed"
            ? "2026-08-25T10:05:00.000Z"
            : null
          : input.completedAt,
      assistantMessageId: null,
    },
    session:
      input.sessionStatus === undefined
        ? null
        : {
            threadId: input.id ?? "thread-1",
            status: input.sessionStatus,
            providerName: "codex",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: "2026-08-25T10:00:02.000Z",
          },
    backgroundLiveness: input.backgroundLiveness ?? null,
  } as unknown as EnvironmentThreadShell;
}

describe("activity center completion notifications", () => {
  it("sorts current completions and shares the existing visit-based read receipt", () => {
    const older = thread({ id: "older", completedAt: "2026-08-25T10:05:00.000Z" });
    const newer = thread({ id: "newer", completedAt: "2026-08-25T11:05:00.000Z" });
    const notifications = buildCompletionNotifications({
      threads: [older, newer, thread({ id: "working", state: "running" })],
      lastVisitedAtByThreadKey: {
        "environment-1:older": "2026-08-25T10:05:00.000Z",
        "environment-1:newer": "2026-08-25T11:00:00.000Z",
      },
    });

    expect(notifications.map((notification) => notification.thread.id)).toEqual(["newer", "older"]);
    expect(notifications.map((notification) => notification.unread)).toEqual([true, false]);
  });

  it("does not surface archived threads or manufacture a backlog without a visit marker", () => {
    const notifications = buildCompletionNotifications({
      threads: [thread(), thread({ id: "archived", archivedAt: "2026-08-25T12:00:00.000Z" })],
      lastVisitedAtByThreadKey: {},
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.unread).toBe(false);
  });
});

describe("activity center running threads", () => {
  it("includes foreground turns, projected sessions, and background work", () => {
    const running = buildRunningThreads([
      thread({ id: "turn", state: "running", requestedAt: "2026-08-25T12:00:00.000Z" }),
      thread({ id: "session", state: "completed", sessionStatus: "starting" }),
      thread({ id: "agent", state: "completed", backgroundLiveness: "working" }),
      thread({ id: "watch", state: "completed", backgroundLiveness: "monitoring" }),
      thread({ id: "idle", state: "completed", sessionStatus: "ready" }),
    ]);

    expect(new Map(running.map((entry) => [entry.thread.id, entry.status]))).toEqual(
      new Map([
        ["turn", "Working"],
        ["session", "Working"],
        ["agent", "Background work"],
        ["watch", "Monitoring"],
      ]),
    );
  });

  it("ignores archived running threads", () => {
    expect(
      buildRunningThreads([
        thread({ id: "archived", state: "running", archivedAt: "2026-08-25T12:00:00.000Z" }),
      ]),
    ).toEqual([]);
  });
});
