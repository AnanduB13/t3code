import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ThreadId, TurnId, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  projectAndroidChatNotification,
  shouldAlertAndroidChat,
  reconcileAndroidChatNotifications,
} from "./androidNotificationModel";

function thread(patch: Partial<EnvironmentThreadShell> = {}): EnvironmentThreadShell {
  return {
    environmentId: EnvironmentId.make("server-a"),
    id: ThreadId.make("chat-a"),
    title: "Fix login",
    archivedAt: null,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    projectId: ProjectId.make("project-a"),
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    createdAt: "2026-09-25T00:00:00Z",
    updatedAt: "2026-09-25T00:00:00Z",
    settledOverride: null,
    settledAt: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    session: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    latestTurn: {
      turnId: TurnId.make("turn-a"),
      state: "running",
      requestedAt: "2026-09-25T00:00:00Z",
      startedAt: null,
      completedAt: null,
      assistantMessageId: null,
    },
    ...patch,
  };
}
const project = (patch: Partial<EnvironmentThreadShell> = {}) =>
  projectAndroidChatNotification(thread(patch))!;

describe("Android chat notifications", () => {
  it("shows real plan progress without inventing a percentage", () => {
    expect(project().totalSteps).toBe(0);
    expect(
      project({ planProgress: { completedSteps: 1, totalSteps: 3, step: "Run tests" } }),
    ).toMatchObject({
      ongoing: true,
      completedSteps: 1,
      totalSteps: 3,
      body: "1/3 steps · Run tests",
    });
  });
  it("does not alert for historical completion or repeat snapshots", () => {
    const done = project({ latestTurn: { ...thread().latestTurn!, state: "completed" } });
    expect(shouldAlertAndroidChat(undefined, done)).toBe(false);
    expect(shouldAlertAndroidChat(project(), done)).toBe(true);
    expect(shouldAlertAndroidChat(done, done)).toBe(false);
  });
  it("alerts for approval/input and failure, then restores running progress", () => {
    const running = project();
    for (const waiting of [
      project({ hasPendingApprovals: true }),
      project({ hasPendingUserInput: true }),
      project({ latestTurn: { ...thread().latestTurn!, state: "error" } }),
    ]) {
      expect(waiting.ongoing).toBe(false);
      expect(shouldAlertAndroidChat(running, waiting)).toBe(true);
      expect(shouldAlertAndroidChat(waiting, waiting)).toBe(false);
      expect(shouldAlertAndroidChat(waiting, running)).toBe(false);
    }
  });
  it("isolates identical thread IDs across environments and removes archived chats", () => {
    expect(project({ environmentId: EnvironmentId.make("server-b") }).key).not.toBe(project().key);
    expect(
      projectAndroidChatNotification(thread({ archivedAt: "2026-09-25T00:00:00Z" })),
    ).toBeNull();
    expect(project().deepLink).toBe("/threads/server-a/chat-a");
  });
});

describe("Android monitoring lifecycle", () => {
  const live = new Set(["server-a"]);
  it("keeps monitoring through disconnects and alerts once on reconnect completion", () => {
    const initial = reconcileAndroidChatNotifications(new Map(), [thread()], live);
    const disconnected = reconcileAndroidChatNotifications(initial.next, [thread()], new Set());
    expect(disconnected.monitored[0]).toMatchObject({
      ongoing: false,
      body: "Connection lost · waiting to reconnect",
    });
    expect(disconnected.alerts).toEqual([]);
    const done = thread({ latestTurn: { ...thread().latestTurn!, state: "completed" } });
    const completed = reconcileAndroidChatNotifications(disconnected.next, [done], live);
    expect(completed.monitored).toEqual([]);
    expect(completed.alerts).toHaveLength(1);
    expect(reconcileAndroidChatNotifications(completed.next, [done], live).alerts).toEqual([]);
  });
  it("clears monitoring for removed, archived, and stopped chats", () => {
    const initial = reconcileAndroidChatNotifications(new Map(), [thread()], live);
    for (const remaining of [
      [],
      [thread({ archivedAt: "2026-09-25T00:00:00Z" })],
      [thread({ latestTurn: null })],
    ]) {
      const result = reconcileAndroidChatNotifications(initial.next, remaining, live);
      expect(result.monitored).toEqual([]);
      expect(result.clearAlertKeys).toEqual([project().key]);
    }
  });
  it("dismisses an obsolete approval alert when work resumes", () => {
    const initial = reconcileAndroidChatNotifications(
      new Map(),
      [thread({ hasPendingApprovals: true })],
      live,
    );
    expect(initial.monitored).toHaveLength(1);
    const resumed = reconcileAndroidChatNotifications(initial.next, [thread()], live);
    expect(resumed.clearAlertKeys).toEqual([project().key]);
    expect(resumed.monitored[0]?.ongoing).toBe(true);
  });
});
