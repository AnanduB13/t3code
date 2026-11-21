"use client";

import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useNavigate } from "@tanstack/react-router";
import {
  BellIcon,
  CheckCheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  FolderIcon,
  LoaderCircleIcon,
  MessageCircleQuestionIcon,
  MessageSquareIcon,
  ShieldQuestionIcon,
} from "lucide-react";
import { T, useGT, useMessages } from "gt-react";
import { useState, type ReactNode } from "react";

import { GENERAL_CHATS_PROJECT_ID } from "../generalChats";
import { useNowMinute } from "../hooks/useNowMinute";
import { useClientSettings } from "../hooks/useSettings";
import { useSystemNotificationAccess } from "../hooks/useSystemNotificationAccess";
import { cn } from "../lib/utils";
import { useEnvironments } from "../state/environments";
import { useProjects, useThreadShells } from "../state/entities";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { buildThreadRouteParams } from "../threadRoutes";
import { hasDesktopNotifications } from "../threadNotifications";
import { useUiStateStore } from "../uiStateStore";
import {
  buildCompletionNotifications,
  buildRunningThreads,
  threadActivityStatusLabel,
} from "./ActivityCenter.logic";
import { ProjectFavicon } from "./ProjectFavicon";
import {
  buildAttentionEntries,
  THREAD_ATTENTION_TITLES,
  type ThreadAttention,
} from "./threadAttention.logic";
import { Button } from "./ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

type ActivityView = "notifications" | "running";

function threadKey(thread: EnvironmentThreadShell): string {
  return scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
}

