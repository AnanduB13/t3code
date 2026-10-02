import { Link } from "@tanstack/react-router";
import { CalendarClockIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import type { EnvironmentId, ScheduledJob, ScheduledJobInput } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { scheduledJobsEnvironment } from "../../state/scheduledJobs";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useProjects, useServerConfigs } from "../../state/entities";
import { cn } from "../../lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../workspaceTitlebar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { CodingJobDialog } from "./CodingJobDialog";
import { useAgentEnvironment } from "./useAgentEnvironment";
import { useAgentsSidebarStore } from "./agentsSidebarStore";

function atomCommandFailureMessage(
  result: Parameters<typeof squashAtomCommandFailure>[0],
  fallback: string,
) {
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : fallback;
}

function ScheduledComputer({ environmentId }: { readonly environmentId: EnvironmentId | null }) {
  const { environment, environments } = useAgentEnvironment();
  const setEnvironmentId = useAgentsSidebarStore((state) => state.setEnvironmentId);
  const connected = environment?.connection.phase === "connected";
  const query = useEnvironmentQuery(
    connected && environmentId ? scheduledJobsEnvironment.list({ environmentId, input: {} }) : null,
  );
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const configs = useServerConfigs();
  const config = environmentId ? configs.get(environmentId) : undefined;
  const save = useAtomCommand(scheduledJobsEnvironment.save);
  const setEnabled = useAtomCommand(scheduledJobsEnvironment.setEnabled);
  const remove = useAtomCommand(scheduledJobsEnvironment.remove);
  const run = useAtomCommand(scheduledJobsEnvironment.run);
  const [editor, setEditor] = useState<{ job: ScheduledJob | null } | null>(null);
  const [deleting, setDeleting] = useState<ScheduledJob | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaused, setShowPaused] = useState(true);
  const onSave = async (job: ScheduledJobInput) => {
    if (!environmentId || !connected) {
      setError("Reconnect this computer before saving its task.");
      return false;
    }
    if (pending) return false;
    setPending(true);
    setError(null);
    const result = await save({
      environmentId,
      input: { job, ...(editor?.job ? { id: editor.job.id } : {}) },
    });
    setPending(false);
    if (result._tag !== "Success") {
      setError(atomCommandFailureMessage(result, "Could not save the scheduled task."));
      return false;
    }
    query.refresh();
    return true;
  };
  const mutate = async (job: ScheduledJob, action: "toggle" | "run" | "delete") => {
    if (!environmentId || !connected || pending) return;
    setPending(true);
    setError(null);
    const result =
      action === "toggle"
        ? await setEnabled({ environmentId, input: { id: job.id, enabled: !job.enabled } })
        : action === "run"
          ? await run({ environmentId, input: { id: job.id } })
          : await remove({ environmentId, input: { id: job.id } });
    setPending(false);
    if (result._tag !== "Success")
      setError(atomCommandFailureMessage(result, "Could not update the scheduled task."));
    else {
      setDeleting(null);
      query.refresh();
    }
  };
  const jobs = query.data?.jobs.filter((job) => showPaused || job.enabled) ?? [];
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden">
      <header
        className={cn(
          "flex min-h-12 shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-2 sm:px-5",
          COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        )}
      >
        <CalendarClockIcon className="size-4" />
        <h1 className="text-sm font-semibold">Scheduled</h1>
        <select
          aria-label="Computer for scheduled tasks"
          className="h-8 min-w-0 max-w-48 rounded-md border bg-background px-2 text-sm"
          value={environmentId ?? ""}
          disabled={pending || editor !== null || deleting !== null}
          onChange={(event) => {
            const target = environments.find((entry) => entry.environmentId === event.target.value);
            if (target) setEnvironmentId(target.environmentId);
          }}
        >
          {!environment ? <option value={environmentId ?? ""}>Choose a computer</option> : null}
          {environments.map((entry) => (
            <option key={entry.environmentId} value={entry.environmentId}>
              {entry.label}
              {entry.connection.phase === "connected" ? "" : " (disconnected)"}
            </option>
          ))}
        </select>
        <div className="flex flex-1 justify-end gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh scheduled tasks"
            onClick={query.refresh}
            disabled={!connected || query.isPending}
          >
            <RefreshCwIcon />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!connected || !query.isSuccess || pending}
            onClick={() => setEditor({ job: null })}
          >
            <PlusIcon />
            New scheduled task
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Run your coding agents on a schedule. Results appear in regular project threads on{" "}
            {environment?.label ?? "the selected computer"}.
          </p>
          {!connected ? (
            <p className="rounded-xl border p-5 text-sm text-muted-foreground">
              Connect this computer in{" "}
              <Link to="/settings/connections" className="underline">
                Settings → Connections
              </Link>{" "}
              to manage its scheduled tasks.
            </p>
          ) : query.error ? (
            <div role="alert" className="text-sm text-destructive">
              {query.error} Check that this computer’s T3 server is up to date, then refresh.
            </div>
          ) : !query.data ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading scheduled tasks…
            </p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showPaused}
                  onChange={(event) => setShowPaused(event.target.checked)}
                />
                Show paused tasks
              </label>
              {jobs.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <h2 className="text-base font-medium">
                    {showPaused ? "No scheduled tasks yet" : "No active scheduled tasks"}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Schedule a project review, daily summary, or another repeatable task.
                  </p>
                </div>
              ) : null}
              {jobs.map((job) => {
                const runs = query.data!.runs.filter((entry) => entry.jobId === job.id);
                const busy = runs.some(
                  (entry) =>
                    entry.state === "pending" ||
                    entry.state === "running" ||
                    entry.state === "started",
                );
                return (
                  <article key={job.id} className="rounded-xl border border-border bg-card p-4">
                    <header className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 flex-1 text-sm font-semibold">{job.name}</h2>
                      <Badge variant={job.enabled ? "success" : "outline"}>
                        {job.enabled ? "Active" : "Paused"}
                      </Badge>
                    </header>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{job.prompt}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {projects.find((project) => project.id === job.projectId)?.title ??
                        "Project unavailable"}{" "}
                      · {job.modelSelection.model} · {job.schedule} · {job.timezone}
                    </p>
                    {job.enabled ? (
                      <p className="text-xs leading-5 text-muted-foreground">
                        Next:{" "}
                        {new Date(job.nextRunAt).toLocaleString(undefined, {
                          timeZone: job.timezone,
                        })}{" "}
                        ({job.timezone})
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => setEditor({ job })}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => void mutate(job, "toggle")}
                      >
                        {job.enabled ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending || busy}
                        onClick={() => void mutate(job, "run")}
                      >
                        Run now
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setDeleting(job)}
                      >
                        Delete
                      </Button>
                    </div>
                    {runs.length > 0 && environmentId ? (
                      <details className="mt-4 border-t border-border pt-3">
                        <summary className="cursor-pointer text-sm">
                          Run history ({runs.length})
                        </summary>
                        <ul className="mt-2 space-y-2">
                          {runs.map((entry) => (
                            <li
                              key={entry.id}
                              className="flex flex-wrap items-center gap-2 text-xs"
                            >
                              <Link
                                to="/$environmentId/$threadId"
                                params={{ environmentId, threadId: entry.threadId }}
                                className="underline"
                              >
                                {new Date(entry.createdAt).toLocaleString()} · Open thread
                              </Link>
                              <span>{entry.state}</span>
                              {entry.message ? (
                                <p className="w-full text-destructive">{entry.message}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </article>
                );
              })}
            </>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      {editor ? (
        <CodingJobDialog
          key={editor.job?.id ?? "new"}
          job={editor.job}
          deviceLabel={environment?.label ?? "this computer"}
          projects={projects}
          providers={config?.providers ?? []}
          saving={pending}
          error={error}
          onClose={() => setEditor(null)}
          onSave={onSave}
        />
      ) : null}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleting(null);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Delete scheduled task?</DialogTitle>
            <DialogDescription>
              Delete “{deleting?.name}” and its schedule. Existing threads and any running work
              remain available.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <DialogPanel>
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            </DialogPanel>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (deleting) void mutate(deleting, "delete");
              }}
            >
              Delete task
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </SidebarInset>
  );
}

export function ScheduledJobsPage() {
  const { environmentId } = useAgentEnvironment();
  return <ScheduledComputer key={environmentId ?? "none"} environmentId={environmentId} />;
}
