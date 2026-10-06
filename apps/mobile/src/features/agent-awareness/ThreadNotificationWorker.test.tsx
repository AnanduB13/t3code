import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/reactivity";
import type { Preferences } from "../../persistence/mobile-preferences";

const state = vi.hoisted(() => ({
  platform: { OS: "android" },
  preferences: {} as Preferences,
  permission: true,
  registration: "unknown",
  pushSupported: false,
  managed: { accountId: null as string | null, data: [{ environmentId: "server-a" }] },
  workspace: { environments: [] },
  configs: new Map(),
  live: new Set(["server-a"]),
  omitRun: false,
  thread: {
    hasPendingApprovals: false,
    run: { id: "run-a", status: "running" as "running" | "completed" },
  },
  preferencesAtom: {},
  schedule: vi.fn(async () => "notification"),
  dismiss: vi.fn(async () => undefined),
  handler: vi.fn(),
  channels: vi.fn(async () => null),
}));
vi.mock("react-native", () => ({
  Platform: state.platform,
  AppState: { currentState: "active", addEventListener: () => ({ remove: vi.fn() }) },
}));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: async () => ({ granted: state.permission }),
  setNotificationChannelAsync: state.channels,
  setNotificationHandler: state.handler,
  scheduleNotificationAsync: state.schedule,
  dismissNotificationAsync: state.dismiss,
}));
vi.mock("expo-linking", () => ({ createURL: (path: string) => `t3code://${path}` }));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: unknown) =>
    atom === state.preferencesAtom ? AsyncResult.success(state.preferences) : state.live,
}));
vi.mock("../../state/preferences", () => ({ mobilePreferencesAtom: state.preferencesAtom }));
vi.mock("../../state/entities", async () => {
  const { presentThreadShell } = await import("@t3tools/client-runtime/state/shell");
  const { EnvironmentId, RunId, RuntimeRequestId, ThreadId } = await import("@t3tools/contracts");
  const DateTime = await import("effect/DateTime");
  const { makeRawThreadShell } = await import("../../test-fixtures");
  const now = DateTime.makeUnsafe("2026-09-30T10:00:00Z");
  return {
    useThreadShells: () => {
      const { run, hasPendingApprovals } = state.thread;
      const runId = state.omitRun ? null : RunId.make(run.id);
      return [
        presentThreadShell(
          EnvironmentId.make("server-a"),
          makeRawThreadShell({
            id: ThreadId.make("chat-a"),
            title: "Fix login",
            updatedAt: now,
            latestRunId: runId,
            activeRunId: run.status === "running" ? runId : null,
            status: run.status,
            pendingRuntimeRequest: hasPendingApprovals
              ? { id: RuntimeRequestId.make("approval"), kind: "command", createdAt: now }
              : null,
          }),
        ),
      ];
    },
    useServerConfigs: () => state.configs,
  };
});
vi.mock("../../state/workspace", () => ({ useWorkspaceState: () => state.workspace }));
vi.mock("../../state/shell", () => ({ environmentShell: {} }));
vi.mock("../../connection/catalog", () => ({ environmentCatalog: {} }));
vi.mock("../cloud/managedRelayState", () => ({ useManagedRelayEnvironments: () => state.managed }));
vi.mock("./capabilities", () => ({ supportsAgentAwarenessPush: () => state.pushSupported }));
vi.mock("./remoteRegistration", () => ({
  getAgentAwarenessRegistrationStatus: () => state.registration,
  subscribeAgentAwarenessRegistrationStatus: () => () => {},
}));
// Alerts must work even in native builds without Android progress cards.
vi.mock("./androidChatNotifications", () => ({ androidNotifications: null }));

import { ThreadNotificationWorker } from "./ThreadNotificationWorker";
let renderer: ReactTestRenderer | undefined;
async function render() {
  await act(async () => {
    if (renderer) renderer.update(createElement(ThreadNotificationWorker));
    else renderer = create(createElement(ThreadNotificationWorker));
  });
}
async function complete() {
  state.thread.run.status = "completed";
  await render();
}
beforeEach(() => {
  vi.clearAllMocks();
  state.schedule.mockReset().mockResolvedValue("notification");
  state.dismiss.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.platform.OS = "android";
  state.preferences = {};
  state.permission = true;
  state.registration = "unknown";
  state.pushSupported = false;
  state.managed.accountId = null;
  state.thread.run = { id: "run-a", status: "running" };
  state.thread.hasPendingApprovals = false;
  state.omitRun = false;
});