// Same hues as the notification toasts, so a thread reads the same everywhere.
const ATTENTION_ICONS = {
  approval: <ShieldQuestionIcon className="size-3.5 text-warning-foreground" />,
  input: <MessageCircleQuestionIcon className="size-3.5 text-info-foreground" />,
  failed: <CircleAlertIcon className="size-3.5 text-error" />,
  limited: <CircleAlertIcon className="size-3.5 text-warning" />,
} satisfies Record<ThreadAttention, ReactNode>;

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

  const gt = useGT();
  const messages = useMessages();

  const notifications = buildCompletionNotifications({ threads, lastVisitedAtByThreadKey });
  const attention = buildAttentionEntries({ threads, lastVisitedAtByThreadKey });
  const running = buildRunningThreads(threads);
  const unreadCount = notifications.reduce(
    (count, notification) => count + Number(notification.unread),
    0,
  );
  const notificationCount = attention.length + unreadCount;
  const wantsSystemAlerts = useClientSettings((settings) =>
    hasDesktopNotifications(settings.notificationMode),
  );
  const { access, request } = useSystemNotificationAccess();
  const projectByKey = new Map(
    projects.map((project) => [`${project.environmentId}:${project.id}`, project] as const),
  );
  const environmentLabelById = new Map(
    environments.map((environment) => [environment.environmentId, environment.label]),
  );
  const showEnvironment = environments.length > 1;

  const openThread = (thread: EnvironmentThreadShell) => {
    setOpen(false);
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
    });
  };
  const markAllRead = () => {
    for (const entry of attention) {
      if (entry.attention === "failed" || entry.attention === "limited") {
        markThreadVisited(threadKey(entry.thread), entry.since);
      }
    }
    for (const notification of notifications) {
      if (notification.unread) {
        markThreadVisited(threadKey(notification.thread), notification.completedAt);
      }
    }
  };
  const contextLabel = (thread: EnvironmentThreadShell) => {
    const projectLabel =
      thread.projectId === GENERAL_CHATS_PROJECT_ID
        ? gt("Chats")
        : (projectByKey.get(`${thread.environmentId}:${thread.projectId}`)?.title ?? gt("Project"));
    const environmentLabel = environmentLabelById.get(thread.environmentId);
    return showEnvironment && environmentLabel
      ? `${projectLabel} · ${environmentLabel}`
      : projectLabel;
  };
  const needYouLabel =
    attention.length > 0 ? gt("{count} need you", { count: attention.length }) : null;

  const triggerLabel = [
    gt("Open activity center"),
    needYouLabel,
    unreadCount > 0 ? gt("{count} unread", { count: unreadCount }) : null,
    running.length > 0 ? gt("{count} running", { count: running.length }) : null,
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
              render={<Button size="icon" variant="ghost-muted" className="shrink-0" />}
            />
          }
        >
          <BellIcon className="size-3.5" />
          {attention.length > 0 ? (
            <span
              className="absolute top-0.5 right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-warning px-0.5 font-mono text-4xs leading-none font-semibold text-black tabular-nums"
              aria-hidden
            >
              {attention.length > 9 ? "9+" : attention.length}
            </span>
          ) : unreadCount > 0 ? (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-info" aria-hidden />
          ) : null}
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          {attention.length > 0
            ? gt(
                "{count, plural, one {{count} thread needs you} other {{count} threads need you}}",
                { count: attention.length },
              )
            : gt("Activity")}
        </TooltipPopup>
      </Tooltip>
      <PopoverPopup
        side="bottom"
        align="end"
        sideOffset={6}
        className="w-[min(24rem,calc(100vw-1rem))]"
        padding="none"
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
            <T>Notifications</T>
            {notificationCount > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 font-mono text-3xs tabular-nums",
                  attention.length > 0 ? "bg-warning/15 text-warning" : "bg-info/15 text-info",
                )}
              >
                {notificationCount > 99 ? "99+" : notificationCount}
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
            <T>Running</T>
            {running.length > 0 ? (
              <span className="rounded-full bg-info/15 px-1.5 font-mono text-3xs text-info tabular-nums">
                {running.length > 99 ? "99+" : running.length}
              </span>
            ) : null}
          </button>
        </div>

        {wantsSystemAlerts && access !== "granted" ? (
          <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2 text-2xs text-muted-foreground">
            <span className="min-w-0 flex-1">
              {access === "default"
                ? gt("System notifications are not allowed yet.")
                : access === "denied"
                  ? gt("System notifications are blocked in your browser or OS settings.")
                  : gt("System notifications need HTTPS or the desktop app.")}
            </span>
            {access === "default" ? (
              <button
                type="button"
                onClick={() => void request()}
                className="shrink-0 rounded px-1.5 py-1 font-medium text-foreground hover:bg-accent"
              >
                <T>Allow</T>
              </button>
            ) : null}
          </div>
        ) : null}

        {view === "notifications" ? (
          <section aria-label={gt("Thread notifications")}>
            <div className="flex h-9 items-center justify-between border-b border-border/50 px-3">
              <span className="text-2xs font-medium text-muted-foreground">
                {[
                  needYouLabel,
                  notifications.length > 0
                    ? gt(
                        "{count, plural, one {{count} task completion} other {{count} task completions}}",
                        { count: notifications.length },
                      )
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || gt("Nothing new")}
              </span>
              {unreadCount > 0 ||
              attention.some(
                (entry) => entry.attention === "failed" || entry.attention === "limited",
              ) ? (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <CheckCheckIcon className="size-3" />
                  <T>Mark all read</T>
                </button>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto p-1">
              {attention.map((entry) => (
                <button
                  key={threadKey(entry.thread)}
                  type="button"
                  onClick={() => openThread(entry.thread)}
                  className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-foreground [contain-intrinsic-block-size:58px] [content-visibility:auto] hover:bg-accent"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                    {ATTENTION_ICONS[entry.attention]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                        {entry.thread.title}
                      </span>
                      <span className="shrink-0 text-3xs text-muted-foreground/70">
                        {formatRelativeTimeLabel(entry.since, undefined, messages)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground/75">
                      <span className="shrink-0 font-medium text-foreground/80">
                        {THREAD_ATTENTION_TITLES[entry.attention]}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="min-w-0 truncate">{contextLabel(entry.thread)}</span>
                    </span>
                  </span>
                </button>
              ))}
              {notifications.length === 0 && attention.length === 0 ? (
                <EmptyState icon={<CircleCheckIcon className="size-4" />}>
                  <T>Threads that finish or need you will appear here.</T>
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
                        <span className="shrink-0 text-3xs text-muted-foreground/70">
                          {formatRelativeTimeLabel(notification.completedAt, undefined, messages)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground/75">
                        <span className="min-w-0 truncate">
                          {contextLabel(notification.thread)}
                        </span>
                        <span aria-hidden>·</span>
                        <span>
                          {notification.unread
                            ? gt("Unread", { $context: "notification state" })
                            : gt("Read", { $context: "notification state" })}
                        </span>
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        ) : (
          <section aria-label={gt("Currently running tasks")}>
            <div className="max-h-80 overflow-y-auto p-1">
              {running.length === 0 ? (
                <EmptyState icon={<CircleCheckIcon className="size-4" />}>
                  <T>Nothing is running right now.</T>
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
                          <ProjectFavicon project={project} className="size-4" />
                        ) : (
                          <FolderIcon className="size-3.5 text-icon-muted" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">
                          {entry.thread.title}
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
                          <LoaderCircleIcon className="size-3 shrink-0 text-info" />
                          <span className="truncate">
                            {threadActivityStatusLabel(entry.status, messages)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-3xs text-muted-foreground/70">
                          <span className="min-w-0 truncate">{contextLabel(entry.thread)}</span>
                          <span aria-hidden>·</span>
                          <span className="shrink-0">
                            {gt("started {time}", {
                              time: formatRelativeTimeLabel(entry.startedAt, undefined, messages),
                            })}
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
