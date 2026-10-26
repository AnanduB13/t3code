import { resolveThreadAwarenessPhaseV2 } from "@t3tools/shared/agentAwareness";
import { resolveThreadAttention, THREAD_ATTENTION_TITLES } from "./threadAttention.logic";
import {
  type EnvironmentThreadShell,
  type PendingSubagentRequest,
  presentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { pendingSubagentRequestsByThread } from "@t3tools/client-runtime/state/threads";
import type { AnyRouter } from "@tanstack/react-router";
import type { EnvironmentId, OrchestrationV2ThreadShell, ThreadId } from "@t3tools/contracts";
import type { ClientSettings } from "@t3tools/contracts/settings";
import * as Option from "effect/Option";
import type { AtomRegistry } from "effect/reactivity";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
} from "lucide-react";

import { getClientSettings, subscribeClientSettings } from "../hooks/useSettings";
import { isWindowsPlatform } from "../lib/utils";
import { environmentSummaries } from "../state/presentation";
import { environmentShell } from "../state/shell";
import {
  hasDesktopNotifications,
  hasNotificationSound,
  playNotificationSound,
  setNotificationBadge,
  threadNotificationTag,
  unlockNotificationAudio,
} from "../threadNotifications";
import { resolveSidebarThreadStatus, type SidebarThreadStatus } from "./Sidebar.logic";
import {
  createThreadNotificationGate,
  type ThreadNotificationKind,
  type ThreadNotificationObservation,
} from "./ThreadNotificationCoordinator.logic";
import { toastManager } from "./ui/toast";

interface NotificationState extends ThreadNotificationObservation {
  readonly raw: OrchestrationV2ThreadShell;
  readonly subagentRequest: PendingSubagentRequest | null;
  readonly thread: EnvironmentThreadShell;
  readonly status: SidebarThreadStatus;
  readonly phase: ReturnType<typeof resolveThreadAwarenessPhaseV2>;
}

interface WatchedEnvironment {
  unsubscribe: () => void;
  previous: Map<ThreadId, NotificationState>;
  readonly gate: ReturnType<typeof createThreadNotificationGate<ThreadId>>;
}

/**
 * Turns thread status transitions in every connected environment into sounds, in-app toasts,
 * and desktop notifications, and keeps the dock badge in step with the unread ones.
 */
