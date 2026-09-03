import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import {
  closeThreadSystemNotification,
  findNewlyCompletedThreads,
  hasUnseenCompletionInProjectKind,
  shouldShowSystemCompletionNotification,
  snapshotThreadCompletions,
} from "./ThreadCompletionNotifications.logic";

function thread(
  input: {
    id?: string;
    projectId?: string;
    turnId?: string;
    state?: "requested" | "running" | "completed";
    completedAt?: string | null;
    archivedAt?: string | null;
  } = {},
): EnvironmentThreadShell {
  return {
    environmentId: "environment-1",
    id: input.id ?? "thread-1",
    projectId: input.projectId ?? "project-1",
    archivedAt: input.archivedAt ?? null,
    deletedAt: null,
    latestTurn: {
      turnId: input.turnId ?? "turn-1",
      state: input.state ?? "running",
      requestedAt: "2026-08-23T10:00:00.000Z",
      startedAt: "2026-08-23T10:00:01.000Z",
      completedAt:
        input.completedAt === undefined
          ? input.state === "completed"
            ? "2026-08-23T10:05:00.000Z"
            : null
          : input.completedAt,
      assistantMessageId: null,
    },
  } as unknown as EnvironmentThreadShell;
}

describe("thread completion notifications", () => {
  it("closes and forgets the system notification for a visited thread", () => {
    let closed = false;
    const otherNotification = { close: () => undefined };
    const notifications = new Map([
      [
        "environment-1:thread-1",
        {
          close: () => {
            closed = true;
          },
        },
      ],
      ["environment-1:thread-2", otherNotification],
    ]);

    expect(closeThreadSystemNotification(notifications, "environment-1:thread-1")).toBe(true);
    expect(closed).toBe(true);
    expect(notifications.has("environment-1:thread-1")).toBe(false);
    expect(notifications.get("environment-1:thread-2")).toBe(otherNotification);
    expect(closeThreadSystemNotification(notifications, "environment-1:missing")).toBe(false);
  });

  it("emits a live running-to-completed edge once", () => {
    const previous = snapshotThreadCompletions([thread()]);
    const completed = thread({ state: "completed" });

    expect(findNewlyCompletedThreads(previous, [completed])).toEqual([completed]);
    expect(findNewlyCompletedThreads(snapshotThreadCompletions([completed]), [completed])).toEqual(
      [],
    );
  });

  it("does not replay completed history when a thread first appears", () => {
    expect(findNewlyCompletedThreads(new Map(), [thread({ state: "completed" })])).toEqual([]);
  });

  it("detects a newly completed turn even when render updates are batched", () => {
    const previous = snapshotThreadCompletions([thread({ state: "completed" })]);
    const next = thread({ turnId: "turn-2", state: "completed" });
    expect(findNewlyCompletedThreads(previous, [next])).toEqual([next]);
  });

  it("shows system alerts only when permission is granted and the app is in the background", () => {
    expect(
      shouldShowSystemCompletionNotification({
        permission: "granted",
        documentVisible: false,
        windowFocused: false,
      }),
    ).toBe(true);
    expect(
      shouldShowSystemCompletionNotification({
        permission: "granted",
        documentVisible: true,
        windowFocused: true,
      }),
    ).toBe(false);
    expect(
      shouldShowSystemCompletionNotification({
        permission: "denied",
        documentVisible: false,
        windowFocused: false,
      }),
    ).toBe(false);
  });
});

describe("mode unread aggregation", () => {
  it("only counts completed, unvisited threads in the requested project kind", () => {
    const chat = thread({ id: "chat", projectId: "general", state: "completed" });
    const project = thread({ id: "project", state: "completed" });
    const visits = {
      "environment-1:chat": "2026-08-23T10:00:00.000Z",
      "environment-1:project": "2026-08-23T10:06:00.000Z",
    };

    expect(
      hasUnseenCompletionInProjectKind({
        threads: [chat, project],
        lastVisitedAtByThreadKey: visits,
        isIncludedProject: (candidate) => candidate.projectId === "general",
      }),
    ).toBe(true);
    expect(
      hasUnseenCompletionInProjectKind({
        threads: [chat, project],
        lastVisitedAtByThreadKey: visits,
        isIncludedProject: (candidate) => candidate.projectId !== "general",
      }),
    ).toBe(false);
  });

  it("ignores archived completions", () => {
    expect(
      hasUnseenCompletionInProjectKind({
        threads: [thread({ state: "completed", archivedAt: "2026-08-23T10:06:00.000Z" })],
        lastVisitedAtByThreadKey: {
          "environment-1:thread-1": "2026-08-23T10:00:00.000Z",
        },
        isIncludedProject: () => true,
      }),
    ).toBe(false);
  });
});
