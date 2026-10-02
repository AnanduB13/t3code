import * as Schema from "effect/Schema";
import { IsoDateTime, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ModelSelection, RuntimeMode } from "./orchestration.ts";

export const ScheduledJobInput = Schema.Struct({
  name: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  projectId: ProjectId,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  schedule: TrimmedNonEmptyString,
  timezone: TrimmedNonEmptyString,
});
export type ScheduledJobInput = typeof ScheduledJobInput.Type;

export const ScheduledJob = Schema.Struct({
  ...ScheduledJobInput.fields,
  id: TrimmedNonEmptyString,
  enabled: Schema.Boolean,
  nextRunAt: IsoDateTime,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ScheduledJob = typeof ScheduledJob.Type;

export const ScheduledJobRun = Schema.Struct({
  id: TrimmedNonEmptyString,
  jobId: TrimmedNonEmptyString,
  threadId: ThreadId,
  createdAt: IsoDateTime,
  state: Schema.Literals(["pending", "started", "running", "completed", "interrupted", "failed"]),
  message: Schema.NullOr(Schema.String),
});
export type ScheduledJobRun = typeof ScheduledJobRun.Type;

export const ScheduledJobsSnapshot = Schema.Struct({
  jobs: Schema.Array(ScheduledJob),
  runs: Schema.Array(ScheduledJobRun),
});
export type ScheduledJobsSnapshot = typeof ScheduledJobsSnapshot.Type;

export class ScheduledJobError extends Schema.TaggedError<ScheduledJobError>()(
  "ScheduledJobError",
  {
    message: Schema.String,
  },
) {}
