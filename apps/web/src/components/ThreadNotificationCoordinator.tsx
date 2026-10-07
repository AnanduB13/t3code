import { presentThreadShell } from "@t3tools/client-runtime/state/models";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { EnvironmentId, OrchestrationV2ThreadShell, ThreadId } from "@t3tools/contracts";
import { resolveThreadAwarenessPhaseV2 } from "@t3tools/shared/agentAwareness";
import * as Option from "effect/Option";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { getClientSettings, useClientSettings } from "../hooks/useSettings";
import { useEnvironmentIds } from "../state/environments";
import { environmentShell } from "../state/shell";
import {
  hasDesktopNotifications,
  hasNotificationSound,
  playNotificationSound,
  setNotificationBadge,
  unlockNotificationAudio,
} from "../threadNotifications";
import { resolveSidebarThreadStatus } from "./Sidebar.logic";
import { resolveThreadAttention, THREAD_ATTENTION_TITLES } from "./threadAttention.logic";
import { toastManager } from "./ui/toast";

export function ThreadNotificationCoordinator() {
  const environmentIds = useEnvironmentIds();
  const mode = useClientSettings((settings) => settings.notificationMode);
  const inAppNotificationsEnabled = useClientSettings(
    (settings) => settings.inAppNotificationsEnabled,
  );
  // Alerts that arrived while the app was in the background, keyed by thread.
  // The badge counts all of them, so a missing or blocked system permission
  // still leaves a visible count on the favicon or dock icon.
  const pending = useRef(
    new Map<string, { environmentId: EnvironmentId; notification: Notification | null }>(),
  );
  const onAlert = useCallback(
    (environmentId: EnvironmentId, tag: string, notification: Notification | null) => {
      const prior = pending.current.get(tag)?.notification ?? null;
      if (notification && prior !== notification) prior?.close();
      pending.current.set(tag, { environmentId, notification: notification ?? prior });
      setNotificationBadge(document.hasFocus() ? 0 : pending.current.size);
    },
    [],
  );

  useEffect(() => {
    const activeIds = new Set(environmentIds);
    const count = pending.current.size;
    for (const [tag, { environmentId, notification }] of pending.current) {
      if (activeIds.has(environmentId)) continue;
      notification?.close();
      pending.current.delete(tag);
    }
    if (count !== pending.current.size) setNotificationBadge(pending.current.size);
  }, [environmentIds]);

  // Re-runs on a mode change on purpose: changing alert settings starts a
  // fresh badge, and turning alerts off clears it.
  useEffect(() => {
    const clear = () => {
      for (const { notification } of pending.current.values()) notification?.close();
      pending.current.clear();
      setNotificationBadge(0);
    };
    clear();
    const unsubscribe = window.desktopBridge?.onNotificationBadgeClear?.(clear);
    window.addEventListener("focus", clear);
    return () => {
      unsubscribe?.();
      window.removeEventListener("focus", clear);
      clear();
    };
  }, [mode]);

  useEffect(() => {
    if (!hasNotificationSound(mode)) return;
    document.addEventListener("pointerdown", unlockNotificationAudio);
    document.addEventListener("keydown", unlockNotificationAudio);
    return () => {
      document.removeEventListener("pointerdown", unlockNotificationAudio);
      document.removeEventListener("keydown", unlockNotificationAudio);
    };
  }, [mode]);

  if (mode === "off" && !inAppNotificationsEnabled) return null;

  return environmentIds.map((environmentId) => (
    <EnvironmentNotifications key={environmentId} environmentId={environmentId} onAlert={onAlert} />
  ));
}

interface NotificationState {
  readonly raw: OrchestrationV2ThreadShell;
  readonly attention: string | null;
  readonly completion: number | null;
  readonly phase: ReturnType<typeof resolveThreadAwarenessPhaseV2>;
}

/** Phases whose completion must survive a reconnect so it still alerts once. */
function isInFlightPhase(phase: NotificationState["phase"]): boolean {
  return (
    phase === "running" ||
    phase === "starting" ||
    phase === "waiting_for_approval" ||
    phase === "waiting_for_input"
  );
}

