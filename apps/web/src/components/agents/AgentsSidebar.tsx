import { Link, useLocation } from "@tanstack/react-router";
import { BotIcon, FolderIcon, ListTodoIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { useMemo } from "react";

import { usePrimaryEnvironmentId } from "../../state/environments";
import { hermesAgentEnvironment } from "../../state/hermesAgents";
import { useEnvironmentQuery } from "../../state/query";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { cn } from "../../lib/utils";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "../ui/sidebar";
import { SidebarChromeFooter, SidebarChromeHeader } from "../sidebar/SidebarChrome";
import { isElectron } from "../../env";
import { resolveHermesConnectionState } from "./Agents.logic";
import { groupHermesTasks, localScheduledTasks } from "./Agents.tasks";
import { useAgentsSidebarStore } from "./agentsSidebarStore";

function sessionTitle(session: { readonly title: string | null }): string {
  return session.title?.trim() || "Untitled Hermes chat";
}

export function AgentsSidebar() {
  const section = useLocation({
    select: (location) => (location.pathname.startsWith("/scheduled") ? "tasks" : "chats"),
  });
  const environmentId = usePrimaryEnvironmentId();
  const selectedTaskId = useAgentsSidebarStore((state) => state.selectedTaskId);
  const selectedSessionId = useAgentsSidebarStore((state) => state.selectedSessionId);
  const taskFilter = useAgentsSidebarStore((state) => state.taskFilter);
  const setSelectedTaskId = useAgentsSidebarStore((state) => state.setSelectedTaskId);
  const setSelectedSessionId = useAgentsSidebarStore((state) => state.setSelectedSessionId);
  const setTaskFilter = useAgentsSidebarStore((state) => state.setTaskFilter);
  const status = useEnvironmentQuery(
    environmentId ? hermesAgentEnvironment.status({ environmentId, input: {} }) : null,
  );
  const connectionState = resolveHermesConnectionState({
    status: status.data,
    isPending: status.isPending,
    error: status.error,
  });
  const connected = connectionState === "connected";
  const sessions = useEnvironmentQuery(
    environmentId && connected
      ? hermesAgentEnvironment.sessions({ environmentId, input: {} })
      : null,
  );
  const cronJobs = useEnvironmentQuery(
    environmentId && connected && section === "tasks"
      ? hermesAgentEnvironment.cronJobs({ environmentId, input: {} })
      : null,
  );
  const grouped = useMemo(
    () => groupHermesTasks(cronJobs.data?.jobs ?? [], sessions.data?.sessions ?? []),
    [cronJobs.data?.jobs, sessions.data?.sessions],
  );
  const scheduledTasks = useMemo(() => localScheduledTasks(grouped.tasks), [grouped.tasks]);
  const visibleTasks = useMemo(
    () =>
      taskFilter === "active"
        ? scheduledTasks.filter((task) => task.job?.enabled === true)
        : scheduledTasks,
    [scheduledTasks, taskFilter],
  );
  const refresh = () => {
    sessions.refresh();
    cronJobs.refresh();
  };

  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent
        className="gap-0"
        fixedHeader={
          <SidebarGroup className="gap-1 p-[var(--sidebar-content-inset)]">
            <div className="flex h-8 items-center gap-2 px-2 text-sm font-semibold text-sidebar-foreground">
              {section === "tasks" ? (
                <ListTodoIcon className="size-4" />
              ) : (
                <BotIcon className="size-4" />
              )}
              <span>{section === "tasks" ? "Scheduled" : "Agents"}</span>
              {connected ? <span className="size-1.5 rounded-full bg-success" /> : null}
            </div>
          </SidebarGroup>
        }
      >
        <SidebarGroup className="px-2 pb-3 pt-1">
          <div className="flex items-center justify-between px-2 py-2 text-xs font-medium text-sidebar-muted-foreground">
            {section === "tasks" ? (
              <div className="flex rounded-md bg-sidebar-row-hover p-0.5">
                {(["active", "all"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setTaskFilter(filter)}
                    className={cn(
                      "rounded px-2 py-1 capitalize",
                      taskFilter === filter && "bg-background text-foreground shadow-sm",
                    )}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            ) : (
              <span>Hermes chats</span>
            )}
            <button
              type="button"
              aria-label={`Refresh ${section}`}
              onClick={refresh}
              className="rounded p-1 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
            >
              <RefreshCwIcon className="size-3.5" />
            </button>
          </div>
          {connectionState === "connecting" ? (
            <div className="flex justify-center py-8 text-sidebar-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" />
            </div>
          ) : !connected ? (
            <p className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground">
              {section === "tasks" ? "Scheduler isn’t reachable" : "Hermes isn’t reachable"}
            </p>
          ) : section === "tasks" ? (
            visibleTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
                className={cn(
                  "mb-1 w-full rounded-md px-2.5 py-2 text-left hover:bg-sidebar-row-hover",
                  selectedTaskId === task.id && "bg-sidebar-row-hover",
                )}
              >
                <span className="block truncate text-sm font-medium">{task.name}</span>
                <span className="mt-1 block text-[11px] text-sidebar-muted-foreground">
                  {task.job?.scheduleDisplay ?? "Past task"} · {task.runs.length} runs
                </span>
              </button>
            ))
          ) : (
            grouped.chats.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedSessionId(session.id)}
                className={cn(
                  "mb-1 w-full rounded-md px-2.5 py-2 text-left hover:bg-sidebar-row-hover",
                  selectedSessionId === session.id && "bg-sidebar-row-hover",
                )}
              >
                <span className="block truncate text-sm font-medium">{sessionTitle(session)}</span>
                <span className="mt-1 block text-[11px] text-sidebar-muted-foreground">
                  {session.messageCount} messages
                  {session.lastActive ? ` · ${formatRelativeTimeLabel(session.lastActive)}` : ""}
                </span>
              </button>
            ))
          )}
          {connected &&
          (section === "tasks" ? visibleTasks.length === 0 : grouped.chats.length === 0) ? (
            <p className="px-2 py-6 text-center text-xs text-sidebar-muted-foreground">
              {section === "tasks"
                ? taskFilter === "active"
                  ? "No active scheduled tasks"
                  : "No scheduled tasks yet"
                : "No Hermes chats yet"}
            </p>
          ) : null}
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarGroup className="px-2 py-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/" />}
              className="gap-2 px-2 text-muted-foreground"
            >
              <FolderIcon className="size-4" />
              <span>Projects</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/agents" />}
              isActive={section === "chats"}
              className="gap-2 px-2 text-muted-foreground data-[active=true]:text-foreground"
            >
              <BotIcon className="size-4" />
              <span>Agents</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/scheduled" />}
              isActive={section === "tasks"}
              className="gap-2 px-2 text-muted-foreground data-[active=true]:text-foreground"
            >
              <ListTodoIcon className="size-4" />
              <span>Scheduled</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      <SidebarSeparator />
      <SidebarChromeFooter />
    </>
  );
}
