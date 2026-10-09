import {
  presentThreadShell,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import {
  EnvironmentId,
  ProjectId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { makeRawThreadShell } from "../../test-fixtures";
import {
  projectAndroidChatNotification,
  shouldAlertAndroidChat,
  reconcileAndroidChatNotifications,
} from "./androidNotificationModel";

const NOW = DateTime.makeUnsafe("2026-09-25T00:00:00Z");

function thread(
  patch: Partial<OrchestrationV2ThreadShell> & { readonly environmentId?: EnvironmentId } = {},
): EnvironmentThreadShell {
  const { environmentId = EnvironmentId.make("server-a"), ...raw } = patch;
  return presentThreadShell(
    environmentId,
    makeRawThreadShell({
      id: ThreadId.make("chat-a"),
      projectId: ProjectId.make("project-a"),
      title: "Fix login",
      latestRunId: RunId.make("run-a"),
      activeRunId: RunId.make("run-a"),
      status: "running",
      createdAt: NOW,
      updatedAt: NOW,
      ...raw,
    }),
  );
}
const pendingRequest = (kind: "command" | "user_input") => ({
  pendingRuntimeRequest: { id: RuntimeRequestId.make(`request-${kind}`), kind, createdAt: NOW },
});
const project = (patch: Parameters<typeof thread>[0] = {}) =>
  projectAndroidChatNotification(thread(patch))!;

describe("Android chat notifications", () => {
  it("shows working state without inventing step progress", () => {
    expect(project()).toMatchObject({
      ongoing: true,
      completedSteps: 0,
      totalSteps: 0,
      body: "Agent is working",
      runId: "run-a",
    });
  });
  it("does not alert for historical completion or repeat snapshots", () => {
    const done = project({ status: "completed", activeRunId: null });
    expect(shouldAlertAndroidChat(undefined, done)).toBe(false);
    expect(shouldAlertAndroidChat(project(), done)).toBe(true);
    expect(shouldAlertAndroidChat(done, done)).toBe(false);
  });
  it("alerts for approval/input and failure, then restores running progress", () => {
    const running = project();
    for (const waiting of [
      project(pendingRequest("command")),
      project(pendingRequest("user_input")),
      project({ status: "failed", activeRunId: null }),
    ]) {
      expect(waiting.ongoing).toBe(false);
      expect(shouldAlertAndroidChat(running, waiting)).toBe(true);
      expect(shouldAlertAndroidChat(waiting, waiting)).toBe(false);
      expect(shouldAlertAndroidChat(waiting, running)).toBe(false);
    }
  });
  it("does not repeat completion when the run ID disappears", () => {
    const done = project({ status: "completed", activeRunId: null });
    expect(shouldAlertAndroidChat(done, { ...done, runId: null })).toBe(false);
    expect(shouldAlertAndroidChat(done, { ...done, runId: "next-run" })).toBe(true);
  });
  it("does not repeat a completion when its run ID arrives later", () => {
    const done = project({ status: "completed", activeRunId: null });
    expect(shouldAlertAndroidChat({ ...done, runId: null }, done)).toBe(false);
    expect(
      shouldAlertAndroidChat({ ...done, runId: null, phase: "running", ongoing: true }, done),
    ).toBe(true);
  });
  it("isolates identical thread IDs across environments and removes archived chats", () => {
    expect(project({ environmentId: EnvironmentId.make("server-b") }).key).not.toBe(project().key);
    expect(projectAndroidChatNotification(thread({ archivedAt: NOW }))).toBeNull();
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
    const done = thread({ status: "completed", activeRunId: null });
    const completed = reconcileAndroidChatNotifications(disconnected.next, [done], live);
    expect(completed.monitored).toEqual([]);
    expect(completed.alerts).toHaveLength(1);
    expect(reconcileAndroidChatNotifications(completed.next, [done], live).alerts).toEqual([]);
  });
  it("clears monitoring for removed, archived, and stopped chats", () => {
    const initial = reconcileAndroidChatNotifications(new Map(), [thread()], live);
    for (const remaining of [
      [],
      [thread({ archivedAt: NOW })],
      [thread({ status: "idle", latestRunId: null, activeRunId: null })],
    ]) {
      const result = reconcileAndroidChatNotifications(initial.next, remaining, live);
      expect(result.monitored).toEqual([]);
      expect(result.clearAlertKeys).toEqual([project().key]);
    }
  });
  it("hands linked environments to cloud notifications and resumes direct monitoring without replaying alerts", () => {
    const initial = reconcileAndroidChatNotifications(new Map(), [thread()], live);
    const cloud = reconcileAndroidChatNotifications(initial.next, [thread()], live, live);
    expect(cloud.monitored).toEqual([]);
    expect(cloud.alerts).toEqual([]);
    expect(cloud.clearAlertKeys).toEqual([project().key]);
    const completed = thread({ status: "completed", activeRunId: null });
    const direct = reconcileAndroidChatNotifications(cloud.next, [completed], live);
    expect(direct.alerts).toEqual([]);
    expect(direct.next.size).toBe(1);
  });
  it("dismisses an obsolete approval alert when work resumes", () => {
    const initial = reconcileAndroidChatNotifications(
      new Map(),
      [thread(pendingRequest("command"))],
      live,
    );
    expect(initial.monitored).toHaveLength(1);
    const resumed = reconcileAndroidChatNotifications(initial.next, [thread()], live);
    expect(resumed.clearAlertKeys).toEqual([project().key]);
    expect(resumed.monitored[0]?.ongoing).toBe(true);
  });
});
