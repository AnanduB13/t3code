import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveThreadStatus } from "./threadPresentation";

const completedThread: EnvironmentThreadShell = {
  environmentId: EnvironmentId.make("environment-1"),
  id: ThreadId.make("thread-1"),
  projectId: ProjectId.make("project-1"),
  title: "Completed task",
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.6" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  latestTurn: {
    turnId: TurnId.make("turn-1"),
    state: "completed",
    requestedAt: "2026-08-23T10:00:00.000Z",
    startedAt: "2026-08-23T10:00:01.000Z",
    completedAt: "2026-08-23T10:05:00.000Z",
    assistantMessageId: null,
  },
  createdAt: "2026-08-23T10:00:00.000Z",
  updatedAt: "2026-08-23T10:05:00.000Z",
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  session: null,
  latestUserMessageAt: "2026-08-23T10:00:00.000Z",
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
};

describe("resolveThreadStatus", () => {
  it("shows a durable Done status for a successful latest task", () => {
    expect(resolveThreadStatus(completedThread)).toMatchObject({
      kind: "completed",
      label: "Done",
      pulse: false,
    });
  });
});