it.each(["disabled", "resumed", "cloud", "unmounted"])(
  "drops queued alerts when %s",
  async (condition) => {
    const pending = Promise.withResolvers<string>();
    state.schedule.mockImplementationOnce(() => pending.promise);
    await render();
    await complete();
    expect(state.schedule).toHaveBeenCalledTimes(1);
    state.thread.run = { id: "run-b", status: "running" };
    await render();
    await complete();
    if (condition === "disabled") state.preferences = { directChatNotificationsEnabled: false };
    if (condition === "resumed") state.thread.run = { id: "run-c", status: "running" };
    if (condition === "cloud") {
      state.pushSupported = true;
      state.managed.accountId = "account";
      state.registration = "registered";
    }
    if (condition === "unmounted") {
      await act(async () => renderer?.unmount());
      renderer = undefined;
    } else await render();
    await act(async () => pending.resolve("notification"));
    expect(state.schedule).toHaveBeenCalledTimes(1);
    expect(state.dismiss).toHaveBeenCalledWith('t3-chat:["server-a","chat-a"]');
  },
);
it("still delivers an update when removing the previous alert fails", async () => {
  await render();
  state.thread.hasPendingApprovals = true;
  await render();
  state.dismiss.mockRejectedValueOnce(new Error("Notification already removed"));
  state.thread.hasPendingApprovals = false;
  await render();
  expect(state.dismiss).toHaveBeenCalledWith('t3-chat:["server-a","chat-a"]');
  await complete();
  expect(state.schedule).toHaveBeenCalledTimes(2);
  expect(state.schedule).toHaveBeenLastCalledWith(
    expect.objectContaining({ content: expect.objectContaining({ body: "Agent finished" }) }),
  );
});
it("keeps one queued completion when its checkpoint arrives before delivery", async () => {
  const pending = Promise.withResolvers<string>();
  state.schedule.mockImplementationOnce(() => pending.promise);
  await render();
  await complete();
  state.thread.run = { id: "run-b", status: "running" };
  await render();
  state.omitRun = true;
  await render();
  state.omitRun = false;
  await complete();
  await act(async () => pending.resolve("notification"));
  expect(state.schedule).toHaveBeenCalledTimes(2);
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});
it.each(["android", "ios"])(
  "delivers one full-run system alert on %s without a progress module",
  async (platform) => {
    state.platform.OS = platform;
    await render();
    await render();
    expect(state.schedule).not.toHaveBeenCalled();
    await complete();
    await render();
    expect(state.schedule).toHaveBeenCalledExactlyOnceWith({
      identifier: 't3-chat:["server-a","chat-a"]',
      content: {
        title: "Fix login",
        body: "Agent finished",
        sound: "default",
        data: { deepLink: "/threads/server-a/chat-a" },
      },
      trigger: platform === "android" ? { channelId: "t3-chat-alerts" } : null,
    });
    // Foreground presentation stays with the app-wide notification handler.
    expect(state.handler).not.toHaveBeenCalled();
  },
);
it.each(["disabled", "denied", "historical"])(
  "does not deliver alerts when %s",
  async (condition) => {
    if (condition === "disabled") state.preferences = { directChatNotificationsEnabled: false };
    if (condition === "denied") state.permission = false;
    if (condition === "historical") state.thread.run.status = "completed";
    await render();
    await complete();
    expect(state.schedule).not.toHaveBeenCalled();
  },
);
it.each(["unknown", "pending", "failed", "registered"])(
  "uses direct delivery until cloud registration succeeds (%s)",
  async (registration) => {
    state.registration = registration;
    state.pushSupported = true;
    state.managed.accountId = "account";
    await render();
    await complete();
    expect(state.schedule).toHaveBeenCalledTimes(registration === "registered" ? 0 : 1);
  },
);
it("respects turning alerts off and back on without replaying old work", async () => {
  await render();
  state.preferences = { directChatNotificationsEnabled: false };
  await render();
  await complete();
  state.preferences = { directChatNotificationsEnabled: true };
  await render();
  expect(state.schedule).not.toHaveBeenCalled();
  state.thread.run = { id: "run-b", status: "running" };
  await render();
  await complete();
  expect(state.schedule).toHaveBeenCalledTimes(1);
});

it("starts delivering immediately after permission is granted in settings", async () => {
  state.permission = false;
  await render();
  state.permission = true;
  state.preferences = { directChatNotificationsEnabled: true };
  await render();
  await complete();
  expect(state.schedule).toHaveBeenCalledTimes(1);
});
