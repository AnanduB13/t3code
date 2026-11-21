import type { ClientSettings } from "@t3tools/contracts/settings";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import type { AnyRouter } from "@tanstack/react-router";
import { Atom, AtomRegistry } from "effect/reactivity";
import { EnvironmentId } from "@t3tools/contracts";
import { threadNotificationTag } from "../threadNotifications";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, stubGlobal } from "../../test/render";

const state = vi.hoisted(() => ({
  mode: "off" as ClientSettings["notificationMode"],
  inApp: true,
  active: { environmentId: "env-1", threadId: "other-thread" },
  focused: true,
  visible: "visible",
  live: true,
  completedAt: null as string | null,
  archivedAt: null as string | null,
  input: false,
  approval: false,
  sessionError: false,
  activityRunStatus: null as "running" | null,
  runId: "run-1",
  turnError: false,
  limited: false,
  subagent: false,
  background: [] as Array<{ taskId: string; kind: "command" | "monitor" }>,
  delegatedChild: null as "running" | "approval" | null,
  add: vi.fn(
    (_toast: { title: string; description: string; actionProps: { onClick: () => void } }) =>
      "toast-1",
  ),
  close: vi.fn(),
  navigate: vi.fn(),
  sound: vi.fn(),
  notification: vi.fn(function (_title: string, options: NotificationOptions) {
    return Object.assign(new EventTarget(), { tag: options.tag, close: vi.fn() });
  }),
}));

const SHELL_NOW = DateTime.makeUnsafe("2026-09-13T09:00:00.000Z");

function mockThreadShell() {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Fix the login form",
    providerInstanceId: "codex",
    modelSelection: { instanceId: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: {
      rootThreadId: "thread-1",
      parentThreadId: state.subagent ? "parent" : null,
      relationshipToParent: state.subagent ? "subagent" : null,
    },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    latestRunId: state.runId,
    activeRunId: null,
    activityRunStatus: state.activityRunStatus,
    status: state.completedAt
      ? "completed"
      : state.sessionError || state.turnError || state.limited
        ? "failed"
        : "running",
    lastErrorClass: state.limited ? "usage_limit" : null,
    pendingRuntimeRequest: state.input
      ? { id: "request-1", kind: "user_input", createdAt: SHELL_NOW }
      : state.approval
        ? { id: "request-1", kind: "command", createdAt: SHELL_NOW }
        : null,
    latestVisibleMessage: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    pendingBackgroundTasks: state.background,
    itemCount: 0,
    visibleItemCount: 0,
    createdAt: SHELL_NOW,
    updatedAt: SHELL_NOW,
    latestRunRequestedAt: SHELL_NOW,
    latestRunStartedAt: SHELL_NOW,
    latestRunCompletedAt: state.completedAt ? DateTime.makeUnsafe(state.completedAt) : undefined,
    archivedAt: state.archivedAt ? DateTime.makeUnsafe(state.archivedAt) : null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  };
}

type ThreadShell = ReturnType<typeof mockThreadShell>;
// The parent stays the same object while its delegated child changes, as in the live shell.
function mockThreads(parent: { current: ThreadShell | null }) {
  if (state.delegatedChild === null) return [mockThreadShell()];
  parent.current ??= mockThreadShell();
  const stableParent = parent.current;
  const child = {
    ...mockThreadShell(),
    id: "child-1",
    title: "Review the login form",
    creationSource: "mcp",
    // The delegated child's run is live while it waits on the user.
    activityRunStatus: "running",
    lineage: {
      rootThreadId: "thread-1",
      parentThreadId: "thread-1",
      relationshipToParent: "subagent",
    },
    pendingRuntimeRequest:
      state.delegatedChild === "approval"
        ? { id: "request-2", kind: "command", createdAt: SHELL_NOW }
        : null,
  };
  return [stableParent, child];
}

