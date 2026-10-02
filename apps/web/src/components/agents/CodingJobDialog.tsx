import { useState, type FormEvent } from "react";
import type {
  ModelSelection,
  ProjectId,
  RuntimeMode,
  ScheduledJob,
  ScheduledJobInput,
  ServerProvider,
} from "@t3tools/contracts";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  buildCronSchedule,
  parseCronSchedule,
  type ScheduledTaskScheduleDraft,
} from "./scheduledTaskSchedule";

const selectClassName = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";
interface ProjectOption {
  readonly id: ProjectId;
  readonly title: string;
  readonly defaultModelSelection: ModelSelection | null;
}

export function CodingJobDialog({
  job,
  deviceLabel,
  projects,
  providers,
  saving,
  error,
  onClose,
  onSave,
}: {
  readonly job: ScheduledJob | null;
  readonly deviceLabel: string;
  readonly projects: readonly ProjectOption[];
  readonly providers: readonly ServerProvider[];
  readonly saving: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSave: (input: ScheduledJobInput) => Promise<boolean>;
}) {
  const models = providers
    .filter(
      (provider) =>
        provider.enabled && provider.installed && provider.availability !== "unavailable",
    )
    .flatMap((provider) =>
      provider.models.map((model) => ({
        key: `${provider.instanceId}:${model.slug}`,
        label: `${provider.displayName ?? provider.driver} · ${model.name}`,
        selection: { instanceId: provider.instanceId, model: model.slug },
      })),
    );
  const [name, setName] = useState(job?.name ?? "");
  const [prompt, setPrompt] = useState(job?.prompt ?? "");
  const [projectId, setProjectId] = useState(job?.projectId ?? projects[0]?.id ?? null);
  const [selection, setSelection] = useState<ModelSelection | null>(
    job?.modelSelection ?? projects[0]?.defaultModelSelection ?? models[0]?.selection ?? null,
  );
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(
    job?.runtimeMode ?? "approval-required",
  );
  const [timezone, setTimezone] = useState(
    job?.timezone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [schedule, setSchedule] = useState(parseCronSchedule(job?.schedule ?? null));
  const patchSchedule = (patch: Partial<ScheduledTaskScheduleDraft>) =>
    setSchedule((previous) => ({ ...previous, ...patch }));
  const cron = buildCronSchedule(schedule);
  const selectedModelKey = selection ? `${selection.instanceId}:${selection.model}` : "";
  const validModel = models.some((model) => model.key === selectedModelKey);
  const canSave =
    name.trim() &&
    prompt.trim() &&
    cron &&
    timezone.trim() &&
    projects.some((project) => project.id === projectId) &&
    validModel;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave || !projectId || !selection || saving) return;
    if (
      await onSave({
        name: name.trim(),
        prompt: prompt.trim(),
        projectId,
        modelSelection: selection,
        runtimeMode,
        schedule: cron,
        timezone: timezone.trim(),
      })
    )
      onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogPopup>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{job ? "Edit scheduled task" : "New scheduled task"}</DialogTitle>
            <DialogDescription>
              Runs a coding agent on {deviceLabel}. Each run creates a new project thread.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {error ? (
              <p role="alert" className="mb-4 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <fieldset disabled={saving} className="space-y-4">
              <label className="grid gap-1.5 text-sm">
                Title
                <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
              </label>
              <label className="grid gap-1.5 text-sm">
                Instructions
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={5}
                  placeholder="Describe what to do and what result you want…"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                Project
                <select
                  className={selectClassName}
                  value={projectId ?? ""}
                  onChange={(event) =>
                    setProjectId(
                      projects.find((project) => project.id === event.target.value)?.id ?? null,
                    )
                  }
                >
                  {!projects.some((project) => project.id === projectId) ? (
                    <option value={projectId ?? ""}>Choose a project</option>
                  ) : null}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add a project on this computer before scheduling work.
                </p>
              ) : null}
              <label className="grid gap-1.5 text-sm">
                Agent and model
                <select
                  className={selectClassName}
                  value={selectedModelKey}
                  onChange={(event) =>
                    setSelection(
                      models.find((model) => model.key === event.target.value)?.selection ?? null,
                    )
                  }
                >
                  {!validModel ? (
                    <option value={selectedModelKey}>
                      {selection ? `${selection.model} (unavailable)` : "Choose an agent"}
                    </option>
                  ) : null}
                  {models.map((model) => (
                    <option key={model.key} value={model.key}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
              {models.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Set up a coding agent in this computer’s Provider settings first.
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  Frequency
                  <select
                    className={selectClassName}
                    value={schedule.frequency}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (
                        value === "daily" ||
                        value === "weekly" ||
                        value === "monthly" ||
                        value === "custom"
                      )
                        patchSchedule({ frequency: value });
                    }}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                {schedule.frequency === "custom" ? (
                  <label className="grid gap-1.5 text-sm">
                    Schedule
                    <Input
                      value={schedule.custom}
                      onChange={(event) => patchSchedule({ custom: event.target.value })}
                      placeholder="0 9 * * * or every 2h"
                    />
                  </label>
                ) : (
                  <label className="grid gap-1.5 text-sm">
                    Time
                    <Input
                      nativeInput
                      type="time"
                      value={schedule.time}
                      onChange={(event) => patchSchedule({ time: event.target.value })}
                    />
                  </label>
                )}
                {schedule.frequency === "weekly" ? (
                  <label className="grid gap-1.5 text-sm">
                    Day
                    <select
                      className={selectClassName}
                      value={schedule.weekday}
                      onChange={(event) => patchSchedule({ weekday: event.target.value })}
                    >
                      {[
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ].map((day, index) => (
                        <option key={day} value={String(index)}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {schedule.frequency === "monthly" ? (
                  <label className="grid gap-1.5 text-sm">
                    Day of month
                    <Input
                      nativeInput
                      type="number"
                      min={1}
                      max={31}
                      value={schedule.monthday}
                      onChange={(event) => patchSchedule({ monthday: event.target.value })}
                    />
                  </label>
                ) : null}
                <label className="grid gap-1.5 text-sm">
                  Timezone
                  <Input
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    placeholder="Asia/Kolkata"
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm">
                Permissions
                <select
                  className={selectClassName}
                  value={runtimeMode}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (
                      value === "approval-required" ||
                      value === "auto-accept-edits" ||
                      value === "full-access"
                    )
                      setRuntimeMode(value);
                  }}
                >
                  <option value="approval-required">Ask for approval</option>
                  <option value="auto-accept-edits">Accept edits</option>
                  <option value="full-access">Full access</option>
                  {runtimeMode === "auto" ? <option value="auto">Auto</option> : null}
                </select>
              </label>
              <p className="text-xs leading-5 text-muted-foreground">
                The computer and T3 server must be running. Approval requests appear in the run’s
                thread and can pause its work. Overlapping runs of the same task are skipped.
              </p>
            </fieldset>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
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
