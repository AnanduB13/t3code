import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import { buildAttentionEntries, resolveThreadAttention } from "./threadAttention.logic";

function thread(
  input: {
    readonly id?: string;
    readonly approval?: boolean;
    readonly question?: boolean;
    readonly runStatus?: "running" | "completed" | "failed";
    readonly limited?: boolean;
    readonly completedAt?: string;
    readonly subagent?: boolean;
  } = {},
): EnvironmentThreadShell {
  const runStatus = input.runStatus ?? "running";
  return {
    environmentId: "environment-1",
    id: input.id ?? "thread-1",
    projectId: "project-1",
    title: input.id ?? "Thread",
    updatedAt: "2026-08-25T10:00:00.000Z",
    archivedAt: null,
    lineage: {
      rootThreadId: "root",
      parentThreadId: null,
      relationshipToParent: input.subagent ? "subagent" : null,
    },
    hasPendingApprovals: input.approval ?? false,
    hasPendingUserInput: input.question ?? false,
    latestRun: {
      runId: `run-${input.id ?? "1"}`,
      status: runStatus,
      requestedAt: "2026-08-25T10:00:00.000Z",
      startedAt: "2026-08-25T10:00:01.000Z",
      completedAt:
        runStatus === "running" ? null : (input.completedAt ?? "2026-08-25T10:05:00.000Z"),
      assistantMessageId: null,
    },
    runtime: {
      status: runStatus,
      activeRunId: null,
      providerInstanceId: "codex",
      providerName: null,
      lastError: null,
      lastErrorClass: input.limited ? "usage_limit" : null,
      updatedAt: "2026-08-25T10:05:00.000Z",
    },
    pendingBackgroundTasks: [],
  } as unknown as EnvironmentThreadShell;
}

const visitedBeforeFailure = {
  "environment-1:failed": "2026-08-25T10:01:00.000Z",
  "environment-1:limited": "2026-08-25T10:01:00.000Z",
};

describe("thread attention", () => {
  it("names what each thread needs from the user", () => {
    expect(resolveThreadAttention(thread({ approval: true }))).toBe("approval");
    expect(resolveThreadAttention(thread({ question: true }))).toBe("input");
    expect(resolveThreadAttention(thread({ runStatus: "failed" }))).toBe("failed");
    expect(resolveThreadAttention(thread({ runStatus: "failed", limited: true }))).toBe("limited");
    expect(resolveThreadAttention(thread())).toBeNull();
    expect(resolveThreadAttention(thread({ runStatus: "completed" }))).toBeNull();
  });

  it("lists blocked threads before unread failures and hides subagents", () => {
    const entries = buildAttentionEntries({
      threads: [
        thread({ id: "failed", runStatus: "failed" }),
        thread({ id: "approval", approval: true }),
        thread({ id: "subagent", approval: true, subagent: true }),
        thread({ id: "limited", runStatus: "failed", limited: true }),
      ],
      lastVisitedAtByThreadKey: visitedBeforeFailure,
    });
    expect(entries.map((entry) => [entry.thread.id, entry.attention])).toEqual([
      ["approval", "approval"],
      ["failed", "failed"],
      ["limited", "limited"],
    ]);
  });

  it("drops a failure once the thread is visited, but never a pending approval", () => {
    const entries = buildAttentionEntries({
      threads: [
        thread({ id: "failed", runStatus: "failed" }),
        thread({ id: "approval", approval: true }),
      ],
      lastVisitedAtByThreadKey: {
        "environment-1:failed": "2026-08-25T10:06:00.000Z",
        "environment-1:approval": "2026-08-25T10:06:00.000Z",
      },
    });
    expect(entries.map((entry) => entry.thread.id)).toEqual(["approval"]);
  });
});
