import {
  CommandId,
  MessageId,
  ThreadId,
  ScheduledJob,
  ScheduledJobInput,
  ScheduledJobRun,
  ScheduledJobError,
  type ScheduledJobsSnapshot,
  type OrchestrationSessionStatus,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Cron from "effect/Cron";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { ProjectionTurnState } from "../persistence/Services/ProjectionTurns.ts";

/** Intervals are anchored at each dispatch; cron expressions use the job's explicit timezone. */
export function nextScheduledRun(schedule: string, timezone: string, after: string): string {
  // Validate even interval timezones so switching to a calendar schedule remains predictable.
  new Intl.DateTimeFormat("en", { timeZone: timezone }).resolvedOptions();
  const interval = /^every\s+(\d+)\s*(m|h|d)$/i.exec(schedule.trim());
  if (interval) {
    const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[interval[2]!.toLowerCase()];
    const duration = Number(interval[1]) * unit!;
    if (!Number.isSafeInteger(duration) || duration < 60_000 || duration > 366 * 86_400_000) {
      throw new Error("Use an interval between one minute and 366 days.");
    }
    return new Date(Date.parse(after) + duration).toISOString();
  }
  if (schedule.trim().split(/\s+/).length !== 5)
    throw new Error("Use a five-field cron schedule or an interval such as every 2h.");
  return Cron.next(Cron.parseUnsafe(schedule, timezone), new Date(after)).toISOString();
}

const StoredRun = Schema.Struct({ ...ScheduledJobRun.fields, job: ScheduledJob });
type StoredRun = typeof StoredRun.Type;
const decodeJob = Schema.decodeUnknownSync(Schema.fromJsonString(ScheduledJob));
const encodeJob = Schema.encodeSync(Schema.fromJsonString(ScheduledJob));
const decodeRun = Schema.decodeUnknownSync(Schema.fromJsonString(StoredRun));
const encodeRun = Schema.encodeSync(Schema.fromJsonString(StoredRun));
const failure = (error: unknown) =>
  new ScheduledJobError({
    message: error instanceof Error ? error.message : "The scheduled job operation failed.",
  });

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const engine = yield* OrchestrationEngineService;
  const queries = yield* ProjectionSnapshotQuery;
  const crypto = yield* Crypto.Crypto;
  const mutex = yield* Semaphore.make(1);
  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const next = (input: ScheduledJobInput, at: string) =>
    Effect.try({
      try: () => nextScheduledRun(input.schedule, input.timezone, at),
      catch: failure,
    });
  const readJobs = Effect.fn("ScheduledJobs.readJobs")(function* () {
    const rows = yield* sql<{ data: string }>`SELECT data FROM scheduled_jobs ORDER BY id`;
    return yield* Effect.try({ try: () => rows.map((row) => decodeJob(row.data)), catch: failure });
  });
  const readRuns = Effect.fn("ScheduledJobs.readRuns")(function* (jobId: string) {
    const rows = yield* sql<{
      data: string;
    }>`SELECT data FROM scheduled_job_runs WHERE job_id = ${jobId} ORDER BY created_at DESC, id DESC LIMIT 30`;
    return yield* Effect.try({ try: () => rows.map((row) => decodeRun(row.data)), catch: failure });
  });
  const getJob = Effect.fn("ScheduledJobs.getJob")(function* (id: string) {
    const rows = yield* sql<{ data: string }>`SELECT data FROM scheduled_jobs WHERE id = ${id}`;
    if (!rows[0])
      return yield* new ScheduledJobError({ message: "This scheduled job no longer exists." });
    return yield* Effect.try({ try: () => decodeJob(rows[0]!.data), catch: failure });
  });
  const saveJob = (job: ScheduledJob) =>
    sql`INSERT INTO scheduled_jobs (id, data) VALUES (${job.id}, ${encodeJob(job)}) ON CONFLICT(id) DO UPDATE SET data = excluded.data`.pipe(
      Effect.asVoid,
    );
  const saveRun = (run: StoredRun) =>
    sql`INSERT INTO scheduled_job_runs (id, job_id, created_at, data) VALUES (${run.id}, ${run.jobId}, ${run.createdAt}, ${encodeRun(run)}) ON CONFLICT(id) DO UPDATE SET data = excluded.data`.pipe(
      Effect.asVoid,
    );
  const validateProject = Effect.fn("ScheduledJobs.validateProject")(function* (
    input: ScheduledJobInput,
  ) {
    const project = yield* queries.getProjectShellById(input.projectId);
    if (Option.isNone(project))
      return yield* new ScheduledJobError({
        message: "Choose an existing project on this computer.",
      });
  });
  const runState = Effect.fn("ScheduledJobs.runState")(function* (
    run: StoredRun,
  ): Effect.fn.Return<ScheduledJobRun, SqlError> {
    const { job: _job, ...summary } = run;
    if (run.state !== "started") return summary;
    // Follow the scheduled prompt's turn, including archived threads. A later
    // conversation turn or a stopped idle session must not rewrite this run's result.
    const rows = yield* sql<{
      deletedAt: string | null;
      status: OrchestrationSessionStatus | null;
      message: string | null;
      state: ProjectionTurnState | null;
    }>`SELECT t.deleted_at AS "deletedAt", s.status, s.last_error AS message, r.state
       FROM projection_threads t
       LEFT JOIN projection_thread_sessions s ON s.thread_id = t.thread_id
       LEFT JOIN projection_turns r ON r.thread_id = t.thread_id
         AND r.pending_message_id = ${`scheduled-message-${run.id}`}
       WHERE t.thread_id = ${run.threadId}
       ORDER BY r.requested_at DESC LIMIT 1`;
    const row = rows[0];
    if (!row || row.deletedAt !== null)
      return { ...summary, state: "interrupted", message: "The run’s thread was removed." };
    if (row.state === "completed" || row.state === "interrupted")
      return { ...summary, state: row.state };
    if (row.state === "error" || row.status === "error")
      return { ...summary, state: "failed", message: row.message };
    if (row.status === "interrupted" || row.status === "stopped")
      return { ...summary, state: "interrupted" };
    return { ...summary, state: row.state ?? "started" };
  });
  const isBusy = Effect.fn("ScheduledJobs.isBusy")(function* (id: string) {
    for (const run of yield* readRuns(id)) {
      const state = (yield* runState(run)).state;
      if (state === "pending" || state === "running" || state === "started") return true;
    }
    return false;
  });
  // Persisted command IDs let a restart resume a pending launch without starting a second turn.
  const launch = Effect.fn("ScheduledJobs.launch")(function* (run: StoredRun) {
    const outcome = yield* Effect.gen(function* () {
      yield* validateProject(run.job);
      yield* engine.dispatch({
        type: "thread.create",
        commandId: CommandId.make(`scheduled-create-${run.id}`),
        threadId: run.threadId,
        projectId: run.job.projectId,
        title: run.job.name,
        modelSelection: run.job.modelSelection,
        runtimeMode: run.job.runtimeMode,
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt: run.createdAt,
      });
      yield* engine.dispatch({
        type: "thread.turn.start",
        commandId: CommandId.make(`scheduled-start-${run.id}`),
        threadId: run.threadId,
        modelSelection: run.job.modelSelection,
        runtimeMode: run.job.runtimeMode,
        interactionMode: "default",
        createdAt: run.createdAt,
        message: {
          messageId: MessageId.make(`scheduled-message-${run.id}`),
          role: "user",
          text: run.job.prompt,
          attachments: [],
        },
      });
    }).pipe(Effect.result);
    const updated: StoredRun =
      outcome._tag === "Success"
        ? { ...run, state: "started" }
        : { ...run, state: "failed", message: failure(outcome.failure).message };
    yield* saveRun(updated);
    return yield* runState(updated);
  });
  const enqueue = Effect.fn("ScheduledJobs.enqueue")(function* (job: ScheduledJob, at: string) {
    const id = yield* crypto.randomUUIDv4;
    const run: StoredRun = {
      id,
      jobId: job.id,
      threadId: ThreadId.make(`scheduled-${id}`),
      createdAt: at,
      state: "pending",
      message: null,
      job,
    };
    yield* saveRun(run);
    return run;
  });
  const list = Effect.fn("ScheduledJobs.list")(function* (): Effect.fn.Return<
    ScheduledJobsSnapshot,
    ScheduledJobError
  > {
    return yield* Effect.gen(function* () {
      const jobs = yield* readJobs();
      const runs: ScheduledJobRun[] = [];
      for (const job of jobs)
        for (const run of yield* readRuns(job.id)) runs.push(yield* runState(run));
      return { jobs, runs };
    }).pipe(Effect.mapError(failure));
  });
  const save = Effect.fn("ScheduledJobs.save")(
    function* (input: ScheduledJobInput, id?: string) {
      const at = yield* now;
      yield* validateProject(input);
      const nextRunAt = yield* next(input, at);
      const previous = id ? yield* getJob(id) : null;
      const job: ScheduledJob = {
        ...input,
        id: previous?.id ?? (yield* crypto.randomUUIDv4),
        enabled: previous?.enabled ?? true,
        nextRunAt,
        createdAt: previous?.createdAt ?? at,
        updatedAt: at,
      };
      yield* saveJob(job);
      return job;
    },
    mutex.withPermit,
    Effect.mapError(failure),
  );
  const setEnabled = Effect.fn("ScheduledJobs.setEnabled")(
    function* (id: string, enabled: boolean) {
      const job = yield* getJob(id);
      const at = yield* now;
      const updated = {
        ...job,
        enabled,
        nextRunAt: enabled ? yield* next(job, at) : job.nextRunAt,
        updatedAt: at,
      };
      yield* saveJob(updated);
      return updated;
    },
    mutex.withPermit,
    Effect.mapError(failure),
  );
  const remove = Effect.fn("ScheduledJobs.remove")(
    function* (id: string) {
      yield* sql`DELETE FROM scheduled_jobs WHERE id = ${id}`;
    },
    mutex.withPermit,
    Effect.mapError(failure),
  );
  const runNow = Effect.fn("ScheduledJobs.runNow")(
    function* (id: string) {
      const job = yield* getJob(id);
      if (yield* isBusy(id))
        return yield* new ScheduledJobError({
          message:
            "This job already has a run in progress. Open its thread to finish or stop it first.",
        });
      return yield* launch(yield* enqueue(job, yield* now));
    },
    mutex.withPermit,
    Effect.mapError(failure),
  );
  const tick = Effect.fn("ScheduledJobs.tick")(
    function* () {
      const at = yield* now;
      for (const job of yield* readJobs()) {
        for (const run of yield* readRuns(job.id)) if (run.state === "pending") yield* launch(run);
        if (!job.enabled || job.nextRunAt > at) continue;
        const nextRunAt = yield* next(job, at);
        const busy = yield* isBusy(job.id);
        const run = yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* saveJob({ ...job, nextRunAt });
            return busy ? null : yield* enqueue(job, at);
          }),
        );
        if (run) yield* launch(run);
      }
    },
    mutex.withPermit,
    Effect.mapError(failure),
  );
  let started = false;
  const start = Effect.fn("ScheduledJobs.start")(function* () {
    if (started) return;
    started = true;
    yield* tick().pipe(
      Effect.catch((error) =>
        Effect.logWarning("Scheduled jobs sweep failed", { message: error.message }),
      ),
      Effect.repeat(Schedule.spaced("30 seconds")),
      Effect.forkScoped,
    );
  });
  return { list, save, setEnabled, remove, runNow, tick, start };
});

export class ScheduledJobs extends Context.Service<ScheduledJobs, Effect.Success<typeof make>>()(
  "t3/agents/ScheduledJobs",
) {}
export const layer = Layer.effect(ScheduledJobs, make);