vi.mock(import("../state/shell"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    environmentShell: { ...actual.environmentShell, stateValueAtom: (() => shellAtom) as never },
  };
});
vi.mock(import("../state/presentation"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    environmentSummaries: {
      ...actual.environmentSummaries,
      get environmentIdsAtom() {
        return environmentIdsAtom as never;
      },
    },
  };
});
// Delegated requests reach the coordinator through the thread shells, rolled up from the shell here.
vi.mock(import("../state/threads"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    environmentThreadShells: {
      ...actual.environmentThreadShells,
      pendingSubagentRequestsAtom: (() => subagentRequestsAtom) as never,
      get delegatedUnderParentAtom() {
        return noDelegatedAtom as never;
      },
    },
  };
});
vi.mock(import("../hooks/useSettings"), async (original) => ({
  ...(await original()),
  subscribeClientSettings: ((listener: () => void) => {
    settingsListeners.add(listener);
    return () => settingsListeners.delete(listener);
  }) as never,
  getClientSettings: (() => ({
    notificationMode: state.mode,
    inAppNotificationsEnabled: state.inApp,
  })) as never,
}));
vi.mock(import("../threadNotifications"), async (original) => ({
  ...(await original()),
  playNotificationSound: state.sound,
  setNotificationBadge: vi.fn(),
}));
vi.mock(import("./ui/toast"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    toastManager: { ...actual.toastManager, add: state.add as never, close: state.close },
  };
});

import { startThreadNotifications } from "./ThreadNotificationCoordinator";

// Mirrors the unexported working-exit grace in client-runtime's thread inbox.
const WORKING_EXIT_GRACE_MS = 2_000;

const settingsListeners = new Set<() => void>();
const onNotificationBadgeClear = () => () => {};
const shellAtom = Atom.make<unknown>(null);
const subagentRequestsAtom = Atom.make((get) => {
  const shell = get(shellAtom) as { snapshot: Option.Option<{ threads: ThreadShell[] }> } | null;
  const threads = shell ? Option.getOrElse(shell.snapshot, () => ({ threads: [] })).threads : [];
  return new Map(
    threads.flatMap((thread) =>
      thread.lineage.relationshipToParent === "subagent" &&
      thread.lineage.parentThreadId !== null &&
      thread.pendingRuntimeRequest?.kind === "command"
        ? [[thread.lineage.parentThreadId, "approval" as const]]
        : [],
    ),
  );
});
const noDelegatedAtom = Atom.make<ReadonlySet<string>>(new Set<string>());
const environmentIdsAtom = Atom.make([EnvironmentId.make("env-1")]);

// The mocked modules read `state`, so every test resets it before starting the service.
function setup() {
  vi.clearAllMocks();
  const stack = new AsyncDisposableStack();
  stack.use(fakeTimers());
  const registry = AtomRegistry.make();
  stack.defer(() => registry.dispose());
  stack.defer(() => void Reflect.deleteProperty(window, "desktopBridge"));
  settingsListeners.clear();
  const routeListeners = new Set<() => void>();
  const parent: { current: ThreadShell | null } = { current: null };
  Object.assign(state, {
    mode: "off",
    inApp: true,
    active: { environmentId: "env-1", threadId: "other-thread" },
    focused: true,
    visible: "visible",
    live: true,
    completedAt: null,
    archivedAt: null,
    input: false,
    approval: false,
    sessionError: false,
    activityRunStatus: null,
    runId: "run-1",
    turnError: false,
    limited: false,
    subagent: false,
    background: [],
    delegatedChild: null,
  });
  stack.use(
    vi
      .spyOn(document, "visibilityState", "get")
      .mockImplementation(() => state.visible as DocumentVisibilityState),
  );
  stack.use(vi.spyOn(document, "hasFocus").mockImplementation(() => state.focused));
  stack.use(
    stubGlobal("Notification", Object.assign(state.notification, { permission: "granted" })),
  );
  let started = false;

  const render = async () => {
    registry.set(shellAtom, {
      status: state.live ? "live" : "disconnected",
      snapshot: state.live ? Option.some({ threads: mockThreads(parent) }) : Option.none(),
    });
    if (!started) {
      started = true;
      const router = {
        state: {
          get matches() {
            return [{ params: state.active }];
          },
        },
        navigate: state.navigate,
        subscribe: (_event: string, listener: () => void) => {
          routeListeners.add(listener);
          return () => routeListeners.delete(listener);
        },
      } as unknown as AnyRouter;
      stack.defer(startThreadNotifications(registry, router));
    } else for (const listener of settingsListeners) listener();
    for (const listener of routeListeners) listener();
    await vi.advanceTimersByTimeAsync(WORKING_EXIT_GRACE_MS);
  };

  return {
    render,
    complete: async () => {
      state.completedAt = "2026-09-13T10:00:00.000Z";
      await render();
    },
    [Symbol.asyncDispose]: () => stack.disposeAsync(),
  };
}

