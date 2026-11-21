import { AsyncResult } from "effect/reactivity";
import {
  BotIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  CopyPlusIcon,
  LoaderCircleIcon,
  ListTodoIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  Trash2Icon,
  WifiOffIcon,
  WrenchIcon,
} from "lucide-react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { msg, T, useGT, useMessages, Var } from "gt-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type {
  HermesCronJob,
  HermesCronRun,
  HermesMessage,
  HermesSession,
  EnvironmentId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import ChatMarkdown from "../components/ChatMarkdown";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { InputGroup, InputGroupAddon } from "../components/ui/input-group";
import { SidebarInset } from "../components/ui/sidebar";
import { Textarea } from "../components/ui/textarea";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { m as resolveNow, type MessageResolver } from "../i18n/messages";
import { cn } from "../lib/utils";
import { useAgentEnvironment } from "../components/agents/useAgentEnvironment";
import { hermesAgentEnvironment } from "../state/hermesAgents";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";
import {
  resolveHermesConnectionState,
  type HermesConnectionState,
} from "../components/agents/Agents.logic";
import {
  chronologicalCronRuns,
  groupHermesTasks,
  localScheduledTasks,
} from "../components/agents/Agents.tasks";
import { useAgentsSidebarStore } from "../components/agents/agentsSidebarStore";
import { AgentsOverview } from "../components/agents/AgentsOverview";
import {
  ScheduledTaskDialog,
  type ScheduledTaskInput,
} from "../components/agents/ScheduledTaskDialog";
import { useProjects } from "../state/entities";

function sessionTitle(session: HermesSession, resolve: MessageResolver = resolveNow): string {
  return session.title?.trim() || resolve(msg("Untitled Hermes chat"));
}

const HERMES_CONNECTION_LABELS = {
  connected: msg("Hermes connected"),
  connecting: msg("Hermes connecting"),
  offline: msg("Hermes offline"),
  error: msg("Hermes error"),
  disconnected: msg("Hermes disconnected"),
} satisfies Record<HermesConnectionState | "disconnected", string>;

const SCHEDULER_CONNECTION_LABELS = {
  connected: msg("Scheduler connected"),
  connecting: msg("Scheduler connecting"),
  offline: msg("Scheduler offline"),
  error: msg("Scheduler error"),
  disconnected: msg("Scheduler disconnected"),
} satisfies Record<HermesConnectionState | "disconnected", string>;

function commandError(result: AsyncResult.AsyncResult<unknown, unknown>, fallback: string): string {
  if (result._tag !== "Failure") return fallback;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : fallback;
}

function TaskRunView({
  run,
  isLatest,
}: {
  readonly run: HermesCronRun;
  readonly isLatest: boolean;
}) {
  const m = useMessages();
  const timestamp = run.responseAt ?? run.completedAt ?? run.startedAt;
  const response =
    run.response?.trim() === "[SILENT]"
      ? m(msg("No update was delivered for this run."))
      : run.response?.trim() ||
        m(msg("The scheduled agent did not record a response for this run."));

  return (
    <article className="rounded-xl border border-border bg-card px-4 py-4 sm:px-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <span className="text-sm font-medium">
          {timestamp ? runLabelFromTimestamp(timestamp, m) : m(RUN_LABEL)}
        </span>
        <div className="flex items-center gap-2">
          {isLatest ? (
            <Badge variant="success">
              <T context="the newest scheduled task run">Latest</T>
            </Badge>
          ) : null}
          {timestamp ? (
            <span className="text-xs text-muted-foreground">
              {formatRelativeTimeLabel(timestamp, undefined, m)}
            </span>
          ) : null}
        </div>
      </header>
      <div className="text-sm leading-6">
        <ChatMarkdown text={response} cwd={undefined} lineBreaks />
      </div>
    </article>
  );
}

const RUN_LABEL = msg("Run", { $context: "noun, one execution of a scheduled task" });

function runLabelFromTimestamp(value: string, resolve: MessageResolver = resolveNow): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return resolve(RUN_LABEL);
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function HermesMessageView({ message }: { readonly message: HermesMessage }) {
  if (message.role === "system") return null;
  const isUser = message.role === "user";
  const isTool = message.role === "tool" || message.toolName !== null;

  if (isTool) {
    return (
      <details className="mx-auto w-full max-w-3xl rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground">
          <WrenchIcon className="size-3.5" />
          <span>{message.toolName || <T>Hermes tool</T>}</span>
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-foreground/80">
          {message.content}
        </pre>
      </details>
    );
  }

  return (
    <article className={cn("mx-auto w-full max-w-3xl", isUser && "flex justify-end")}>
      <div
        className={cn(
          "min-w-0 text-sm leading-6",
          isUser
            ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground"
            : "w-full px-1 text-foreground",
        )}
      >
        {isUser ? (
          message.content
        ) : (
          <>
            {message.reasoning ? (
              <details className="mb-3 rounded-lg border border-border/50 px-3 py-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  <T>Reasoning</T>
                </summary>
                <p className="mt-2 whitespace-pre-wrap">{message.reasoning}</p>
              </details>
            ) : null}
            <ChatMarkdown text={message.content} cwd={undefined} lineBreaks />
          </>
        )}
      </div>
    </article>
  );
}

type HermesWorkspaceSection = "tasks" | "chats";

function HermesWorkspaceView({
  section,
  standaloneScheduled = false,
}: {
  readonly section: HermesWorkspaceSection;
  readonly standaloneScheduled?: boolean;
}) {
  const { environmentId } = useAgentEnvironment();
  return (
    <HermesEnvironmentWorkspace
      key={environmentId ?? "no-environment"}
      environmentId={environmentId}
      section={section}
      standaloneScheduled={standaloneScheduled}
    />
  );
}

function HermesEnvironmentWorkspace({
  environmentId,
  section,
  standaloneScheduled,
}: {
  readonly environmentId: EnvironmentId | null;
  readonly section: HermesWorkspaceSection;
  readonly standaloneScheduled: boolean;
}) {
  const gt = useGT();
  const m = useMessages();
  const { environment, environments } = useAgentEnvironment();
  const setEnvironmentId = useAgentsSidebarStore((state) => state.setEnvironmentId);
  const showOverview = useAgentsSidebarStore((state) => state.showOverview);
  const deviceLabel = environment?.label ?? gt("this computer");
  const deviceConnected = environment?.connection.phase === "connected";
  const storedSessionId = useAgentsSidebarStore((state) => state.selectedSessionId);
  const setSelectedId = useAgentsSidebarStore((state) => state.setSelectedSessionId);
  const storedTaskId = useAgentsSidebarStore((state) => state.selectedTaskId);
  const setSelectedTaskId = useAgentsSidebarStore((state) => state.setSelectedTaskId);
  const taskFilter = useAgentsSidebarStore((state) => state.taskFilter);
  const setTaskFilter = useAgentsSidebarStore((state) => state.setTaskFilter);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<HermesCronJob | null>(null);
  const [taskMutation, setTaskMutation] = useState<string | null>(null);
  const [taskRunSnapshot, setTaskRunSnapshot] = useState<{
    readonly jobId: string;
    readonly runs: readonly HermesCronRun[];
    readonly total: number;
    readonly hasMore: boolean;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const mountedRef = useRef(true);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tracks unmount so command results that resolve after an environment switch skip state updates
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taskScrollRef = useRef<HTMLDivElement>(null);
  const pendingPrependRef = useRef<{ readonly height: number; readonly top: number } | null>(null);
  const scrolledTaskRef = useRef<string | null>(null);
  const autoScrolledTaskRef = useRef<string | null>(null);
  const projects = useProjects();

  const status = useEnvironmentQuery(
    environmentId ? hermesAgentEnvironment.status({ environmentId, input: {} }) : null,
  );
  const connectionState = resolveHermesConnectionState({
    status: status.data,
    isPending: status.isPending,
    error: status.error,
  });
  const connected = deviceConnected && connectionState === "connected";
  const timezone = status.data?.timezone ?? gt("server local time");
  const endpoint = status.data?.endpoint ?? "http://127.0.0.1:8642";
  const sessions = useEnvironmentQuery(
    environmentId && connected
      ? hermesAgentEnvironment.sessions({ environmentId, input: {} })
      : null,
  );
  const cronJobs = useEnvironmentQuery(
    environmentId && connected
      ? hermesAgentEnvironment.cronJobs({ environmentId, input: {} })
      : null,
  );
  const grouped = groupHermesTasks(cronJobs.data?.jobs ?? [], sessions.data?.sessions ?? []);
  const scheduledTasks = standaloneScheduled ? localScheduledTasks(grouped.tasks) : grouped.tasks;
  const visibleTasks =
    taskFilter === "active"
      ? scheduledTasks.filter((task) => task.job?.enabled === true)
      : scheduledTasks;
  // A stored selection that is not listed (yet) falls back to the first task, and becomes
  // selected again once it appears, such as a task created before the list refreshes.
  const selectedTaskId =
    storedTaskId && visibleTasks.some((task) => task.id === storedTaskId)
      ? storedTaskId
      : (visibleTasks[0]?.id ?? null);
  const selectedTask = scheduledTasks.find((task) => task.id === selectedTaskId) ?? null;
  const visibleSessions = grouped.chats;
  const selectedId =
    storedSessionId && visibleSessions.some((session) => session.id === storedSessionId)
      ? storedSessionId
      : (visibleSessions[0]?.id ?? null);
  const [taskRunPage, setTaskRunPage] = useState({ jobId: selectedTaskId, limit: 20 });
  if (taskRunPage.jobId !== selectedTaskId) {
    setTaskRunPage({ jobId: selectedTaskId, limit: 20 });
  }
  const taskRunLimit = taskRunPage.jobId === selectedTaskId ? taskRunPage.limit : 20;
  const taskRuns = useEnvironmentQuery(
    environmentId && connected && section === "tasks" && selectedTaskId
      ? hermesAgentEnvironment.cronRuns({
          environmentId,
          input: { jobId: selectedTaskId, limit: taskRunLimit },
        })
      : null,
  );
  // Keeps the loaded runs on screen while a larger page loads.
  if (
    taskRuns.data &&
    taskRuns.data.jobId === selectedTaskId &&
    taskRuns.data !== taskRunSnapshot
  ) {
    setTaskRunSnapshot(taskRuns.data);
  }
  const visibleTaskRunSnapshot = taskRunSnapshot?.jobId === selectedTaskId ? taskRunSnapshot : null;
  const chronologicalRuns = chronologicalCronRuns(visibleTaskRunSnapshot?.runs ?? []);
  const messages = useEnvironmentQuery(
    environmentId && connected && section === "chats" && selectedId
      ? hermesAgentEnvironment.messages({
          environmentId,
          input: { sessionId: selectedId },
        })
      : null,
  );

  const createSession = useAtomCommand(hermesAgentEnvironment.createSession, {
    reportFailure: false,
  });
  const updateSession = useAtomCommand(hermesAgentEnvironment.updateSession, {
    reportFailure: false,
  });
  const forkSession = useAtomCommand(hermesAgentEnvironment.forkSession, { reportFailure: false });
  const deleteSession = useAtomCommand(hermesAgentEnvironment.deleteSession, {
    reportFailure: false,
  });
  const sendMessage = useAtomCommand(hermesAgentEnvironment.sendMessage, { reportFailure: false });
  const createCronJob = useAtomCommand(hermesAgentEnvironment.createCronJob, {
    reportFailure: false,
  });
  const updateCronJob = useAtomCommand(hermesAgentEnvironment.updateCronJob, {
    reportFailure: false,
  });
  const pauseCronJob = useAtomCommand(hermesAgentEnvironment.pauseCronJob, {
    reportFailure: false,
  });
  const resumeCronJob = useAtomCommand(hermesAgentEnvironment.resumeCronJob, {
    reportFailure: false,
  });
  const runCronJob = useAtomCommand(hermesAgentEnvironment.runCronJob, { reportFailure: false });
  const deleteCronJob = useAtomCommand(hermesAgentEnvironment.deleteCronJob, {
    reportFailure: false,
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- pins the results scroller to the newest run before paint, and keeps it anchored when older runs are prepended
  useLayoutEffect(() => {
    if (scrolledTaskRef.current !== selectedTaskId) {
      scrolledTaskRef.current = selectedTaskId;
      pendingPrependRef.current = null;
      autoScrolledTaskRef.current = null;
    }
    const scroll = taskScrollRef.current;
    if (!scroll || !visibleTaskRunSnapshot || !selectedTaskId) return;
    const pending = pendingPrependRef.current;
    if (pending) {
      scroll.scrollTop = pending.top + (scroll.scrollHeight - pending.height);
      pendingPrependRef.current = null;
      return;
    }
    if (autoScrolledTaskRef.current !== selectedTaskId) {
      scroll.scrollTop = scroll.scrollHeight;
      autoScrolledTaskRef.current = selectedTaskId;
    }
  }, [selectedTaskId, visibleTaskRunSnapshot]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- scrolls the chat scroller to the newest message
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A new message, a sending indicator, or another chat must scroll to the bottom again.
    messages.data?.messages.length,
    section,
    sending,
    selectedId,
  ]);

  const selectedSession =
    sessions.data?.sessions.find((session) => session.id === selectedId) ?? null;

  const showError = (title: string, description: string) => {
    toastManager.add(stackedThreadToast({ type: "error", title, description }));
  };

  const openNewTask = () => {
    setEditingTask(null);
    setTaskDialogOpen(true);
  };

  const handleTaskSave = async (input: ScheduledTaskInput): Promise<boolean> => {
    if (!environmentId) return false;
    setTaskMutation("save");
    const result = editingTask
      ? await updateCronJob({
          environmentId,
          input: { jobId: editingTask.id, ...input, workdir: input.workdir ?? "" },
        })
      : await createCronJob({ environmentId, input });
    if (!mountedRef.current) return false;
    setTaskMutation(null);
    if (result._tag === "Success") {
      setSelectedTaskId(result.value.id);
      cronJobs.refresh();
      return true;
    }
    if (!isAtomCommandInterrupted(result)) {
      showError(
        gt("Couldn’t save scheduled task"),
        commandError(result, gt("The scheduler rejected the schedule.")),
      );
    }
    return false;
  };

  const handleTaskAction = async (action: "pause" | "resume" | "run" | "delete") => {
    if (!environmentId || !selectedTask?.job || taskMutation) return;
    const job = selectedTask.job;
    if (
      action === "delete" &&
      !window.confirm(
        gt("Delete “{name}”? Its previous result sessions will remain in history.", {
          name: job.name,
        }),
      )
    )
      return;
    setTaskMutation(action);
    const command =
      action === "pause"
        ? pauseCronJob
        : action === "resume"
          ? resumeCronJob
          : action === "run"
            ? runCronJob
            : deleteCronJob;
    const result = await command({ environmentId, input: { jobId: job.id } });
    if (!mountedRef.current) return;
    setTaskMutation(null);
    if (result._tag === "Success") {
      if (action === "delete") setSelectedTaskId(null);
      cronJobs.refresh();
      sessions.refresh();
      taskRuns.refresh();
    } else if (!isAtomCommandInterrupted(result)) {
      showError(
        action === "pause"
          ? gt("Couldn’t pause scheduled task")
          : action === "resume"
            ? gt("Couldn’t resume scheduled task")
            : action === "run"
              ? gt("Couldn’t run scheduled task")
              : gt("Couldn’t delete scheduled task"),
        commandError(result, gt("The scheduler could not complete that action.")),
      );
    }
  };

  const handleCreate = async () => {
    if (!environmentId) return;
    const result = await createSession({ environmentId, input: {} });
    if (!mountedRef.current) return;
    if (AsyncResult.isSuccess(result)) {
      setSelectedId(result.value.id);
      sessions.refresh();
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      showError(
        gt("Couldn’t start a Hermes chat"),
        commandError(result, gt("The session could not be created.")),
      );
    }
  };

  const handleRename = async () => {
    if (!environmentId || !selectedSession) return;
    const title = window.prompt(gt("Rename this Hermes chat"), sessionTitle(selectedSession, m));
    if (title === null || !title.trim()) return;
    const result = await updateSession({
      environmentId,
      input: { sessionId: selectedSession.id, title: title.trim() },
    });
    if (AsyncResult.isSuccess(result)) sessions.refresh();
    else if (!isAtomCommandInterrupted(result)) {
      showError(
        gt("Couldn’t rename chat"),
        commandError(result, gt("Hermes rejected the new title.")),
      );
    }
  };

  const handleFork = async () => {
    if (!environmentId || !selectedSession) return;
    const result = await forkSession({
      environmentId,
      input: { sessionId: selectedSession.id },
    });
    if (!mountedRef.current) return;
    if (AsyncResult.isSuccess(result)) {
      setSelectedId(result.value.id);
      sessions.refresh();
    } else if (!isAtomCommandInterrupted(result)) {
      showError(
        gt("Couldn’t fork chat"),
        commandError(result, gt("Hermes could not branch this conversation.")),
      );
    }
  };

  const handleDelete = async () => {
    if (!environmentId || !selectedSession) return;
    if (
      !window.confirm(
        gt("Delete “{name}”? This cannot be undone.", {
          name: sessionTitle(selectedSession, m),
        }),
      )
    )
      return;
    const result = await deleteSession({
      environmentId,
      input: { sessionId: selectedSession.id },
    });
    if (!mountedRef.current) return;
    if (AsyncResult.isSuccess(result)) {
      setSelectedId(null);
      sessions.refresh();
    } else if (!isAtomCommandInterrupted(result)) {
      showError(
        gt("Couldn’t delete chat"),
        commandError(result, gt("Hermes could not delete this conversation.")),
      );
    }
  };

  const handleSubmit = async () => {
    if (!environmentId || !selectedId || !draft.trim() || sending) return;
    const message = draft.trim();
    setDraft("");
    setSending(true);
    const result = await sendMessage({ environmentId, input: { sessionId: selectedId, message } });
    setSending(false);
    if (AsyncResult.isSuccess(result)) {
      messages.refresh();
      sessions.refresh();
    } else if (!isAtomCommandInterrupted(result)) {
      setDraft(message);
      showError(
        gt("Hermes couldn’t complete the request"),
        commandError(result, gt("The task failed.")),
      );
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void handleSubmit();
  };
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:gap-3 sm:px-5",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          {standaloneScheduled ? (
            <CalendarClockIcon className="size-4" />
          ) : (
            <BotIcon className="size-4" />
          )}
          <span className="text-sm font-semibold">
            {standaloneScheduled ? <T>Scheduled</T> : <T>Agents</T>}
          </span>
          {!standaloneScheduled ? (
            <Button size="xs" variant="ghost" onClick={showOverview}>
              <T>All agents</T>
            </Button>
          ) : null}
          <select
            aria-label={gt("Computer for scheduled tasks and agents")}
            className="h-7 min-w-0 max-w-48 rounded-md border bg-background px-2 text-sm"
            value={environmentId ?? ""}
            disabled={taskMutation !== null || sending || taskDialogOpen}
            onChange={(event) => {
              const target = environments.find(
                (entry) => entry.environmentId === event.target.value,
              );
              if (target) setEnvironmentId(target.environmentId);
            }}
          >
            {!environment ? (
              <option value={environmentId ?? ""}>{gt("Choose a computer")}</option>
            ) : null}
            {environments.map((entry) => (
              <option key={entry.environmentId} value={entry.environmentId}>
                {entry.connection.phase === "connected"
                  ? entry.label
                  : gt("{label} (disconnected)", { label: entry.label })}
              </option>
            ))}
          </select>
          <Badge
            variant={connected ? "success" : connectionState === "error" ? "error" : "outline"}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                connected
                  ? "bg-success"
                  : connectionState === "connecting"
                    ? "animate-pulse bg-warning"
                    : connectionState === "error"
                      ? "bg-destructive"
                      : "bg-muted-foreground",
              )}
            />
            {m(
              (standaloneScheduled ? SCHEDULER_CONNECTION_LABELS : HERMES_CONNECTION_LABELS)[
                deviceConnected ? connectionState : "disconnected"
              ],
            )}
          </Badge>
          {!standaloneScheduled && status.data?.model ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {status.data.model}
            </span>
          ) : null}
          <Button
            className="ml-auto"
            size="xs"
            variant="outline"
            disabled={!connected}
            onClick={() => (section === "tasks" ? openNewTask() : void handleCreate())}
          >
            <PlusIcon className="size-3.5" />{" "}
            {section === "tasks" ? <T>New scheduled task</T> : <T>New chat</T>}
          </Button>
        </header>

        {connected && (cronJobs.error || sessions.error) ? (
          <div
            role="alert"
            className="flex items-center gap-3 border-b border-border px-5 py-3 text-sm text-destructive"
          >
            <span className="flex-1">{cronJobs.error ?? sessions.error}</span>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                cronJobs.refresh();
                sessions.refresh();
              }}
            >
              <T>Retry</T>
            </Button>
          </div>
        ) : null}

        {deviceConnected && connectionState === "connecting" ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <LoaderCircleIcon className="size-5 animate-spin" />
          </div>
        ) : !connected ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-lg rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
              <WifiOffIcon className="mx-auto size-8 text-muted-foreground" />
              <h1 className="mt-4 text-lg font-semibold">
                {standaloneScheduled ? (
                  <T>Scheduled task runner isn’t reachable</T>
                ) : (
                  <T>Hermes API isn’t reachable</T>
                )}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {deviceConnected ? (
                  <T>
                    T3 looked for Hermes on <Var>{deviceLabel}</Var> at{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      <Var>{endpoint}</Var>
                    </code>
                    .
                  </T>
                ) : (
                  <T>
                    Connect <Var>{deviceLabel}</Var> in Settings → Connections. Its Hermes runner is
                    at{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      <Var>{endpoint}</Var>
                    </code>
                    .
                  </T>
                )}{" "}
                <T>
                  You can choose another connected computer above. Enable Hermes’ API server on the
                  selected computer and restart its gateway. T3 reads the API key server-side from{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">~/.hermes/.env</code> or{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">HERMES_API_KEY</code>.
                </T>
              </p>
              <pre className="mt-4 overflow-x-auto rounded-lg bg-muted/60 p-3 text-left text-xs">
                hermes config set API_SERVER_ENABLED true{"\n"}hermes gateway restart
              </pre>
              {status.data?.message || status.error ? (
                <p className="mt-3 text-xs text-destructive">
                  {status.data?.message ?? status.error}
                </p>
              ) : null}
              <Button className="mt-5" size="sm" variant="outline" onClick={status.refresh}>
                <RefreshCwIcon className="size-3.5" /> <T>Retry</T>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="hidden min-h-0 border-r border-border bg-muted/10">
              <div className="flex items-center justify-between px-3 py-3">
                {section === "tasks" ? (
                  <div className="flex rounded-md bg-muted p-0.5">
                    {(["active", "all"] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        className={cn(
                          "rounded px-2 py-1 text-xs text-muted-foreground",
                          taskFilter === filter && "bg-background text-foreground shadow-sm",
                        )}
                        onClick={() => setTaskFilter(filter)}
                      >
                        {filter === "active" ? (
                          <T context="scheduled task filter">Active</T>
                        ) : (
                          <T context="scheduled task filter">All</T>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">
                    <T>Hermes chats</T>
                  </span>
                )}
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={section === "tasks" ? gt("Refresh tasks") : gt("Refresh chats")}
                  onClick={() => {
                    sessions.refresh();
                    cronJobs.refresh();
                    taskRuns.refresh();
                  }}
                >
                  <RefreshCwIcon className="size-3.5" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {section === "tasks"
                  ? visibleTasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setSelectedTaskId(task.id)}
                        className={cn(
                          "mb-1 w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent",
                          selectedTaskId === task.id && "bg-accent",
                        )}
                      >
                        <span className="block truncate text-sm font-medium">{task.name}</span>
                        <span className="mt-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
                          {gt(
                            "{schedule} · {count, plural, one {{count} run} other {{count} runs}}",
                            {
                              schedule: task.job?.scheduleDisplay ?? gt("Past task"),
                              count: task.runs.length,
                            },
                          )}
                        </span>
                      </button>
                    ))
                  : grouped.chats.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setSelectedId(session.id)}
                        className={cn(
                          "mb-1 w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent",
                          selectedId === session.id && "bg-accent",
                        )}
                      >
                        <span className="block truncate text-sm font-medium">
                          {sessionTitle(session, m)}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
                          {gt("{count, plural, one {{count} message} other {{count} messages}}", {
                            count: session.messageCount,
                          })}
                          {session.lastActive ? (
                            <>· {formatRelativeTimeLabel(session.lastActive, undefined, m)}</>
                          ) : null}
                        </span>
                      </button>
                    ))}
                {!sessions.isPending &&
                (section === "tasks" ? visibleTasks.length === 0 : grouped.chats.length === 0) ? (
                  <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {section === "tasks" ? (
                      taskFilter === "active" ? (
                        <T>No active scheduled tasks.</T>
                      ) : (
                        <T>No scheduled tasks yet.</T>
                      )
                    ) : (
                      <T>No Hermes chats yet.</T>
                    )}
                  </div>
                ) : null}
              </div>
            </aside>

            <main className="flex min-h-0 min-w-0 flex-1 flex-col">
              {section === "tasks" && selectedTask ? (
                <>
                  <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
                    <select
                      className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none md:hidden"
                      value={selectedTaskId ?? ""}
                      onChange={(event) => setSelectedTaskId(event.target.value)}
                      aria-label={gt("Scheduled task")}
                    >
                      {visibleTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.name}
                        </option>
                      ))}
                    </select>
                    <div className="hidden min-w-0 flex-1 md:block">
                      <div className="truncate text-sm font-medium">{selectedTask.name}</div>
                      <div className="text-2xs text-muted-foreground">
                        {gt(
                          "{schedule} · {count, plural, one {{count} run} other {{count} runs}}",
                          {
                            schedule: selectedTask.job?.scheduleDisplay ?? gt("Archived task"),
                            count: taskRuns.data?.total ?? selectedTask.runs.length,
                          },
                        )}
                      </div>
                    </div>
                    {selectedTask.job ? (
                      <div className="flex items-center gap-1 text-xs">
                        <Badge
                          className="hidden sm:inline-flex"
                          variant={selectedTask.job.enabled ? "success" : "outline"}
                        >
                          {selectedTask.job.enabled ? (
                            <CheckCircle2Icon className="size-3" />
                          ) : null}
                          {selectedTask.job.state}
                        </Badge>
                        <span className="hidden items-center gap-1 text-muted-foreground lg:flex">
                          <CalendarClockIcon className="size-3.5" />
                          {selectedTask.job.scheduleDisplay ?? gt("No schedule")}
                        </span>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={gt("Edit scheduled task")}
                          disabled={taskMutation !== null}
                          onClick={() => {
                            setEditingTask(selectedTask.job);
                            setTaskDialogOpen(true);
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={
                            selectedTask.job.enabled
                              ? gt("Pause scheduled task")
                              : gt("Resume scheduled task")
                          }
                          disabled={taskMutation !== null}
                          onClick={() =>
                            void handleTaskAction(selectedTask.job!.enabled ? "pause" : "resume")
                          }
                        >
                          {selectedTask.job.enabled ? <PauseIcon /> : <PlayIcon />}
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={gt("Run scheduled task now")}
                          disabled={taskMutation !== null}
                          onClick={() => void handleTaskAction("run")}
                        >
                          {taskMutation === "run" ? (
                            <LoaderCircleIcon className="animate-spin" />
                          ) : (
                            <PlayIcon />
                          )}
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={gt("Delete scheduled task")}
                          disabled={taskMutation !== null}
                          onClick={() => void handleTaskAction("delete")}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div
                    ref={taskScrollRef}
                    className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
                  >
                    <div className="mx-auto max-w-3xl space-y-4">
                      {selectedTask.job ? (
                        <section className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
                          <p className="whitespace-pre-wrap leading-6">{selectedTask.job.prompt}</p>
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                            <span>
                              {selectedTask.job.workdir ? (
                                <T>
                                  Runs in <Var>{selectedTask.job.workdir}</Var>
                                </T>
                              ) : (
                                <T>Runs in the agent workspace</T>
                              )}
                            </span>
                            <span>
                              <T>
                                New result chat for every run · <Var>{timezone}</Var>
                              </T>
                            </span>
                          </div>
                        </section>
                      ) : null}
                      {visibleTaskRunSnapshot === null ? (
                        taskRuns.error ? (
                          <div className="mx-auto mt-12 max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
                            <h2 className="text-sm font-semibold">
                              <T>Couldn’t load task results</T>
                            </h2>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                              {taskRuns.error}
                            </p>
                            <Button
                              className="mt-4"
                              size="sm"
                              variant="outline"
                              onClick={taskRuns.refresh}
                            >
                              <RefreshCwIcon className="size-3.5" /> <T>Retry</T>
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                            <LoaderCircleIcon className="size-4 animate-spin" />
                            <T>Loading task results…</T>
                          </div>
                        )
                      ) : null}
                      {visibleTaskRunSnapshot?.hasMore ? (
                        <div className="flex justify-center pb-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={taskRuns.isPending}
                            onClick={() => {
                              const scroll = taskScrollRef.current;
                              if (scroll) {
                                pendingPrependRef.current = {
                                  height: scroll.scrollHeight,
                                  top: scroll.scrollTop,
                                };
                              }
                              setTaskRunPage({ jobId: selectedTaskId, limit: taskRunLimit + 20 });
                            }}
                          >
                            {taskRuns.isPending ? (
                              <LoaderCircleIcon className="animate-spin" />
                            ) : null}
                            <T>Load older results</T>
                          </Button>
                        </div>
                      ) : visibleTaskRunSnapshot?.runs.length ? (
                        <p className="pb-2 text-center text-xs text-muted-foreground">
                          {gt(
                            "Beginning of history · {count, plural, one {{count} result loaded} other {all {count} results loaded}}",
                            { count: visibleTaskRunSnapshot.total },
                          )}
                        </p>
                      ) : null}
                      {!taskRuns.isPending && visibleTaskRunSnapshot?.runs.length === 0 ? (
                        <div className="py-16 text-center">
                          <ListTodoIcon className="mx-auto size-8 text-muted-foreground" />
                          <h2 className="mt-4 font-semibold">
                            <T>No results yet</T>
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            <T>
                              The scheduled agent’s response will appear here after the first run.
                            </T>
                          </p>
                        </div>
                      ) : null}
                      {chronologicalRuns.map((run, index) => (
                        <TaskRunView
                          key={run.sessionId}
                          run={run}
                          isLatest={index === chronologicalRuns.length - 1}
                        />
                      ))}
                      {selectedTask.job?.nextRunAt ? (
                        <p className="pt-2 text-center text-xs text-muted-foreground">
                          <T>
                            Next run{" "}
                            <Var>
                              {formatRelativeTimeLabel(selectedTask.job.nextRunAt, undefined, m)}
                            </Var>
                          </T>
                        </p>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : section === "chats" && selectedSession ? (
                <>
                  <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
                    <select
                      className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none md:pointer-events-none md:appearance-none"
                      value={selectedId ?? ""}
                      onChange={(event) => setSelectedId(event.target.value)}
                      aria-label={gt("Hermes chat")}
                    >
                      {visibleSessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {sessionTitle(session, m)}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={gt("Rename chat")}
                      onClick={() => void handleRename()}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={gt("Fork chat")}
                      onClick={() => void handleFork()}
                    >
                      <CopyPlusIcon />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={gt("Delete chat")}
                      onClick={() => void handleDelete()}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <div
                    ref={scrollRef}
                    className="scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6"
                  >
                    <div className="space-y-6">
                      {messages.isPending && messages.data === null ? (
                        <LoaderCircleIcon className="mx-auto mt-12 size-5 animate-spin text-muted-foreground" />
                      ) : null}
                      {messages.data?.messages.map((message) => (
                        <HermesMessageView key={message.id} message={message} />
                      ))}
                      {sending ? (
                        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-1 text-sm text-muted-foreground">
                          <LoaderCircleIcon className="size-4 animate-spin" />{" "}
                          <T>Hermes is working on the task…</T>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <form
                    onSubmit={onSubmit}
                    className="shrink-0 border-t border-border bg-background p-3 sm:px-6 sm:py-4"
                  >
                    <div className="mx-auto max-w-3xl">
                      <InputGroup className="items-end">
                        <Textarea
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onKeyDown={onComposerKeyDown}
                          disabled={sending}
                          placeholder={gt("Ask Hermes to chat, research, or do a task…")}
                          aria-label={gt("Message Hermes")}
                        />
                        <InputGroupAddon align="inline-end">
                          <Button
                            type="submit"
                            size="icon-sm"
                            className="mb-2"
                            disabled={sending || !draft.trim()}
                            aria-label={gt("Send to Hermes")}
                          >
                            {sending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
                          </Button>
                        </InputGroupAddon>
                      </InputGroup>
                      <p className="mt-1.5 text-2xs text-muted-foreground">
                        <T>
                          Enter to send · Shift+Enter for a new line · Hermes uses its configured
                          tools, skills, memory, and model
                        </T>
                      </p>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-6 text-center">
                  <div>
                    <MessageSquarePlusIcon className="mx-auto size-8 text-muted-foreground" />
                    <h2 className="mt-4 font-semibold">
                      {section === "tasks" ? (
                        <T>No scheduled tasks yet</T>
                      ) : (
                        <T>Start a Hermes conversation</T>
                      )}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {section === "tasks" ? (
                        standaloneScheduled ? (
                          <T>Your recurring tasks will appear here with their result history.</T>
                        ) : (
                          <T>Recurring Hermes jobs will appear here with their result history.</T>
                        )
                      ) : (
                        <T>
                          Chat, run tasks, and use the same agent capabilities you use from Discord.
                        </T>
                      )}
                    </p>
                    {section === "chats" ? (
                      <Button className="mt-4" size="sm" onClick={() => void handleCreate()}>
                        <PlusIcon /> <T>New chat</T>
                      </Button>
                    ) : (
                      <Button className="mt-4" size="sm" onClick={openNewTask}>
                        <PlusIcon /> <T>New scheduled task</T>
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </main>
          </div>
        )}
      </div>
      <ScheduledTaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        job={editingTask}
        deviceLabel={deviceLabel}
        projects={projects
          .filter((project) => project.environmentId === environmentId)
          .map((project) => ({ title: project.title, workspaceRoot: project.workspaceRoot }))}
        timezone={timezone}
        saving={taskMutation === "save"}
        onSave={handleTaskSave}
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/agents")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: AgentsWorkspace,
});

function AgentsWorkspace() {
  const view = useAgentsSidebarStore((state) => state.agentView);
  const section = useAgentsSidebarStore((state) => state.section);
  if (view === "overview") return <AgentsOverview />;
  return <HermesWorkspaceView section={section} />;
}
