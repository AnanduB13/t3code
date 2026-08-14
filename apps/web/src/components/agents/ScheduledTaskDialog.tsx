import { CalendarClockIcon, SparklesIcon } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { HermesCronJob } from "@t3tools/contracts";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  buildCronSchedule,
  DEFAULT_SCHEDULE_DRAFT,
  parseCronSchedule,
  type ScheduledTaskFrequency,
  type ScheduledTaskScheduleDraft,
} from "./scheduledTaskSchedule";

interface ScheduledProjectOption {
  readonly title: string;
  readonly workspaceRoot: string;
}

export interface ScheduledTaskInput {
  readonly name: string;
  readonly prompt: string;
  readonly schedule: string;
  readonly workdir?: string;
}

const SUGGESTIONS = [
  {
    title: "Daily project health",
    prompt:
      "Review the project’s current state. Summarize important failures, stale work, and the three most useful next actions. Do not change files unless explicitly necessary.",
    frequency: "daily" as const,
  },
  {
    title: "Morning standup",
    prompt:
      "Create a concise standup from recent project activity: what changed, what is in progress, blockers, and what should happen next.",
    frequency: "daily" as const,
  },
  {
    title: "Weekly dependency review",
    prompt:
      "Review dependencies and tooling for meaningful updates or security concerns. Prioritize actionable changes and explain risk before suggesting upgrades.",
    frequency: "weekly" as const,
  },
  {
    title: "Monthly maintenance plan",
    prompt:
      "Inspect the project for accumulated maintenance work. Produce a prioritized, scoped plan covering reliability, performance, tests, and documentation.",
    frequency: "monthly" as const,
  },
];

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/24";

export function ScheduledTaskDialog({
  open,
  onOpenChange,
  job,
  projects,
  timezone,
  saving,
  onSave,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly job: HermesCronJob | null;
  readonly projects: readonly ScheduledProjectOption[];
  readonly timezone: string;
  readonly saving: boolean;
  readonly onSave: (input: ScheduledTaskInput) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [workdir, setWorkdir] = useState("");
  const [schedule, setSchedule] = useState<ScheduledTaskScheduleDraft>(DEFAULT_SCHEDULE_DRAFT);

  useEffect(() => {
    if (!open) return;
    setName(job?.name ?? "");
    setPrompt(job?.prompt ?? "");
    setWorkdir(job?.workdir ?? "");
    setSchedule(parseCronSchedule(job?.schedule ?? job?.scheduleDisplay ?? null));
  }, [job, open]);

  const cron = useMemo(() => buildCronSchedule(schedule), [schedule]);
  const canSave = name.trim().length > 0 && prompt.trim().length > 0 && cron.length > 0;
  const patchSchedule = (patch: Partial<ScheduledTaskScheduleDraft>) =>
    setSchedule((current) => ({ ...current, ...patch }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || saving) return;
    const saved = await onSave({
      name: name.trim(),
      prompt: prompt.trim(),
      schedule: cron,
      ...(workdir ? { workdir } : {}),
    });
    if (saved) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogPopup className="max-w-2xl">
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClockIcon className="size-5" />
              {job ? "Edit scheduled task" : "New scheduled task"}
            </DialogTitle>
            <DialogDescription>
              Hermes runs this task unattended and adds a new result in Agents after every run.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-5">
            {!job ? (
              <section>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <SparklesIcon className="size-3.5" /> Start from a suggestion
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion.title}
                      type="button"
                      className="rounded-lg border border-border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/60"
                      onClick={() => {
                        setName(suggestion.title);
                        setPrompt(suggestion.prompt);
                        patchSchedule({ frequency: suggestion.frequency });
                      }}
                    >
                      <span className="block text-sm font-medium">{suggestion.title}</span>
                      <span className="mt-1 block text-xs capitalize text-muted-foreground">
                        {suggestion.frequency}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <Label className="grid gap-1.5">
              <span>Title</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </Label>
            <Label className="grid gap-1.5">
              <span>What should the agent do?</span>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={6}
                placeholder="Describe the outcome, sources to check, constraints, and the format you want…"
              />
            </Label>

            <div className="grid gap-4 sm:grid-cols-2">
              <Label className="grid gap-1.5">
                <span>Frequency</span>
                <select
                  className={selectClassName}
                  value={schedule.frequency}
                  onChange={(event) =>
                    patchSchedule({ frequency: event.target.value as ScheduledTaskFrequency })
                  }
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom schedule</option>
                </select>
              </Label>
              {schedule.frequency === "custom" ? (
                <Label className="grid gap-1.5">
                  <span>Schedule</span>
                  <Input
                    value={schedule.custom}
                    onChange={(event) => patchSchedule({ custom: event.target.value })}
                    placeholder="0 9 * * * or every 2h"
                  />
                </Label>
              ) : (
                <Label className="grid gap-1.5">
                  <span>Time</span>
                  <Input
                    nativeInput
                    type="time"
                    value={schedule.time}
                    onChange={(event) => patchSchedule({ time: event.target.value })}
                  />
                </Label>
              )}
              {schedule.frequency === "weekly" ? (
                <Label className="grid gap-1.5">
                  <span>Day of week</span>
                  <select
                    className={selectClassName}
                    value={schedule.weekday}
                    onChange={(event) => patchSchedule({ weekday: event.target.value })}
                  >
                    {[
                      ["1", "Monday"],
                      ["2", "Tuesday"],
                      ["3", "Wednesday"],
                      ["4", "Thursday"],
                      ["5", "Friday"],
                      ["6", "Saturday"],
                      ["0", "Sunday"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Label>
              ) : null}
              {schedule.frequency === "monthly" ? (
                <Label className="grid gap-1.5">
                  <span>Day of month</span>
                  <select
                    className={selectClassName}
                    value={schedule.monthday}
                    onChange={(event) => patchSchedule({ monthday: event.target.value })}
                  >
                    {Array.from({ length: 31 }, (_, index) => String(index + 1)).map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </Label>
              ) : null}
            </div>

            <Label className="grid gap-1.5">
              <span>Run in</span>
              <select
                className={selectClassName}
                value={workdir}
                onChange={(event) => setWorkdir(event.target.value)}
              >
                <option value="">Agent workspace (no project context)</option>
                {job?.workdir &&
                !projects.some((project) => project.workspaceRoot === job.workdir) ? (
                  <option value={job.workdir}>{job.workdir}</option>
                ) : null}
                {projects.map((project) => (
                  <option key={project.workspaceRoot} value={project.workspaceRoot}>
                    {project.title} — {project.workspaceRoot}
                  </option>
                ))}
              </select>
            </Label>
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Runs use the server’s <strong className="text-foreground">{timezone}</strong>{" "}
              timezone. The server and Hermes gateway must be running at the scheduled time.
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || saving}>
              {saving ? "Saving…" : job ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
