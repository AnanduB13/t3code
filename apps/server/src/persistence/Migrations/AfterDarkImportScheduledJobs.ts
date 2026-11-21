import {
  IsoDateTime,
  ModelSelection,
  RuntimeMode,
  ScheduledTaskSchedule,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

/** The JSON After Dark's retired scheduled jobs stored in `scheduled_jobs.data`. */
const LegacyScheduledJob = Schema.fromJsonString(
  Schema.Struct({
    id: TrimmedNonEmptyString,
    name: TrimmedNonEmptyString,
    prompt: TrimmedNonEmptyString,
    projectId: TrimmedNonEmptyString,
    modelSelection: ModelSelection,
    runtimeMode: RuntimeMode,
    schedule: TrimmedNonEmptyString,
    timezone: TrimmedNonEmptyString,
    enabled: Schema.Boolean,
    nextRunAt: IsoDateTime,
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  }),
);
const decodeLegacyJob = Schema.decodeUnknownResult(LegacyScheduledJob);
const encodeSchedule = Schema.encodeEffect(Schema.fromJsonString(ScheduledTaskSchedule));
const encodeModelSelection = Schema.encodeEffect(Schema.fromJsonString(ModelSelection));

const INTERVAL_UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

/** `every 2h` became an interval; anything else was a five-field cron in the job's zone. */
export function legacyJobSchedule(schedule: string, timeZone: string): ScheduledTaskSchedule {
  const interval = /^every\s+(\d+)\s*(m|h|d)$/i.exec(schedule.trim());
  if (interval) {
    const unitMs = INTERVAL_UNIT_MS[interval[2]!.toLowerCase()]!;
    return { type: "interval", everyMs: Number(interval[1]) * unitMs };
  }
  return { type: "cron", expression: schedule.trim().split(/\s+/).join(" "), timeZone };
}

/**
 * Copies After Dark scheduled jobs into upstream scheduled tasks. Jobs launched a new
 * thread at the project root per run, so the tasks do the same. The old tables stay.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql<{ readonly name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'scheduled_jobs'
  `;
  if (tables.length === 0) return;
  const rows = yield* sql<{ readonly id: string; readonly data: string }>`
    SELECT id, data FROM scheduled_jobs ORDER BY id
  `;
  for (const row of rows) {
    const decoded = decodeLegacyJob(row.data);
    if (Result.isFailure(decoded)) {
      yield* Effect.logWarning("Skipped an unreadable After Dark scheduled job", { id: row.id });
      continue;
    }
    const job = decoded.success;
    const encoded = yield* Effect.result(
      Effect.all({
        schedule: encodeSchedule(legacyJobSchedule(job.schedule, job.timezone)),
        modelSelection: encodeModelSelection(job.modelSelection),
      }),
    );
    if (Result.isFailure(encoded)) {
      yield* Effect.logWarning("Skipped an unreadable After Dark scheduled job", { id: row.id });
      continue;
    }
    // Stored runs are pending, started, or failed; a pending run never launched.
    const [summary] = yield* sql<{
      readonly runCount: number;
      readonly lastRunAt: string | null;
      readonly lastState: string | null;
      readonly lastMessage: string | null;
    }>`
      SELECT
        COUNT(*) AS "runCount",
        MAX(created_at) AS "lastRunAt",
        (SELECT json_extract(data, '$.state') FROM scheduled_job_runs
          WHERE job_id = ${row.id} AND json_extract(data, '$.state') <> 'pending'
          ORDER BY created_at DESC, id DESC LIMIT 1) AS "lastState",
        (SELECT json_extract(data, '$.message') FROM scheduled_job_runs
          WHERE job_id = ${row.id} AND json_extract(data, '$.state') <> 'pending'
          ORDER BY created_at DESC, id DESC LIMIT 1) AS "lastMessage"
      FROM scheduled_job_runs
      WHERE job_id = ${row.id} AND json_extract(data, '$.state') <> 'pending'
    `;
    const lastRunStatus =
      summary?.lastState === "failed"
        ? "failed"
        : summary?.lastState == null
          ? "never"
          : "succeeded";
    yield* sql`
      INSERT OR IGNORE INTO scheduled_tasks (
        task_id, title, prompt, enabled, schedule_json, project_id, thread_id, thread_mode,
        workspace_strategy_json, model_selection_json, runtime_mode, interaction_mode,
        created_by, creation_source, created_at, updated_at, next_run_at,
        last_run_at, last_run_status, last_run_error, run_count
      ) VALUES (
        ${`scheduled-task:after-dark-job-${job.id}`},
        ${job.name},
        ${job.prompt},
        ${job.enabled ? 1 : 0},
        ${encoded.success.schedule},
        ${job.projectId},
        NULL,
        'new_thread',
        '{"type":"root"}',
        ${encoded.success.modelSelection},
        ${job.runtimeMode},
        'default',
        'user',
        'web',
        ${job.createdAt},
        ${job.updatedAt},
        ${job.enabled ? job.nextRunAt : null},
        ${summary?.lastRunAt ?? null},
        ${lastRunStatus},
        ${lastRunStatus === "failed" ? (summary?.lastMessage ?? "The run failed.") : null},
        ${summary?.runCount ?? 0}
      )
    `;
  }
});