function EnvironmentNotifications({
  environmentId,
  onAlert,
}: {
  environmentId: EnvironmentId;
  onAlert: (environmentId: EnvironmentId, tag: string, notification: Notification | null) => void;
}) {
  const shell = useAtomValue(environmentShell.stateValueAtom(environmentId));
  // The shell reducer keeps the thread list and unchanged thread objects
  // stable, so this only rescans when a thread actually changed.
  const threads =
    shell.status === "live" && Option.isSome(shell.snapshot) ? shell.snapshot.value.threads : null;
  // Read by a desktop alert that waited on a permission prompt, so it can
  // drop itself if the thread moved on meanwhile.
  const latestThreads = useRef(threads);
  const mode = useClientSettings((settings) => settings.notificationMode);
  const inAppNotificationsEnabled = useClientSettings(
    (settings) => settings.inAppNotificationsEnabled,
  );
  const navigate = useNavigate();
  const { environmentId: activeEnvironmentId, threadId: activeThreadId } = useParams({
    strict: false,
  });
  const previous = useRef(new Map<ThreadId, NotificationState>());
  // One toast per thread. Toasts that ask for the user stay until the thread
  // no longer needs them or the user opens it; completions time out.
  const toasts = useRef(new Map<string, { id: string; attention: string | null }>());
  const closeToast = useCallback((threadId: string) => {
    const open = toasts.current.get(threadId);
    if (!open) return;
    toasts.current.delete(threadId);
    toastManager.close(open.id);
  }, []);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const openToasts = toasts.current;
    return () => {
      mounted.current = false;
      for (const { id } of openToasts.values()) toastManager.close(id);
      openToasts.clear();
    };
  }, []);

  useEffect(() => {
    if (activeEnvironmentId === environmentId && activeThreadId) closeToast(activeThreadId);
  }, [activeEnvironmentId, activeThreadId, closeToast, environmentId]);

  useEffect(() => {
    latestThreads.current = threads;
    if (threads === null) {
      // Keep observed work across a reconnect so its completion is not lost.
      // Settled threads establish a fresh baseline instead of replaying history.
      for (const [id, state] of previous.current) {
        if (!isInFlightPhase(state.phase)) previous.current.delete(id);
      }
      return;
    }
    const next = new Map<ThreadId, NotificationState>();
    for (const rawThread of threads) {
      if (rawThread.lineage.relationshipToParent === "subagent") continue;
      const prior = previous.current.get(rawThread.id);
      // The same object cannot produce a new notification.
      if (prior?.raw === rawThread) {
        next.set(rawThread.id, prior);
        continue;
      }
      const thread = presentThreadShell(environmentId, rawThread);
      const phase = resolveThreadAwarenessPhaseV2(rawThread);
      const status = resolveThreadAttention(thread);
      const attention = status ? `${thread.latestRun?.runId ?? ""}:${status}` : null;
      const openToast = toasts.current.get(thread.id);
      if (openToast?.attention && openToast.attention !== attention) closeToast(thread.id);
      const completedAt = Date.parse(thread.latestRun?.completedAt ?? "");
      // Alert when the whole agent run is done: commands left running (a dev
      // server) read as ready, while wakes, subagents, and monitors keep it going.
      const completion =
        resolveSidebarThreadStatus(thread) === "ready" &&
        phase === "completed" &&
        thread.latestRun?.status === "completed" &&
        Number.isFinite(completedAt)
          ? completedAt
          : (prior?.completion ?? null);
      next.set(thread.id, { raw: rawThread, attention, completion, phase });
      if (!prior || thread.archivedAt !== null) continue;
      const kind =
        attention && attention !== prior.attention
          ? "input"
          : completion !== null && (prior.completion === null || completion > prior.completion)
            ? "completion"
            : null;
      if (!kind) continue;
      const title = status ? THREAD_ATTENTION_TITLES[status] : "Thread completed";
      const tag = `${environmentId}:${thread.id}`;
      const focused = document.visibilityState === "visible" && document.hasFocus();
      if (!focused) onAlert(environmentId, tag, null);
      if (hasNotificationSound(mode)) {
        void playNotificationSound(kind, () =>
          hasNotificationSound(getClientSettings().notificationMode),
        );
      }
      if (
        inAppNotificationsEnabled &&
        focused &&
        (activeEnvironmentId !== environmentId || activeThreadId !== thread.id)
      ) {
        closeToast(thread.id);
        const toastId = toastManager.add({
          type: status === null ? "success" : status === "failed" ? "error" : "warning",
          title,
          description: thread.title,
          ...(status === null ? {} : { timeout: 0 }),
          data: {
            hideCopyButton: true,
            leadingIcon:
              status === null ? (
                <CircleCheckIcon aria-hidden className="size-4 text-success-foreground" />
              ) : status === "approval" ? (
                <ShieldQuestionIcon aria-hidden className="size-4 text-warning-foreground" />
              ) : status === "failed" ? (
                <CircleAlertIcon aria-hidden className="size-4 text-destructive-foreground" />
              ) : status === "limited" ? (
                <CircleAlertIcon aria-hidden className="size-4 text-warning-foreground" />
              ) : (
                <MessageCircleQuestionIcon aria-hidden className="size-4 text-info-foreground" />
              ),
          },
          actionProps: {
            children: "Open thread",
            onClick: () => {
              closeToast(thread.id);
              void navigate({
                to: "/$environmentId/$threadId",
                params: { environmentId, threadId: thread.id },
              });
            },
          },
        });
        toasts.current.set(thread.id, { id: toastId, attention });
        // Completions also keep their system alert while a toast shows.
        if (kind !== "completion") continue;
      }
      if (
        !hasDesktopNotifications(mode) ||
        (kind !== "completion" && focused) ||
        typeof Notification === "undefined"
      )
        continue;
      const runId = rawThread.latestRunId;
      const runCompletedAt = thread.latestRun?.completedAt ?? null;
      const showNotification = async () => {
        // Electron's Notification API delivers native macOS/Windows/Linux
        // alerts. Browser permission prompts must stay in the Settings gesture.
        if (window.desktopBridge && Notification.permission === "default") {
          await Notification.requestPermission();
        }
        const currentRaw = latestThreads.current?.find(({ id }) => id === thread.id);
        const current = currentRaw ? presentThreadShell(environmentId, currentRaw) : undefined;
        if (
          Notification.permission !== "granted" ||
          !mounted.current ||
          !hasDesktopNotifications(getClientSettings().notificationMode) ||
          !currentRaw ||
          !current ||
          current.archivedAt !== null ||
          resolveThreadAwarenessPhaseV2(currentRaw) !== phase ||
          currentRaw.latestRunId !== runId ||
          (kind === "completion" && (current.latestRun?.completedAt ?? null) !== runCompletedAt)
        )
          return;
        const notification = new Notification(title, {
          body: thread.title,
          tag,
          // T3 Code plays its own chime when sound is on; otherwise the OS
          // decides, like any other app's notification.
          silent: hasNotificationSound(getClientSettings().notificationMode),
          // Approvals and questions block the agent, so they stay on screen.
          requireInteraction: kind === "input",
        });
        onAlert(environmentId, tag, notification);
        notification.addEventListener("click", () => {
          notification.close();
          window.focus();
          void navigate({
            to: "/$environmentId/$threadId",
            params: { environmentId, threadId: thread.id },
          });
        });
      };
      void showNotification().catch((error: unknown) => {
        console.warn("Could not show system notification", error);
      });
    }
    previous.current = next;
  }, [
    activeEnvironmentId,
    activeThreadId,
    closeToast,
    environmentId,
    inAppNotificationsEnabled,
    mode,
    navigate,
    onAlert,
    threads,
  ]);

  return null;
}
