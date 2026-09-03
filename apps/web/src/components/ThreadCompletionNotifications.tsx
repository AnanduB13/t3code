"use client";

import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef } from "react";

import { APP_DISPLAY_NAME } from "../branding";
import { isElectron } from "../env";
import { useProjects, useThreadShells } from "../state/entities";
import { buildThreadRouteParams, resolveThreadRouteTarget } from "../threadRoutes";
import { useUiStateStore } from "../uiStateStore";
import { stackedThreadToast, toastManager } from "./ui/toast";
import {
  closeThreadSystemNotification,
  findNewlyCompletedThreads,
  shouldShowSystemCompletionNotification,
  snapshotThreadCompletions,
  type ThreadCompletionSnapshot,
} from "./ThreadCompletionNotifications.logic";

function projectLabelForThread(
  thread: EnvironmentThreadShell,
  projectLabels: ReadonlyMap<string, string>,
): string | null {
  return projectLabels.get(`${thread.environmentId}:${thread.projectId}`) ?? null;
}

export function ThreadCompletionNotifications() {
  const threads = useThreadShells();
  const projects = useProjects();
  const navigate = useNavigate();
  const markThreadVisited = useUiStateStore((state) => state.markThreadVisited);
  const previousRef = useRef<ThreadCompletionSnapshot | null>(null);
  const systemNotificationsRef = useRef(new Map<string, Notification>());
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const activeThreadKey =
    routeTarget?.kind === "server" ? scopedThreadKey(routeTarget.threadRef) : null;
  const projectLabels = useMemo(
    () =>
      new Map(
        projects.map(
          (project) => [`${project.environmentId}:${project.id}`, project.title] as const,
        ),
      ),
    [projects],
  );

  const openThread = useCallback(
    (thread: EnvironmentThreadShell) => {
      const threadRef = scopeThreadRef(thread.environmentId, thread.id);
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [navigate],
  );

  useEffect(() => {
    if (activeThreadKey === null) return;

    const closeActiveThreadNotification = () => {
      closeThreadSystemNotification(systemNotificationsRef.current, activeThreadKey);
    };

    closeActiveThreadNotification();
    window.addEventListener("focus", closeActiveThreadNotification);
    document.addEventListener("visibilitychange", closeActiveThreadNotification);
    return () => {
      window.removeEventListener("focus", closeActiveThreadNotification);
      document.removeEventListener("visibilitychange", closeActiveThreadNotification);
    };
  }, [activeThreadKey]);

  const notifyCompletion = useEffectEvent((thread: EnvironmentThreadShell) => {
    const projectLabel = projectLabelForThread(thread, projectLabels);
    const description = projectLabel
      ? `Completed in ${projectLabel}`
      : "The agent finished its task.";
    const handleOpen = () => openThread(thread);

    toastManager.add(
      stackedThreadToast({
        type: "success",
        title: thread.title,
        description,
        actionProps: { children: "View", onClick: handleOpen },
        actionVariant: "outline",
        data: { hideCopyButton: true },
      }),
    );

    if (!("Notification" in window)) return;
    const show = () => {
      if (
        !shouldShowSystemCompletionNotification({
          permission: Notification.permission,
          documentVisible: document.visibilityState === "visible",
          windowFocused: document.hasFocus(),
        })
      ) {
        return;
      }
      const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      closeThreadSystemNotification(systemNotificationsRef.current, threadKey);
      const notification = new Notification(`${APP_DISPLAY_NAME} · Task completed`, {
        body: projectLabel ? `${thread.title}\n${projectLabel}` : thread.title,
        tag: `thread-completed:${threadKey}`,
      });
      systemNotificationsRef.current.set(threadKey, notification);
      notification.onclose = () => {
        if (systemNotificationsRef.current.get(threadKey) === notification) {
          systemNotificationsRef.current.delete(threadKey);
        }
      };
      notification.onclick = () => {
        window.focus();
        handleOpen();
        closeThreadSystemNotification(systemNotificationsRef.current, threadKey);
      };
    };

    if (Notification.permission === "granted") {
      show();
      return;
    }
    // Electron owns the native permission prompt and does not require a web
    // settings surface. Browsers only receive system alerts after the user
    // has granted permission through their own site controls.
    if (isElectron && Notification.permission === "default") {
      void Notification.requestPermission().then((permission) => {
        if (permission === "granted") show();
      });
    }
  });

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = snapshotThreadCompletions(threads);
    // A thread first observed while it is running needs a local baseline even
    // when this device has never opened it. That lets the later completion
    // become unread without turning old completed history into a backlog.
    const visits = useUiStateStore.getState().threadLastVisitedAtById;
    for (const thread of threads) {
      const turn = thread.latestTurn;
      if (turn === null || turn.state === "completed") continue;
      const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      if (visits[threadKey] === undefined) {
        markThreadVisited(threadKey, turn.startedAt ?? turn.requestedAt);
      }
    }
    if (previous === null) return;
    for (const thread of findNewlyCompletedThreads(previous, threads)) {
      notifyCompletion(thread);
    }
  }, [markThreadVisited, threads]);

  return null;
}
