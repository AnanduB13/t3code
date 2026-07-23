import { AsyncResult } from "effect/unstable/reactivity";
import {
  BotIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  CopyPlusIcon,
  LoaderCircleIcon,
  ListTodoIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  Trash2Icon,
  WifiOffIcon,
  WrenchIcon,
} from "lucide-react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type { HermesCronRun, HermesMessage, HermesSession } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import ChatMarkdown from "../components/ChatMarkdown";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { SidebarInset } from "../components/ui/sidebar";
import { Textarea } from "../components/ui/textarea";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { cn } from "../lib/utils";
import { usePrimaryEnvironmentId } from "../state/environments";
import { hermesAgentEnvironment } from "../state/hermesAgents";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";
import { resolveHermesConnectionState } from "../components/agents/Agents.logic";
import { chronologicalCronRuns, groupHermesTasks } from "../components/agents/Agents.tasks";

function sessionTitle(session: HermesSession): string {
  return session.title?.trim() || "Untitled Hermes chat";
}

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
  const timestamp = run.responseAt ?? run.completedAt ?? run.startedAt;
  const response =
    run.response?.trim() === "[SILENT]"
      ? "No update was delivered for this run."
      : run.response?.trim() || "Hermes did not record a response for this run.";

  return (
    <article className="rounded-xl border border-border bg-card px-4 py-4 sm:px-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <span className="text-sm font-medium">
          {timestamp ? runLabelFromTimestamp(timestamp) : "Run"}
        </span>
        <div className="flex items-center gap-2">
          {isLatest ? <Badge variant="success">Latest</Badge> : null}
          {timestamp ? (
            <span className="text-xs text-muted-foreground">
              {formatRelativeTimeLabel(timestamp)}
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

function runLabelFromTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Run";
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
          <span>{message.toolName || "Hermes tool"}</span>
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
                <summary className="cursor-pointer">Reasoning</summary>
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

function AgentsRouteView() {
  const environmentId = usePrimaryEnvironmentId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskRunLimit, setTaskRunLimit] = useState(20);
  const [taskRunSnapshot, setTaskRunSnapshot] = useState<{
    readonly jobId: string;
    readonly runs: readonly HermesCronRun[];
    readonly total: number;
    readonly hasMore: boolean;
  } | null>(null);
  const [section, setSection] = useState<"tasks" | "chats">("tasks");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taskScrollRef = useRef<HTMLDivElement>(null);
  const pendingPrependRef = useRef<{ readonly height: number; readonly top: number } | null>(null);
  const autoScrolledTaskRef = useRef<string | null>(null);

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
    environmentId && connected
      ? hermesAgentEnvironment.cronJobs({ environmentId, input: {} })
      : null,
  );
  const grouped = useMemo(
    () => groupHermesTasks(cronJobs.data?.jobs ?? [], sessions.data?.sessions ?? []),
    [cronJobs.data?.jobs, sessions.data?.sessions],
  );
  const selectedTask = useMemo(
    () => grouped.tasks.find((task) => task.id === selectedTaskId) ?? null,
    [grouped.tasks, selectedTaskId],
  );
  const visibleSessions = grouped.chats;
  const taskRuns = useEnvironmentQuery(
    environmentId && connected && selectedTaskId
      ? hermesAgentEnvironment.cronRuns({
          environmentId,
          input: { jobId: selectedTaskId, limit: taskRunLimit },
        })
      : null,
  );
  const visibleTaskRunSnapshot = taskRunSnapshot?.jobId === selectedTaskId ? taskRunSnapshot : null;
  const chronologicalRuns = useMemo(
    () => chronologicalCronRuns(visibleTaskRunSnapshot?.runs ?? []),
    [visibleTaskRunSnapshot?.runs],
  );
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

  useEffect(() => {
    if (selectedTaskId && grouped.tasks.some((task) => task.id === selectedTaskId)) return;
    setSelectedTaskId(grouped.tasks[0]?.id ?? null);
  }, [grouped.tasks, selectedTaskId]);

  useLayoutEffect(() => {
    setTaskRunLimit(20);
    pendingPrependRef.current = null;
    autoScrolledTaskRef.current = null;
  }, [selectedTaskId]);

  useLayoutEffect(() => {
    if (!taskRuns.data || taskRuns.data.jobId !== selectedTaskId) return;
    setTaskRunSnapshot(taskRuns.data);
  }, [selectedTaskId, taskRuns.data]);

  useLayoutEffect(() => {
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

  useEffect(() => {
    if (selectedId && visibleSessions.some((session) => session.id === selectedId)) return;
    setSelectedId(visibleSessions[0]?.id ?? null);
  }, [selectedId, visibleSessions]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.data?.messages.length, section, sending, selectedId]);

  const selectedSession = useMemo(
    () => sessions.data?.sessions.find((session) => session.id === selectedId) ?? null,
    [selectedId, sessions.data],
  );

  const showError = useCallback((title: string, description: string) => {
    toastManager.add(stackedThreadToast({ type: "error", title, description }));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!environmentId) return;
    const result = await createSession({ environmentId, input: {} });
    if (AsyncResult.isSuccess(result)) {
      setSection("chats");
      setSelectedId(result.value.id);
      sessions.refresh();
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      showError(
        "Couldn’t start a Hermes chat",
        commandError(result, "The session could not be created."),
      );
    }
  }, [createSession, environmentId, sessions, showError]);

  const handleRename = useCallback(async () => {
    if (!environmentId || !selectedSession) return;
    const title = window.prompt("Rename this Hermes chat", sessionTitle(selectedSession));
    if (title === null || !title.trim()) return;
    const result = await updateSession({
      environmentId,
      input: { sessionId: selectedSession.id, title: title.trim() },
    });
    if (AsyncResult.isSuccess(result)) sessions.refresh();
    else if (!isAtomCommandInterrupted(result)) {
      showError("Couldn’t rename chat", commandError(result, "Hermes rejected the new title."));
    }
  }, [environmentId, selectedSession, sessions, showError, updateSession]);

  const handleFork = useCallback(async () => {
    if (!environmentId || !selectedSession) return;
    const result = await forkSession({
      environmentId,
      input: { sessionId: selectedSession.id },
    });
    if (AsyncResult.isSuccess(result)) {
      setSelectedId(result.value.id);
      sessions.refresh();
    } else if (!isAtomCommandInterrupted(result)) {
      showError(
        "Couldn’t fork chat",
        commandError(result, "Hermes could not branch this conversation."),
      );
    }
  }, [environmentId, forkSession, selectedSession, sessions, showError]);

  const handleDelete = useCallback(async () => {
    if (!environmentId || !selectedSession) return;
    if (!window.confirm(`Delete “${sessionTitle(selectedSession)}”? This cannot be undone.`))
      return;
    const result = await deleteSession({
      environmentId,
      input: { sessionId: selectedSession.id },
    });
    if (AsyncResult.isSuccess(result)) {
      setSelectedId(null);
      sessions.refresh();
    } else if (!isAtomCommandInterrupted(result)) {
      showError(
        "Couldn’t delete chat",
        commandError(result, "Hermes could not delete this conversation."),
      );
    }
  }, [deleteSession, environmentId, selectedSession, sessions, showError]);

  const handleSubmit = useCallback(async () => {
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
      showError("Hermes couldn’t complete the request", commandError(result, "The task failed."));
    }
  }, [draft, environmentId, messages, selectedId, sendMessage, sending, sessions, showError]);

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
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "flex h-12 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-5",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          <BotIcon className="size-4" />
          <span className="text-sm font-semibold">Agents</span>
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
            Hermes {connectionState}
          </Badge>
          {status.data?.model ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {status.data.model}
            </span>
          ) : null}
          {connected ? (
            <div className="ml-auto flex items-center gap-1 md:hidden">
              <Button
                size="icon-xs"
                variant={section === "tasks" ? "secondary" : "ghost"}
                aria-label="Scheduled tasks"
                onClick={() => setSection("tasks")}
              >
                <ListTodoIcon />
              </Button>
              <Button
                size="icon-xs"
                variant={section === "chats" ? "secondary" : "ghost"}
                aria-label="Hermes chats"
                onClick={() => setSection("chats")}
              >
                <MessageSquareIcon />
              </Button>
            </div>
          ) : null}
          <Button
            className="md:ml-auto"
            size="xs"
            variant="outline"
            disabled={!connected}
            onClick={() => void handleCreate()}
          >
            <PlusIcon className="size-3.5" /> New chat
          </Button>
        </header>

        {connectionState === "connecting" ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <LoaderCircleIcon className="size-5 animate-spin" />
          </div>
        ) : !connected ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-lg rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
              <WifiOffIcon className="mx-auto size-8 text-muted-foreground" />
              <h1 className="mt-4 text-lg font-semibold">Hermes API isn’t reachable</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                T3 looked for Hermes at{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  {status.data?.endpoint ?? "http://127.0.0.1:8642"}
                </code>
                . Enable Hermes’ API server and restart its gateway. T3 reads the API key
                server-side from{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">~/.hermes/.env</code> or{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">HERMES_API_KEY</code>.
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
                <RefreshCwIcon className="size-3.5" /> Retry
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="hidden min-h-0 border-r border-border bg-muted/10 md:flex md:flex-col">
              <div className="grid grid-cols-2 gap-1 border-b border-border p-2">
                <Button
                  size="sm"
                  variant={section === "tasks" ? "secondary" : "ghost"}
                  onClick={() => setSection("tasks")}
                >
                  <ListTodoIcon className="size-3.5" /> Tasks
                  {grouped.tasks.length ? (
                    <span className="text-[10px] text-muted-foreground">
                      {grouped.tasks.length}
                    </span>
                  ) : null}
                </Button>
                <Button
                  size="sm"
                  variant={section === "chats" ? "secondary" : "ghost"}
                  onClick={() => setSection("chats")}
                >
                  <MessageSquareIcon className="size-3.5" /> Chats
                  {grouped.chats.length ? (
                    <span className="text-[10px] text-muted-foreground">
                      {grouped.chats.length}
                    </span>
                  ) : null}
                </Button>
              </div>
              <div className="flex items-center justify-between px-3 py-3">
                <span className="text-xs font-medium text-muted-foreground">
                  {section === "tasks" ? "Scheduled tasks" : "Hermes chats"}
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Refresh ${section}`}
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
                  ? grouped.tasks.map((task) => (
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
                        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {task.job?.scheduleDisplay ?? "Past task"} · {task.runs.length} runs
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
                          {sessionTitle(session)}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {session.messageCount} messages
                          {session.lastActive ? (
                            <>· {formatRelativeTimeLabel(session.lastActive)}</>
                          ) : null}
                        </span>
                      </button>
                    ))}
                {!sessions.isPending &&
                (section === "tasks" ? grouped.tasks.length === 0 : grouped.chats.length === 0) ? (
                  <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {section === "tasks" ? "No scheduled task runs yet." : "No Hermes chats yet."}
                  </div>
                ) : null}
              </div>
            </aside>

            <main className="flex min-h-0 min-w-0 flex-col">
              {section === "tasks" && selectedTask ? (
                <>
                  <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
                    <select
                      className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none md:hidden"
                      value={selectedTaskId ?? ""}
                      onChange={(event) => setSelectedTaskId(event.target.value)}
                      aria-label="Scheduled task"
                    >
                      {grouped.tasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.name}
                        </option>
                      ))}
                    </select>
                    <div className="hidden min-w-0 flex-1 md:block">
                      <div className="truncate text-sm font-medium">{selectedTask.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {selectedTask.job?.scheduleDisplay ?? "Archived task"} ·{" "}
                        {taskRuns.data?.total ?? selectedTask.runs.length} runs
                      </div>
                    </div>
                    {selectedTask.job ? (
                      <div className="hidden items-center gap-2 text-xs sm:flex">
                        <Badge variant={selectedTask.job.enabled ? "success" : "outline"}>
                          {selectedTask.job.enabled ? (
                            <CheckCircle2Icon className="size-3" />
                          ) : null}
                          {selectedTask.job.state}
                        </Badge>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <CalendarClockIcon className="size-3.5" />
                          {selectedTask.job.scheduleDisplay ?? "No schedule"}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div
                    ref={taskScrollRef}
                    className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
                  >
                    <div className="mx-auto max-w-3xl space-y-4">
                      {visibleTaskRunSnapshot === null ? (
                        taskRuns.error ? (
                          <div className="mx-auto mt-12 max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
                            <h2 className="text-sm font-semibold">Couldn’t load task results</h2>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                              {taskRuns.error}
                            </p>
                            <Button
                              className="mt-4"
                              size="sm"
                              variant="outline"
                              onClick={taskRuns.refresh}
                            >
                              <RefreshCwIcon className="size-3.5" /> Retry
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                            <LoaderCircleIcon className="size-4 animate-spin" />
                            Loading task results…
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
                              setTaskRunLimit((limit) => limit + 20);
                            }}
                          >
                            {taskRuns.isPending ? (
                              <LoaderCircleIcon className="animate-spin" />
                            ) : null}
                            Load older results
                          </Button>
                        </div>
                      ) : visibleTaskRunSnapshot?.runs.length ? (
                        <p className="pb-2 text-center text-xs text-muted-foreground">
                          Beginning of history · all {visibleTaskRunSnapshot.total} results loaded
                        </p>
                      ) : null}
                      {!taskRuns.isPending && visibleTaskRunSnapshot?.runs.length === 0 ? (
                        <div className="py-16 text-center">
                          <ListTodoIcon className="mx-auto size-8 text-muted-foreground" />
                          <h2 className="mt-4 font-semibold">No results yet</h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Hermes’ response will appear here after the first run.
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
                          Next run {formatRelativeTimeLabel(selectedTask.job.nextRunAt)}
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
                      aria-label="Hermes chat"
                    >
                      {visibleSessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {sessionTitle(session)}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Rename chat"
                      onClick={() => void handleRename()}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Fork chat"
                      onClick={() => void handleFork()}
                    >
                      <CopyPlusIcon />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Delete chat"
                      onClick={() => void handleDelete()}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                    <div className="space-y-6">
                      {messages.isPending && messages.data === null ? (
                        <LoaderCircleIcon className="mx-auto mt-12 size-5 animate-spin text-muted-foreground" />
                      ) : null}
                      {messages.data?.messages.map((message) => (
                        <HermesMessageView key={message.id} message={message} />
                      ))}
                      {sending ? (
                        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-1 text-sm text-muted-foreground">
                          <LoaderCircleIcon className="size-4 animate-spin" /> Hermes is working on
                          the task…
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <form
                    onSubmit={onSubmit}
                    className="shrink-0 border-t border-border bg-background p-3 sm:px-6 sm:py-4"
                  >
                    <div className="mx-auto max-w-3xl">
                      <div className="relative">
                        <Textarea
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onKeyDown={onComposerKeyDown}
                          disabled={sending}
                          placeholder="Ask Hermes to chat, research, or do a task…"
                          className="pr-12"
                          aria-label="Message Hermes"
                        />
                        <Button
                          type="submit"
                          size="icon-sm"
                          className="absolute bottom-2 right-2"
                          disabled={sending || !draft.trim()}
                          aria-label="Send to Hermes"
                        >
                          {sending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
                        </Button>
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Enter to send · Shift+Enter for a new line · Hermes uses its configured
                        tools, skills, memory, and model
                      </p>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-6 text-center">
                  <div>
                    <MessageSquarePlusIcon className="mx-auto size-8 text-muted-foreground" />
                    <h2 className="mt-4 font-semibold">
                      {section === "tasks"
                        ? "No scheduled tasks yet"
                        : "Start a Hermes conversation"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {section === "tasks"
                        ? "Recurring Hermes jobs will appear here with their result history."
                        : "Chat, run tasks, and use the same agent capabilities you use from Discord."}
                    </p>
                    {section === "chats" ? (
                      <Button className="mt-4" size="sm" onClick={() => void handleCreate()}>
                        <PlusIcon /> New chat
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </main>
          </div>
        )}
      </div>
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
  component: AgentsRouteView,
});