export function startThreadNotifications(
  registry: AtomRegistry.AtomRegistry,
  router: AnyRouter,
): () => void {
  const pending = new Map<
    string,
    { environmentId: EnvironmentId; notification: Notification | null }
  >();
  const toasts = new Map<string, { id: string; attention: string | null }>();
  const closeToast = (key: string) => {
    const open = toasts.get(key);
    if (!open) return;
    toasts.delete(key);
    toastManager.close(open.id);
  };
  let stopped = false;
  const watched = new Map<EnvironmentId, WatchedEnvironment>();

  const trackAlert = (
    environmentId: EnvironmentId,
    tag: string,
    notification: Notification | null,
  ) => {
    const prior = pending.get(tag)?.notification ?? null;
    if (notification && prior !== notification) prior?.close();
    pending.set(tag, { environmentId, notification: notification ?? prior });
    setNotificationBadge(document.hasFocus() ? 0 : pending.size);
  };
  const clearPending = () => {
    for (const { notification } of pending.values()) notification?.close();
    pending.clear();
    setNotificationBadge(0);
  };

  // Completions fire from a timer, so read settings, focus and route when presenting.
  const present = (
    environmentId: EnvironmentId,
    state: NotificationState,
    kind: ThreadNotificationKind,
  ) => {
    const { thread, status } = state;
    const { notificationMode: mode, inAppNotificationsEnabled } = getClientSettings();
    const active = (router.state.matches.at(-1)?.params ?? {}) as {
      environmentId?: string;
      threadId?: string;
    };
    const attention = resolveThreadAttention(thread);
    const title =
      kind === "completion"
        ? "Thread completed"
        : attention
          ? THREAD_ATTENTION_TITLES[attention]
          : status === "request"
            ? "Guest request"
            : "Input needed";
    const tag = threadNotificationTag(environmentId, thread.id);
    const key = `${environmentId}:${thread.id}`;
    const focused = document.visibilityState === "visible" && document.hasFocus();
    if (!focused) trackAlert(environmentId, tag, null);
    if (hasNotificationSound(mode)) {
      void playNotificationSound(kind, () =>
        hasNotificationSound(getClientSettings().notificationMode),
      );
    }
    if (
      inAppNotificationsEnabled &&
      focused &&
      (active.environmentId !== environmentId || active.threadId !== thread.id)
    ) {
      closeToast(key);
      const toastId = toastManager.add({
        type: kind === "completion" ? "success" : status === "failed" ? "error" : "warning",
        title,
        description: thread.title,
        ...(kind === "completion" ? {} : { timeout: 0 }),
        data: {
          hideCopyButton: true,
          leadingIcon:
            kind === "completion" ? (
              <CircleCheckIcon aria-hidden className="size-4 text-success-foreground" />
            ) : status === "approval" ? (
              <ShieldQuestionIcon aria-hidden className="size-4 text-warning-foreground" />
            ) : status === "failed" ? (
              <CircleAlertIcon aria-hidden className="size-4 text-destructive-foreground" />
            ) : (
              <MessageCircleQuestionIcon aria-hidden className="size-4 text-info-foreground" />
            ),
        },
        actionProps: {
          children: "Open thread",
          onClick: () => {
            closeToast(key);
            void router.navigate({
              to: "/$environmentId/$threadId",
              params: { environmentId, threadId: thread.id },
            });
          },
        },
      });
      toasts.set(key, { id: toastId, attention: state.attention });
      if (kind !== "completion") return;
    }
    if (
      !hasDesktopNotifications(mode) ||
      (kind !== "completion" && focused) ||
      typeof Notification === "undefined"
    )
      return;
    const showNotification = async () => {
      if (window.desktopBridge && Notification.permission === "default")
        await Notification.requestPermission();
      const shell = registry.get(environmentShell.stateValueAtom(environmentId));
      if (shell.status !== "live") return;
      const latest = watched.get(environmentId)?.previous.get(thread.id);
      if (
        stopped ||
        Notification.permission !== "granted" ||
        !hasDesktopNotifications(getClientSettings().notificationMode) ||
        !latest ||
        latest.thread.archivedAt !== null ||
        latest.phase !== state.phase ||
        latest.raw.latestRunId !== state.raw.latestRunId ||
        (kind === "completion" && latest.completedAt !== state.completedAt)
      )
        return;
      const notification = new Notification(title, {
        body: thread.title,
        tag,
        silent: hasNotificationSound(getClientSettings().notificationMode),
        // Windows drops clicks after a toast moves into Notification Center.
        requireInteraction:
          kind === "input" || (kind === "completion" && isWindowsPlatform(navigator.platform)),
      });
      trackAlert(environmentId, tag, notification);
      notification.addEventListener("click", () => {
        notification?.close();
        window.focus();
        void window.desktopBridge?.revealWindow?.().catch(() => undefined);
        void router.navigate({
          to: "/$environmentId/$threadId",
          params: { environmentId, threadId: thread.id },
        });
      });
    };
    void showNotification().catch((error: unknown) =>
      console.warn("Could not show system notification", error),
    );
  };

  const observeThreads = (
    environmentId: EnvironmentId,
    entry: WatchedEnvironment,
    threads: ReadonlyArray<OrchestrationV2ThreadShell>,
  ) => {
    const previous = entry.previous;
    const next = new Map<ThreadId, NotificationState>();
    const subagentRequests = pendingSubagentRequestsByThread(threads);
    const changed: Array<[NotificationState | undefined, NotificationState]> = [];
    for (const rawThread of threads) {
      if (rawThread.lineage.relationshipToParent === "subagent") continue;
      const prior = previous.get(rawThread.id);
      const subagentRequest = subagentRequests.get(rawThread.id) ?? null;
      if (prior?.raw === rawThread && prior.subagentRequest === subagentRequest) {
        next.set(rawThread.id, prior);
        continue;
      }
      const thread = presentThreadShell(environmentId, rawThread, subagentRequest);
      const phase = resolveThreadAwarenessPhaseV2(rawThread);
      let status = resolveSidebarThreadStatus(thread);
      if (status === "ready" && thread.latestRun?.status === "failed") status = "failed";
      const attention =
        status === "input" ||
        status === "request" ||
        status === "approval" ||
        status === "failed" ||
        status === "limited"
          ? `${thread.latestRun?.runId ?? ""}:${status}`
          : null;
      const completedAt = Date.parse(thread.latestRun?.completedAt ?? "");
      const key = `${environmentId}:${thread.id}`;
      const openToast = toasts.get(key);
      if (
        thread.archivedAt !== null ||
        rawThread.deletedAt !== null ||
        (openToast?.attention && openToast.attention !== attention)
      )
        closeToast(key);
      const settled =
        status === "ready" && phase === "completed" && thread.latestRun?.status === "completed";
      const state = {
        raw: rawThread,
        subagentRequest,
        thread,
        status,
        phase,
        attention,
        settled,
        completedAt: settled && Number.isFinite(completedAt) ? completedAt : null,
      };
      next.set(thread.id, state);
      changed.push([prior, state]);
    }
    for (const id of previous.keys()) {
      if (!next.has(id)) closeToast(`${environmentId}:${id}`);
    }
    entry.previous = next;
    entry.gate.retain(new Set(next.keys()));
    for (const [prior, state] of changed) {
      entry.gate.observe(state.thread.id, prior, state, {
        archived: state.thread.archivedAt !== null,
        quiet: state.raw.latestRunStopRequested === true,
      });
    }
  };

  const watchEnvironment = (environmentId: EnvironmentId): WatchedEnvironment => {
    const entry: WatchedEnvironment = {
      previous: new Map(),
      unsubscribe: () => {},
      gate: createThreadNotificationGate<ThreadId>((threadId, kind) => {
        const state = entry.previous.get(threadId);
        if (state) present(environmentId, state, kind);
      }),
    };
    const unsubscribeShell = registry.subscribe(
      environmentShell.stateValueAtom(environmentId),
      (shell) => {
        const threads =
          shell.status === "live" && Option.isSome(shell.snapshot)
            ? shell.snapshot.value.threads
            : null;
        if (threads !== null) {
          observeThreads(environmentId, entry, threads);
          return;
        }
        entry.gate.clear();
        // Preserve observed in-flight work through reconnects without replaying old completions.
        entry.previous = new Map(
          [...entry.previous].filter(
            ([, state]) =>
              state.phase === "running" ||
              state.phase === "starting" ||
              state.phase === "waiting_for_approval" ||
              state.phase === "waiting_for_input",
          ),
        );
      },
      { immediate: true },
    );
    entry.unsubscribe = () => {
      unsubscribeShell();
      entry.gate.clear();
    };
    return entry;
  };

  const syncEnvironments = () => {
    const { notificationMode, inAppNotificationsEnabled } = getClientSettings();
    const enabled = notificationMode !== "off" || inAppNotificationsEnabled;
    const environmentIds = enabled ? registry.get(environmentSummaries.environmentIdsAtom) : [];
    const activeIds = new Set(environmentIds);
    for (const [environmentId, entry] of watched) {
      if (activeIds.has(environmentId)) continue;
      entry.unsubscribe();
      for (const key of toasts.keys()) {
        if (key.startsWith(`${environmentId}:`)) closeToast(key);
      }
      watched.delete(environmentId);
    }
    for (const environmentId of environmentIds) {
      if (!watched.has(environmentId)) watched.set(environmentId, watchEnvironment(environmentId));
    }
  };

  const pruneRemovedEnvironments = () => {
    const activeIds = new Set(registry.get(environmentSummaries.environmentIdsAtom));
    const count = pending.size;
    for (const [tag, entry] of pending) {
      if (activeIds.has(entry.environmentId)) continue;
      entry.notification?.close();
      pending.delete(tag);
    }
    if (count !== pending.size) setNotificationBadge(pending.size);
  };

  // Listeners that only exist for some notification modes, rebuilt when the mode changes.
  let appliedMode: ClientSettings["notificationMode"] | null = null;
  let stopModeListeners = () => {};
  const applyMode = () => {
    const nextMode = getClientSettings().notificationMode;
    if (nextMode === appliedMode) return;
    appliedMode = nextMode;
    stopModeListeners();
    clearPending();
    const stops: Array<() => void> = [];
    {
      const unsubscribeBadgeClear = window.desktopBridge?.onNotificationBadgeClear?.(clearPending);
      window.addEventListener("focus", clearPending);
      stops.push(() => {
        unsubscribeBadgeClear?.();
        window.removeEventListener("focus", clearPending);
        clearPending();
      });
    }
    if (hasNotificationSound(nextMode)) {
      document.addEventListener("pointerdown", unlockNotificationAudio);
      document.addEventListener("keydown", unlockNotificationAudio);
      stops.push(() => {
        document.removeEventListener("pointerdown", unlockNotificationAudio);
        document.removeEventListener("keydown", unlockNotificationAudio);
      });
    }
    stopModeListeners = () => {
      for (const stop of stops) stop();
    };
  };

  const onSettings = () => {
    applyMode();
    syncEnvironments();
  };
  const unsubscribeRoute = router.subscribe("onResolved", () => {
    const active = (router.state.matches.at(-1)?.params ?? {}) as {
      environmentId?: string;
      threadId?: string;
    };
    if (active.environmentId && active.threadId)
      closeToast(`${active.environmentId}:${active.threadId}`);
  });
  const unsubscribeSettings = subscribeClientSettings(onSettings);
  const unsubscribeEnvironmentIds = registry.subscribe(
    environmentSummaries.environmentIdsAtom,
    () => {
      pruneRemovedEnvironments();
      syncEnvironments();
    },
  );
  onSettings();

  return () => {
    stopped = true;
    unsubscribeSettings();
    unsubscribeRoute();
    for (const key of toasts.keys()) closeToast(key);
    unsubscribeEnvironmentIds();
    for (const entry of watched.values()) entry.unsubscribe();
    watched.clear();
    stopModeListeners();
  };
}
