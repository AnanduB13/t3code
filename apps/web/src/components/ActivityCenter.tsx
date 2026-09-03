"use client";

import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useNavigate } from "@tanstack/react-router";
import {
  BellIcon,
  CheckCheckIcon,
  CircleCheckIcon,
  FolderIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
} from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { GENERAL_CHATS_PROJECT_ID } from "../generalChats";
import { useNowMinute } from "../hooks/useNowMinute";
import { useEnvironments } from "../state/environments";
import { useProjects, useThreadShells } from "../state/entities";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { buildThreadRouteParams } from "../threadRoutes";
import { useUiStateStore } from "../uiStateStore";
import { buildCompletionNotifications, buildRunningThreads } from "./ActivityCenter.logic";
import { ProjectFavicon } from "./ProjectFavicon";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

type ActivityView = "notifications" | "running";

function threadKey(thread: EnvironmentThreadShell): string {
  return scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
}

export function ActivityCenter() {
  const threads = useThreadShells();
  const projects = useProjects();
  const { environments } = useEnvironments();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ActivityView>("notifications");
  const lastVisitedAtByThreadKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  const markThreadVisited = useUiStateStore((state) => state.markThreadVisited);
  // Refresh relative labels once a minute without making every row own a timer.
  useNowMinute();

  const notifications = useMemo(
    () => buildCompletionNotifications({ threads, lastVisitedAtByThreadKey }),
    [lastVisitedAtByThreadKey, threads],
  );
  const running = useMemo(() => buildRunningThreads(threads), [threads]);
  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => count + Number(notification.unread), 0),
    [notifications],
  );
  const projectByKey = useMemo(
    () =>
      new Map(
        projects.map((project) => [`${project.environmentId}:${project.id}`, project] as const),
      ),
    [projects],
  );
  const environmentLabelById = useMemo(
    () =>
      new Map(environments.map((environment) => [environment.environmentId, environment.label])),
    [environments],
  );
  const showEnvironment = environments.length > 1;

  const openThread = useCallback(
    (thread: EnvironmentThreadShell) => {
      setOpen(false);
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
      });
    },
    [navigate],
  );
  const markAllRead = useCallback(() => {
    for (const notification of notifications) {
      if (notification.unread) {
        markThreadVisited(threadKey(notification.thread), notification.completedAt);
      }
    }
  }, [markThreadVisited, notifications]);
  const contextLabel = useCallback(
    (thread: EnvironmentThreadShell) => {
      const projectLabel =
        thread.projectId === GENERAL_CHATS_PROJECT_ID
          ? "Chats"
          : (projectByKey.get(`${thread.environmentId}:${thread.projectId}`)?.title ?? "Project");
      const environmentLabel = environmentLabelById.get(thread.environmentId);
      return showEnvironment && environmentLabel
        ? `${projectLabel} · ${environmentLabel}`
        : projectLabel;
    },
    [environmentLabelById, projectByKey, showEnvironment],
  );

  const triggerLabel = [
    "Open activity center",
    unreadCount > 0 ? `${unreadCount} unread` : null,
    running.length > 0 ? `${running.length} running` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              aria-label={triggerLabel}
              className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            />
          }
        >
          <BellIcon className="size-3.5" />
          {unreadCount > 0 ? (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-info" aria-hidden />
          ) : null}
        </TooltipTrigger>
        <TooltipPopup side="bottom">Activity</TooltipPopup>
      </Tooltip>
      <PopoverPopup
        side="bottom"
        align="end"
        sideOffset={6}
        className="w-[min(24rem,calc(100vw-1rem))]"
        viewportClassName="p-0"
      >
        <div className="flex items-center gap-1 border-b border-border/70 p-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === "notifications"}
            onClick={() => setView("notifications")}
            className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium ${
              view === "notifications"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            }`}
          >
            Notifications
            {unreadCount > 0 ? (
              <span className="rounded-full bg-info/15 px-1.5 font-mono text-[10px] text-info tabular-nums">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "running"}
            onClick={() => setView("running")}
            className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium ${
              view === "running"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            }`}
          >
            Running
            {running.length > 0 ? (
              <span className="rounded-full bg-info/15 px-1.5 font-mono text-[10px] text-info tabular-nums">
                {running.length > 99 ? "99+" : running.length}
              </span>
            ) : null}
          </button>
        </div>

        {view === "notifications" ? (
          <section aria-label="Task completion notifications">
            <div className="flex h-9 items-center justify-between border-b border-border/50 px-3">
              <span className="text-[11px] font-medium text-muted-foreground">
                {notifications.length === 0
                  ? "No task completions"
                  : `${notifications.length} task ${notifications.length === 1 ? "completion" : "completions"}`}
              </span>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <CheckCheckIcon className="size-3" />
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto p-1">
              {notifications.length === 0 ? (
                <EmptyState icon={<CircleCheckIcon className="size-4" />}>
                  Completed tasks will appear here.
                </EmptyState>
              ) : (
                notifications.map((notification) => (
                  <button
                    key={threadKey(notification.thread)}
                    type="button"
                    onClick={() => openThread(notification.thread)}
                    className={`flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left [contain-intrinsic-block-size:58px] [content-visibility:auto] hover:bg-accent ${
                      notification.unread ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center">
                      {notification.thread.projectId === GENERAL_CHATS_PROJECT_ID ? (
                        <MessageSquareIcon className="size-3.5" />
                      ) : (
                        <FolderIcon className="size-3.5" />
                      )}
                      {notification.unread ? (
                        <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-info" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {notification.thread.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground/70">
                          {formatRelativeTimeLabel(notification.completedAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/75">
                        <span className="min-w-0 truncate">
                          {contextLabel(notification.thread)}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{notification.unread ? "Unread" : "Read"}</span>
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        ) : (
          <section aria-label="Currently running tasks">
            <div className="max-h-80 overflow-y-auto p-1">
              {running.length === 0 ? (
                <EmptyState icon={<CircleCheckIcon className="size-4" />}>
                  Nothing is running right now.
                </EmptyState>
              ) : (
                running.map((entry) => {
                  const project = projectByKey.get(
                    `${entry.thread.environmentId}:${entry.thread.projectId}`,
                  );
                  return (
                    <button
                      key={threadKey(entry.thread)}
                      type="button"
                      onClick={() => openThread(entry.thread)}
                      className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left [contain-intrinsic-block-size:62px] [content-visibility:auto] hover:bg-accent"
                    >
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                        {entry.thread.projectId === GENERAL_CHATS_PROJECT_ID ? (
                          <MessageSquareIcon className="size-3.5 text-icon-muted" />
                        ) : project ? (
                          <ProjectFavicon
                            environmentId={project.environmentId}
                            cwd={project.workspaceRoot}
                            faviconPath={project.faviconPath}
                            className="size-4"
                          />
                        ) : (
                          <FolderIcon className="size-3.5 text-icon-muted" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">
                          {entry.thread.title}
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                          <LoaderCircleIcon className="size-3 shrink-0 text-info" />
                          <span className="truncate">
                            {entry.thread.planProgress?.step ?? entry.status}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                          <span className="min-w-0 truncate">{contextLabel(entry.thread)}</span>
                          <span aria-hidden>·</span>
                          <span className="shrink-0">
                            started {formatRelativeTimeLabel(entry.startedAt)}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        )}
      </PopoverPopup>
    </Popover>
  );
}

function EmptyState({
  icon,
  children,
}: {
  readonly icon: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground">
      {icon}
      <span>{children}</span>
    </div>
  );
}
