import { msg, T, useGT, useMessages, Var } from "gt-react";
import { CalendarClockIcon, LightbulbIcon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

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
    title: msg("Daily project health"),
    prompt:
      "Review the project’s current state. Summarize important failures, stale work, and the three most useful next actions. Do not change files unless explicitly necessary.",
    frequency: "daily" as const,
  },
  {
    title: msg("Morning standup"),
    prompt:
      "Create a concise standup from recent project activity: what changed, what is in progress, blockers, and what should happen next.",
    frequency: "daily" as const,
  },
  {
    title: msg("Weekly dependency review"),
    prompt:
      "Review dependencies and tooling for meaningful updates or security concerns. Prioritize actionable changes and explain risk before suggesting upgrades.",
    frequency: "weekly" as const,
  },
  {
    title: msg("Monthly maintenance plan"),
    prompt:
      "Inspect the project for accumulated maintenance work. Produce a prioritized, scoped plan covering reliability, performance, tests, and documentation.",
    frequency: "monthly" as const,
  },
];

const FREQUENCY_LABELS = {
  daily: msg("Daily", { $context: "how often a scheduled task repeats" }),
  weekly: msg("Weekly", { $context: "how often a scheduled task repeats" }),
  monthly: msg("Monthly", { $context: "how often a scheduled task repeats" }),
  custom: msg("Custom schedule"),
} satisfies Record<ScheduledTaskFrequency, string>;

const WEEKDAYS = [
  ["1", msg("Monday")],
  ["2", msg("Tuesday")],
  ["3", msg("Wednesday")],
  ["4", msg("Thursday")],
  ["5", msg("Friday")],
  ["6", msg("Saturday")],
  ["0", msg("Sunday")],
] as const;

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/24 focus:ring-inset";

interface ScheduledTaskDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly job: HermesCronJob | null;
  readonly deviceLabel: string;
  readonly projects: readonly ScheduledProjectOption[];
  readonly timezone: string;
  readonly saving: boolean;
  readonly onSave: (input: ScheduledTaskInput) => Promise<boolean>;
}

export function ScheduledTaskDialog(props: ScheduledTaskDialogProps) {
  const { open, onOpenChange, saving } = props;
  // Each opening starts a fresh form from `job`; the popup keeps its content while it animates closed.
  const [openCount, setOpenCount] = useState(open ? 1 : 0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogPopup className="max-w-2xl">
        <ScheduledTaskForm key={openCount} {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function ScheduledTaskForm({
  onOpenChange,
  job,
  deviceLabel,
  projects,
  timezone,
  saving,
  onSave,
}: ScheduledTaskDialogProps) {
  const gt = useGT();
  const m = useMessages();
  const id = useId();
  const [name, setName] = useState(job?.name ?? "");
  const [prompt, setPrompt] = useState(job?.prompt ?? "");
  const [workdir, setWorkdir] = useState(job?.workdir ?? "");
  const [schedule, setSchedule] = useState<ScheduledTaskScheduleDraft>(() =>
    parseCronSchedule(job?.schedule ?? job?.scheduleDisplay ?? null),
  );

  const cron = buildCronSchedule(schedule);
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
    <form onSubmit={(event) => void submit(event)}>
      <DialogHeader>
        <DialogTitle>
          <span className="flex items-center gap-2">
            <CalendarClockIcon className="size-5" />
            {job ? <T>Edit scheduled task</T> : <T>New scheduled task</T>}
          </span>
        </DialogTitle>
        <DialogDescription>
          <T>
            Runs unattended on <Var>{deviceLabel}</Var> and adds a new result after every run.
          </T>
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="space-y-5">
          {!job ? (
            <section>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <LightbulbIcon className="size-3.5" /> <T>Start from a suggestion</T>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.title}
                    type="button"
                    className="rounded-lg border border-border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/60"
                    onClick={() => {
                      setName(m(suggestion.title));
                      setPrompt(suggestion.prompt);
                      patchSchedule({ frequency: suggestion.frequency });
                    }}
                  >
                    <span className="block text-sm font-medium">{m(suggestion.title)}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {m(FREQUENCY_LABELS[suggestion.frequency])}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>
              <T>Title</T>
            </Label>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-prompt`}>
              <T>What should the agent do?</T>
            </Label>
            <Textarea
              id={`${id}-prompt`}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={6}
              placeholder={gt(
                "Describe the outcome, sources to check, constraints, and the format you want…",
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-frequency`}>
                <T>Frequency</T>
              </Label>
              <select
                id={`${id}-frequency`}
                className={selectClassName}
                value={schedule.frequency}
                onChange={(event) =>
                  patchSchedule({ frequency: event.target.value as ScheduledTaskFrequency })
                }
              >
                {(["daily", "weekly", "monthly", "custom"] as const).map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {m(FREQUENCY_LABELS[frequency])}
                  </option>
                ))}
              </select>
            </div>
            {schedule.frequency === "custom" ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-schedule`}>
                  <T>Schedule</T>
                </Label>
                <Input
                  id={`${id}-schedule`}
                  value={schedule.custom}
                  onChange={(event) => patchSchedule({ custom: event.target.value })}
                  placeholder={gt("{cron} or {interval}", {
                    cron: "0 9 * * *",
                    interval: "every 2h",
                  })}
                />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-time`}>
                  <T context="time of day">Time</T>
                </Label>
                <Input
                  id={`${id}-time`}
                  nativeInput
                  type="time"
                  value={schedule.time}
                  onChange={(event) => patchSchedule({ time: event.target.value })}
                />
              </div>
            )}
            {schedule.frequency === "weekly" ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-weekday`}>
                  <T>Day of week</T>
                </Label>
                <select
                  id={`${id}-weekday`}
                  className={selectClassName}
                  value={schedule.weekday}
                  onChange={(event) => patchSchedule({ weekday: event.target.value })}
                >
                  {WEEKDAYS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {m(label)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {schedule.frequency === "monthly" ? (
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-monthday`}>
                  <T>Day of month</T>
                </Label>
                <select
                  id={`${id}-monthday`}
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
              </div>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-workdir`}>
              <T>Run in</T>
            </Label>
            <select
              id={`${id}-workdir`}
              className={selectClassName}
              value={workdir}
              onChange={(event) => setWorkdir(event.target.value)}
            >
              <option value="">{gt("Agent workspace (no project context)")}</option>
              {job?.workdir &&
              !projects.some((project) => project.workspaceRoot === job.workdir) ? (
                <option value={job.workdir}>{job.workdir}</option>
              ) : null}
              {projects.map((project) => (
                <option key={project.workspaceRoot} value={project.workspaceRoot}>
                  {`${project.title} (${project.workspaceRoot})`}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
            <T>
              Runs use the server’s{" "}
              <strong className="text-foreground">
                <Var>{timezone}</Var>
              </strong>{" "}
              timezone. The server and scheduled task runner must be running at the scheduled time.
            </T>
          </div>
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => onOpenChange(false)}
        >
          <T>Cancel</T>
        </Button>
        <Button type="submit" disabled={!canSave || saving}>
          {saving ? <T>Saving…</T> : job ? <T>Save changes</T> : <T>Create task</T>}
        </Button>
      </DialogFooter>
    </form>
  );
}