describe("thread notifications", () => {
  it.each([true, false])("keeps subagents silent with focus=%s", async (focused) => {
    await using app = setup();
    state.subagent = true;
    state.focused = focused;
    state.mode = "notifications-and-sound";
    await app.render();
    await app.complete();
    state.input = true;
    await app.render();
    expect(state.sound).not.toHaveBeenCalled();
    expect(state.add).not.toHaveBeenCalled();
    expect(state.notification).not.toHaveBeenCalled();
  });

  it("alerts on the parent when its delegated subagent asks for approval", async () => {
    await using app = setup();
    state.mode = "notifications-and-sound";
    state.delegatedChild = "running";
    await app.render();
    state.delegatedChild = "approval";
    await app.render();
    await app.render();
    expect(state.add).toHaveBeenCalledTimes(1);
    expect(state.add).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Approval needed", description: "Fix the login form" }),
    );
  });

  it("alerts once with system alerts off and opens the completed thread", async () => {
    await using app = setup();
    await app.render();
    await app.complete();
    await app.render();
    expect(state.add).toHaveBeenCalledTimes(1);
    const toast = state.add.mock.calls[0]?.[0];
    expect(toast?.title).toBe("Thread completed");
    expect(toast?.description).toBe("Fix the login form");
    toast?.actionProps.onClick();
    expect(state.close).toHaveBeenCalledWith("toast-1");
    expect(state.navigate).toHaveBeenCalledWith({
      to: "/$environmentId/$threadId",
      params: { environmentId: "env-1", threadId: "thread-1" },
    });
    expect(state.notification).not.toHaveBeenCalled();
  });

  it.each(["active", "blurred", "hidden", "archived", "disabled"])(
    "does not show a completion toast for %s threads",
    async (condition) => {
      await using app = setup();
      await app.render();
      if (condition === "active") state.active.threadId = "thread-1";
      if (condition === "blurred") state.focused = false;
      if (condition === "hidden") state.visible = "hidden";
      if (condition === "archived") state.archivedAt = "2026-09-13T09:00:00.000Z";
      if (condition === "disabled") state.inApp = false;
      await app.complete();
      expect(state.add).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["input", "Input needed"],
    ["approval", "Approval needed"],
    ["sessionError", "Thread failed"],
    ["turnError", "Thread failed"],
    ["limited", "Usage limit reached"],
  ] as const)("uses the same %s event for in-app and desktop alerts", async (event, title) => {
    await using app = setup();
    state.mode = "notifications-and-sound";
    await app.render();
    state[event] = true;
    await app.render();
    await app.render();
    expect(state.add).toHaveBeenCalledTimes(1);
    expect(state.add).toHaveBeenLastCalledWith(expect.objectContaining({ title }));
    expect(state.sound).toHaveBeenCalledWith("input", expect.any(Function));
    expect(state.notification).not.toHaveBeenCalled();

    state[event] = false;
    await app.render();
    state.focused = false;
    state[event] = true;
    await app.render();
    await app.render();
    expect(state.add).toHaveBeenCalledTimes(1);
    expect(state.notification).toHaveBeenCalledTimes(1);
    expect(state.notification).toHaveBeenCalledWith(title, {
      body: "Fix the login form",
      tag: threadNotificationTag(EnvironmentId.make("env-1"), "thread-1" as never),
      silent: true,
      requireInteraction: true,
    });
  });

  it("keeps a needs-you toast until the thread no longer needs the user", async () => {
    await using app = setup();
    await app.render();
    state.approval = true;
    await app.render();
    expect(state.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Approval needed", timeout: 0 }),
    );
    expect(state.close).not.toHaveBeenCalled();
    state.approval = false;
    await app.render();
    expect(state.close).toHaveBeenCalledWith("toast-1");
  });

  it("closes a needs-you toast when the user opens that thread", async () => {
    await using app = setup();
    await app.render();
    state.input = true;
    await app.render();
    expect(state.close).not.toHaveBeenCalled();
    state.active = { environmentId: "env-1", threadId: "thread-1" };
    await app.render();
    expect(state.close).toHaveBeenCalledWith("toast-1");
  });

  it("lets completion toasts time out on their own", async () => {
    await using app = setup();
    await app.render();
    await app.complete();
    expect(state.add).toHaveBeenCalledWith(expect.not.objectContaining({ timeout: 0 }));
  });

  // Only a monitor's wake runs hold their completion; the badge suite covers that path.
  it.each(["monitor", "command"] as const)(
    "alerts once when a run completes leaving a %s running",
    async (kind) => {
      await using app = setup();
      await app.render();
      state.background = [{ taskId: "background", kind }];
      await app.complete();
      state.background = [];
      await app.render();
      expect(state.add).toHaveBeenCalledTimes(1);
      expect(state.add).toHaveBeenLastCalledWith(
        expect.objectContaining({ title: "Thread completed" }),
      );
    },
  );

  it("keeps background desktop alerts when in-app notifications are disabled", async () => {
    await using app = setup();
    state.focused = false;
    state.inApp = false;
    state.mode = "notifications";
    await app.render();
    await app.complete();
    expect(state.add).not.toHaveBeenCalled();
    expect(state.notification).toHaveBeenCalledTimes(1);
    state.inApp = true;
    await app.render();
    expect(state.add).not.toHaveBeenCalled();
  });

  it("does not replay a completion when opting in from all alerts off", async () => {
    await using app = setup();
    state.inApp = false;
    await app.render();
    await app.complete();
    state.inApp = true;
    await app.render();
    expect(state.add).not.toHaveBeenCalled();
  });

  it("compares the environment as well as the thread", async () => {
    await using app = setup();
    state.active = { environmentId: "env-2", threadId: "thread-1" };
    await app.render();
    await app.complete();
    expect(state.add).toHaveBeenCalledTimes(1);
  });

  it("does not replay completed threads on first load or reconnect", async () => {
    await using app = setup();
    await app.complete();
    state.live = false;
    await app.render();
    state.live = true;
    await app.render();
    expect(state.add).not.toHaveBeenCalled();
  });

  it("keeps the completion system popup and sound when showing a toast", async () => {
    await using app = setup();
    state.mode = "notifications-and-sound";
    await app.render();
    await app.complete();
    expect(state.sound).toHaveBeenCalledWith("completion", expect.any(Function));
    expect(state.add).toHaveBeenCalledTimes(1);
    expect(state.notification).toHaveBeenCalledTimes(1);
  });

  it("notifies once when an observed run finishes during a disconnect", async () => {
    await using app = setup();
    state.mode = "notifications";
    await app.render();
    state.live = false;
    await app.render();
    await app.complete();
    expect(state.notification).not.toHaveBeenCalled();
    state.live = true;
    await app.render();
    await app.render();
    expect(state.notification).toHaveBeenCalledTimes(1);
  });

  it("keeps system alerts when the app is in the background", async () => {
    await using app = setup();
    state.mode = "notifications";
    state.focused = false;
    await app.render();
    await app.complete();
    expect(state.add).not.toHaveBeenCalled();
    // Without T3 Code's own chime, the OS plays its usual notification sound.
    expect(state.notification).toHaveBeenCalledWith("Thread completed", {
      body: "Fix the login form",
      tag: threadNotificationTag(EnvironmentId.make("env-1"), "thread-1" as never),
      silent: false,
      requireInteraction: false,
    });
  });
  it("notifies for the active thread only after the full run settles", async () => {
    await using app = setup();
    state.mode = "notifications";
    state.active.threadId = "thread-1";
    await app.render();
    // The run finished, but a wake keeps the agent working.
    state.activityRunStatus = "running";
    await app.complete();
    await app.render();
    expect(state.notification).not.toHaveBeenCalled();
    state.activityRunStatus = null;
    await app.render();
    await app.render();
    expect(state.notification).toHaveBeenCalledTimes(1);
    expect(state.add).not.toHaveBeenCalled();
  });

  it("notifies once for each finished run", async () => {
    await using app = setup();
    state.mode = "notifications";
    await app.render();
    await app.complete();
    await app.render();
    expect(state.notification).toHaveBeenCalledTimes(1);
    state.runId = "run-2";
    state.completedAt = null;
    await app.render();
    expect(state.notification).toHaveBeenCalledTimes(1);
    state.completedAt = "2026-09-13T10:05:00.000Z";
    await app.render();
    await app.render();
    expect(state.notification).toHaveBeenCalledTimes(2);
  });

  it.each(["darwin", "win32", "linux"])(
    "requests native notification permission on %s",
    async (platform) => {
      await using app = setup();
      Object.assign(window, { desktopBridge: { platform, onNotificationBadgeClear } });
      const requestPermission = vi.fn(async () => {
        Object.assign(Notification, { permission: "granted" });
        return "granted";
      });
      Object.assign(Notification, { permission: "default", requestPermission });
      state.mode = "notifications";
      await app.render();
      await app.complete();
      await app.render();
      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(state.notification).toHaveBeenCalledTimes(1);
    },
  );

  it("leaves browser permission requests to an explicit settings action", async () => {
    await using app = setup();
    const requestPermission = vi.fn();
    Object.assign(Notification, { permission: "default", requestPermission });
    state.mode = "notifications";
    await app.render();
    await app.complete();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(state.notification).not.toHaveBeenCalled();
  });

  it("respects disabling notifications while native permission is pending", async () => {
    await using app = setup();
    Object.assign(window, { desktopBridge: { platform: "darwin", onNotificationBadgeClear } });
    let grantPermission!: (value: string) => void;
    const permission = new Promise<string>((resolve) => {
      grantPermission = resolve;
    });
    Object.assign(Notification, {
      permission: "default",
      requestPermission: () => permission,
    });
    state.mode = "notifications";
    await app.render();
    await app.complete();
    state.mode = "off";
    await app.render();
    await act(async () => {
      Object.assign(Notification, { permission: "granted" });
      grantPermission("granted");
      await permission;
    });
    expect(state.notification).not.toHaveBeenCalled();
  });

  it.each(["running", "archived", "disconnected"])(
    "drops a pending completion when the thread becomes %s before permission is granted",
    async (condition) => {
      await using app = setup();
      Object.assign(window, { desktopBridge: { platform: "darwin", onNotificationBadgeClear } });
      let grantPermission!: () => void;
      const permission = new Promise<void>((resolve) => {
        grantPermission = resolve;
      });
      Object.assign(Notification, {
        permission: "default",
        requestPermission: () => permission,
      });
      state.mode = "notifications";
      await app.render();
      await app.complete();
      if (condition === "running") state.completedAt = null;
      if (condition === "archived") state.archivedAt = "2026-09-13T10:01:00.000Z";
      if (condition === "disconnected") state.live = false;
      await app.render();
      await act(async () => {
        Object.assign(Notification, { permission: "granted" });
        grantPermission();
        await permission;
      });
      expect(state.notification).not.toHaveBeenCalled();
    },
  );
});
