import type { AnyRouter } from "@tanstack/react-router";
import { EnvironmentId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { Atom, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { fakeTimers, stubGlobal } from "../../test/render";

const state = vi.hoisted(() => ({
  mode: "notifications",
  inApp: false,
  toast: vi.fn(),
  shells: null as unknown as { set: (id: string, value: unknown) => void },
  navigate: vi.fn(),
  sound: vi.fn(),
  badge: vi.fn(),
  environmentIds: ["one", "two"],
  focused: false,
  visibility: "visible",
}));
vi.mock(import("./ui/toast"), async (original) => {
  const actual = await original();
  return { ...actual, toastManager: { ...actual.toastManager, add: state.toast as never } };
});
vi.mock(import("../state/shell"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    environmentShell: {
      ...actual.environmentShell,
      stateValueAtom: ((id: string) => shellAtom(id)) as never,
    },
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
  unlockNotificationAudio: vi.fn(),
  setNotificationBadge: state.badge,
}));

import { startThreadNotifications } from "./ThreadNotificationCoordinator";

// Mirrors the unexported working-exit grace in client-runtime's thread inbox.
const WORKING_EXIT_GRACE_MS = 2_000;

const shellAtom = Atom.family((_id: string) => Atom.make<unknown>(null));

class TestNotification extends EventTarget {
  static permission = "granted";
  static sent: TestNotification[] = [];
  close = vi.fn();
  get tag() {
    return this.options.tag ?? "";
  }
  constructor(
    readonly title: string,
    readonly options: NotificationOptions,
  ) {
    super();
    TestNotification.sent.push(this);
  }
}

const thread = {
  id: "thread",
  title: "Test thread",
  archivedAt: null as string | null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  session: null as { status: string } | null,
  latestTurn: { turnId: "turn", state: "running", completedAt: null as string | null },
};
const settingsListeners = new Set<() => void>();
const environmentIdsAtom = Atom.make<ReadonlyArray<string>>([]);

const SHELL_NOW = DateTime.makeUnsafe("2026-09-13T07:00:00.000Z");

function toV2ThreadShell(input: typeof thread) {
  const latestTurn = input.latestTurn;
  return {
    id: input.id,
    projectId: "project",
    title: input.title,
    providerInstanceId: "codex",
    modelSelection: { instanceId: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: {
      rootThreadId: input.id,
      parentThreadId: null,
      relationshipToParent: null,
    },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    latestRunId: latestTurn.turnId,
    activeRunId: null,
    status:
      latestTurn.state === "completed"
        ? "completed"
        : latestTurn.state === "error" || input.session?.status === "error"
          ? "failed"
          : "running",
    pendingRuntimeRequest: input.hasPendingUserInput
      ? { id: "request-1", kind: "user_input", createdAt: SHELL_NOW }
      : input.hasPendingApprovals
        ? { id: "request-1", kind: "command", createdAt: SHELL_NOW }
        : null,
    latestVisibleMessage: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    itemCount: 0,
    visibleItemCount: 0,
    createdAt: SHELL_NOW,
    updatedAt: SHELL_NOW,
    latestRunRequestedAt: SHELL_NOW,
    latestRunStartedAt: SHELL_NOW,
    latestRunCompletedAt: latestTurn.completedAt
      ? DateTime.makeUnsafe(latestTurn.completedAt)
      : undefined,
    archivedAt: input.archivedAt ? DateTime.makeUnsafe(input.archivedAt) : null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  };
}

function shell(overrides: Partial<typeof thread> = {}) {
  return {
    status: "live",
    snapshot: Option.some({ threads: [toV2ThreadShell({ ...thread, ...overrides })] }),
  };
}
function complete(environment = "one", completedAt = "2026-09-13T08:00:00Z") {
  state.shells.set(
    environment,
    shell({ latestTurn: { turnId: "turn", state: "completed", completedAt } }),
  );
}
// The mocked modules read `state`, so every test resets it before starting the service.
function setup() {
  vi.clearAllMocks();
  const stack = new AsyncDisposableStack();
  stack.use(fakeTimers());
  settingsListeners.clear();
  const registry = AtomRegistry.make();
  stack.defer(() => registry.dispose());
  stack.defer(() => void Reflect.deleteProperty(window, "desktopBridge"));
  state.shells = { set: (id, value) => registry.set(shellAtom(id), value) };
  state.mode = "notifications";
  state.inApp = false;
  state.environmentIds = ["one", "two"];
  state.shells.set("one", shell());
  state.shells.set("two", shell());
  state.focused = false;
  state.visibility = "visible";
  TestNotification.permission = "granted";
  TestNotification.sent = [];
  stack.use(stubGlobal("Notification", TestNotification));
  stack.use(vi.spyOn(window, "focus").mockImplementation(() => undefined));
  stack.use(vi.spyOn(document, "hasFocus").mockImplementation(() => state.focused));
  stack.use(
    vi
      .spyOn(document, "visibilityState", "get")
      .mockImplementation(() => state.visibility as DocumentVisibilityState),
  );
  let stop: (() => void) | undefined;
  const stopNotifications = () => {
    stop?.();
    stop = undefined;
  };
  stack.defer(stopNotifications);

  return {
    render: async () => {
      registry.set(environmentIdsAtom, state.environmentIds);
      if (!stop) {
        stop = startThreadNotifications(registry, {
          state: { matches: [{ params: {} }] },
          navigate: state.navigate,
          subscribe: () => () => {},
        } as unknown as AnyRouter);
      } else for (const listener of settingsListeners) listener();
      await vi.advanceTimersByTimeAsync(WORKING_EXIT_GRACE_MS);
    },
    stop: stopNotifications,
    [Symbol.asyncDispose]: () => stack.disposeAsync(),
  };
}

it("counts notifying threads across environments, replaces repeat alerts, and clears on focus", async () => {
  await using app = setup();
  await app.render();
  complete();
  await app.render();
  expect(state.badge).toHaveBeenLastCalledWith(1);
  complete("one", "2026-09-13T08:01:00Z");
  complete("two");
  await app.render();
  expect(state.badge).toHaveBeenLastCalledWith(2);
  expect(TestNotification.sent[0]!.close).toHaveBeenCalledOnce();
  state.focused = true;
  window.dispatchEvent(new Event("focus"));
  expect(state.badge).toHaveBeenLastCalledWith(0);
  expect(
    TestNotification.sent.every((notification) => notification.close.mock.calls.length > 0),
  ).toBe(true);
  state.focused = false;
  complete("two", "2026-09-13T08:02:00Z");
  await app.render();
  expect(state.badge).toHaveBeenLastCalledWith(1);
});

it("does not badge old completions on first load or reconnect", async () => {
  await using app = setup();
  complete();
  await app.render();
  state.shells.set("one", { status: "connecting", snapshot: Option.none() });
  await app.render();
  // A run that finishes while disconnected still alerts on reconnect; the one seen at load does not.
  complete();
  await app.render();
  expect(TestNotification.sent).toHaveLength(0);
  expect(state.badge.mock.calls.every(([count]) => count === 0)).toBe(true);
});

it("removes alerts only from environments that leave the client", async () => {
  await using app = setup();
  await app.render();
  complete("one");
  complete("two");
  await app.render();
  expect(state.badge).toHaveBeenLastCalledWith(2);
  const [removed, retained] = TestNotification.sent;
  state.environmentIds = ["two"];
  await app.render();
  expect(state.badge).toHaveBeenLastCalledWith(1);
  expect(removed!.close).toHaveBeenCalledOnce();
  expect(retained!.close).not.toHaveBeenCalled();
  await app.render();
  expect(removed!.close).toHaveBeenCalledOnce();
  state.environmentIds = [];
  await app.render();
  expect(state.badge).toHaveBeenLastCalledWith(0);
  expect(retained!.close).toHaveBeenCalledOnce();
});

it("starts a fresh count after another native app window gains focus", async () => {
  await using app = setup();
  let clear: (() => void) | undefined;
  const unsubscribe = vi.fn();
  Object.assign(window, {
    desktopBridge: {
      onNotificationBadgeClear: (listener: () => void) => {
        clear = listener;
        return unsubscribe;
      },
    },
  });
  await app.render();
  complete();
  await app.render();
  clear!();
  expect(state.badge).toHaveBeenLastCalledWith(0);
  complete("two");
  await app.render();
  expect(state.badge).toHaveBeenLastCalledWith(1);
  app.stop();

  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(state.badge).toHaveBeenLastCalledWith(0);
});

it.each(["off", "sound", "denied", "archived"])(
  "does not show system alerts when %s",
  async (condition) => {
    await using app = setup();
    if (condition === "off" || condition === "sound") state.mode = condition;
    if (condition === "denied") TestNotification.permission = "denied";
    await app.render();
    // Completions present at once, so the archived thread completes already archived.
    if (condition === "archived")
      state.shells.set(
        "one",
        shell({
          archivedAt: "2026-09-13T08:00:00Z",
          hasPendingApprovals: true,
          latestTurn: { turnId: "turn", state: "completed", completedAt: "2026-09-13T08:00:00Z" },
        }),
      );
    else complete();
    await app.render();
    expect(TestNotification.sent).toHaveLength(0);
    // A completion while away still badges, so a blocked system permission
    // does not hide it. Off and archived threads stay quiet.
    if (condition === "sound" || condition === "denied") {
      expect(state.badge).toHaveBeenLastCalledWith(1);
    } else {
      expect(state.badge.mock.calls.every(([count]) => count === 0)).toBe(true);
    }
  },
);

it.each(["hasPendingApprovals", "hasPendingUserInput"] as const)(
  "badges %s and clears when notifications are disabled",
  async (flag) => {
    await using app = setup();
    await app.render();
    state.shells.set("one", shell({ [flag]: true }));
    await app.render();
    expect(state.badge).toHaveBeenLastCalledWith(1);
    const notification = TestNotification.sent[0]!;
    notification.dispatchEvent(new Event("click"));
    expect(state.navigate).toHaveBeenCalledWith({
      to: "/$environmentId/$threadId",
      params: { environmentId: EnvironmentId.make("one"), threadId: "thread" },
    });
    state.mode = "sound";
    await app.render();
    expect(state.badge).toHaveBeenLastCalledWith(0);
    expect(notification.close).toHaveBeenCalled();
  },
);

it("shows completion system and in-app alerts without adding a badge while focused", async () => {
  await using app = setup();
  state.inApp = true;
  state.focused = true;
  await app.render();
  complete();
  await app.render();
  expect(state.toast).toHaveBeenCalledOnce();
  expect(TestNotification.sent).toHaveLength(1);
  expect(TestNotification.sent[0]!.close).not.toHaveBeenCalled();
  expect(state.badge.mock.calls.every(([count]) => count === 0)).toBe(true);
});

it("badges background failures with in-app notifications enabled", async () => {
  await using app = setup();
  state.inApp = true;
  await app.render();
  state.shells.set("one", shell({ latestTurn: { ...thread.latestTurn, state: "error" } }));
  await app.render();
  expect(TestNotification.sent[0]?.title).toBe("Thread failed");
  expect(state.badge).toHaveBeenLastCalledWith(1);
  expect(state.toast).not.toHaveBeenCalled();
});
