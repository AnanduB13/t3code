import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2Run,
  type OrchestrationV2RunStatus,
  type OrchestrationV2ThreadShell,
  type ScheduledJobInput,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";
import { TestClock } from "effect/testing";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { ProjectStoreV2, type ProjectRow } from "../orchestration-v2/ProjectStore.ts";
import {
  ThreadLaunchError,
  ThreadLaunchService,
  type ThreadLaunchInput,
} from "../orchestration-v2/ThreadLaunchService.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";
import { ScheduledJobs, make, nextScheduledRun, scheduledRunState } from "./ScheduledJobs.ts";

const at = "2026-09-30T00:00:00.000Z";
const projectId = ProjectId.make("scheduled-project");
const input: ScheduledJobInput = {
  name: "Daily review",
  prompt: "Review the project without editing files.",
  projectId,
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test-model" },
  runtimeMode: "approval-required",
  schedule: "every 1h",
  timezone: "UTC",
};

interface LaunchedThread {
  readonly input: ThreadLaunchInput;
  status: OrchestrationV2RunStatus;
  deleted: boolean;
  lastError: string | null;
}

/** An in-memory stand-in for the V2 thread launcher and its projections. */
function makeOrchestration() {
  const threads = new Map<string, LaunchedThread>();
  const launches: Array<ThreadLaunchInput> = [];
  const projects = new Set<string>([projectId]);
  const project = (id: ProjectId): ProjectRow => ({
    projectId: id,
    title: "Project",
    workspaceRoot: "/tmp/scheduled-test-project",
    defaultModelSelection: null,
    defaultThreadEnvMode: null,
    autoPull: false,
    faviconPath: null,
    projectIcon: null,
    scripts: [],
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  const run = (thread: LaunchedThread): OrchestrationV2Run => ({
    id: RunId.make(`run:${thread.input.threadId}`),
    threadId: thread.input.threadId!,
    ordinal: 1,
    providerInstanceId: input.modelSelection.instanceId,
    modelSelection: thread.input.modelSelection,
    providerThreadId: null,
    userMessageId: thread.input.initialMessage!.messageId!,
    rootNodeId: null,
    activeAttemptId: null,
    status: thread.status,
    requestedAt: DateTime.makeUnsafe(at),
    startedAt: null,
    completedAt: null,
    checkpointId: null,
    contextHandoffId: null,
  });
  const layer = Layer.mergeAll(
    Layer.mock(ThreadLaunchService)({
      launch: (launch) =>
        Effect.gen(function* () {
          launches.push(launch);
          // Launches are idempotent per command id, like the V2 receipt store.
          if (!threads.has(launch.threadId!)) {
            threads.set(launch.threadId!, {
              input: launch,
              status: "running",
              deleted: false,
              lastError: null,
            });
          }
          return { threadId: launch.threadId!, resumed: false } as never;
        }),
    }),
    Layer.mock(ThreadManagementService)({
      getThreadShell: (threadId) =>
        Effect.succeed(
          threads.has(threadId)
            ? ({
                id: threadId,
                projectId,
                deletedAt: threads.get(threadId)!.deleted ? DateTime.makeUnsafe(at) : null,
                lastError: threads.get(threadId)!.lastError,
              } as OrchestrationV2ThreadShell)
            : null,
        ),
      getThreadRecords: (threadId) =>
        Effect.succeed({
          thread: { id: threadId },
          runs: threads.has(threadId) ? [run(threads.get(threadId)!)] : [],
        } as never),
    }),
    Layer.mock(ProjectStoreV2)({
      get: (id) =>
        Effect.succeed(projects.has(id) ? Option.some(project(id)) : Option.none<ProjectRow>()),
    }),
  );
  return { threads, launches, projects, layer };
}

type SchedulerTestServices =
  | ScheduledJobs
  | SqlClient.SqlClient
  | ThreadLaunchService
  | ThreadManagementService
  | ProjectStoreV2
  | Crypto.Crypto;

const withScheduler = <A, E>(
  body: (
    orchestration: ReturnType<typeof makeOrchestration>,
  ) => Effect.Effect<A, E, SchedulerTestServices>,
) => {
  const orchestration = makeOrchestration();
  return Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse(at));
    return yield* body(orchestration);
  }).pipe(
    Effect.provide(
      Layer.effect(ScheduledJobs, make).pipe(
        Layer.provideMerge(orchestration.layer),
        Layer.provideMerge(SqlitePersistence.layerMemory),
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  );
};

describe("native scheduled jobs", () => {
  it("calculates calendar schedules in their timezone and rejects invalid schedules", () => {
    expect(nextScheduledRun("0 9 * * *", "Asia/Kolkata", at)).toBe("2026-09-30T03:30:00.000Z");
    expect(nextScheduledRun("every 2h", "UTC", at)).toBe("2026-09-30T02:00:00.000Z");
    expect(nextScheduledRun("0 9 * * *", "America/New_York", "2026-03-07T15:00:00.000Z")).toBe(
      "2026-03-08T13:00:00.000Z",
    );
    for (const schedule of ["every 0m", "* * * * * *", "not a schedule", "every 999999999d"])
      expect(() => nextScheduledRun(schedule, "UTC", at)).toThrow();
    expect(() => nextScheduledRun("every 1h", "Invalid/Timezone", at)).toThrow();
  });

  it("maps orchestration run states onto scheduled run results", () => {
    expect(scheduledRunState("completed", null)).toEqual({ state: "completed", message: null });
    expect(scheduledRunState("failed", "Provider needs authentication")).toEqual({
      state: "failed",
      message: "Provider needs authentication",
    });
    expect(scheduledRunState("cancelled", null).state).toBe("interrupted");
    expect(scheduledRunState("waiting", null).state).toBe("running");
    expect(scheduledRunState("preparing", null).state).toBe("started");
  });

  it.effect(
    "persists jobs and launches ordinary project threads with the selected model and permissions",
    () =>
      withScheduler((orchestration) =>
        Effect.gen(function* () {
          const scheduler = yield* ScheduledJobs;
          const job = yield* scheduler.save(input);
          expect(job.nextRunAt).toBe("2026-09-30T01:00:00.000Z");
          yield* scheduler.tick();
          expect((yield* scheduler.list()).runs).toHaveLength(0);
          yield* TestClock.adjust("1 hour");
          yield* scheduler.tick();
          const snapshot = yield* scheduler.list();
          expect(snapshot.runs).toHaveLength(1);
          expect(orchestration.launches).toHaveLength(1);
          expect(orchestration.launches[0]).toMatchObject({
            threadId: snapshot.runs[0]!.threadId,
            projectId,
            title: input.name,
            modelSelection: input.modelSelection,
            runtimeMode: "approval-required",
            workspaceStrategy: { type: "root" },
            initialMessage: { text: input.prompt, attachments: [] },
          });
          expect(snapshot.jobs[0]?.nextRunAt).toBe("2026-09-30T02:00:00.000Z");
          yield* scheduler.tick();
          expect((yield* scheduler.list()).runs).toHaveLength(1);
          const restarted = yield* make;
          expect((yield* restarted.list()).jobs[0]?.id).toBe(job.id);
        }),
      ),
  );

  it.effect("keeps a running thread busy and follows its run to completion", () =>
    withScheduler((orchestration) =>
      Effect.gen(function* () {
        const scheduler = yield* ScheduledJobs;
        const job = yield* scheduler.save(input);
        const run = yield* scheduler.runNow(job.id);
        expect(run.state).toBe("running");
        expect((yield* scheduler.runNow(job.id).pipe(Effect.result))._tag).toBe("Failure");
        orchestration.threads.get(run.threadId)!.status = "completed";
        expect((yield* scheduler.list()).runs[0]?.state).toBe("completed");
        expect((yield* scheduler.runNow(job.id)).threadId).not.toBe(run.threadId);
      }),
    ),
  );

  it.effect("starts scheduled runs from the background clock without a connected client", () =>
    withScheduler((orchestration) =>
      Effect.gen(function* () {
        const scheduler = yield* ScheduledJobs;
        yield* scheduler.save({ ...input, schedule: "every 1m" });
        yield* scheduler.start();
        yield* TestClock.adjust("1 minute");
        expect(orchestration.launches).toHaveLength(1);
      }).pipe(Effect.scoped),
    ),
  );

  it.effect("shows provider failures and removed threads, and allows the next run", () =>
    withScheduler((orchestration) =>
      Effect.gen(function* () {
        const scheduler = yield* ScheduledJobs;
        const job = yield* scheduler.save(input);
        const first = yield* scheduler.runNow(job.id);
        const thread = orchestration.threads.get(first.threadId)!;
        thread.status = "failed";
        thread.lastError = "Provider needs authentication";
        expect((yield* scheduler.list()).runs[0]).toMatchObject({
          state: "failed",
          message: "Provider needs authentication",
        });
        thread.deleted = true;
        expect((yield* scheduler.list()).runs[0]).toMatchObject({
          state: "interrupted",
          message: "The run’s thread was removed.",
        });
        yield* TestClock.adjust("1 hour");
        yield* scheduler.tick();
        expect((yield* scheduler.list()).runs).toHaveLength(2);
      }),
    ),
  );

  it.effect("supports edits, pause/resume, manual runs, overlap prevention and deletion", () =>
    withScheduler((orchestration) =>
      Effect.gen(function* () {
        const scheduler = yield* ScheduledJobs;
        let job = yield* scheduler.save(input);
        job = yield* scheduler.save(
          {
            ...input,
            name: "Claude review",
            modelSelection: {
              instanceId: ProviderInstanceId.make("claudeCode"),
              model: "test-claude",
            },
          },
          job.id,
        );
        expect(job.name).toBe("Claude review");
        yield* scheduler.setEnabled(job.id, false);
        yield* TestClock.adjust("2 hours");
        yield* scheduler.tick();
        expect((yield* scheduler.list()).runs).toHaveLength(0);
        const run = yield* scheduler.runNow(job.id);
        expect(run.state).not.toBe("failed");
        expect((yield* scheduler.runNow(job.id).pipe(Effect.result))._tag).toBe("Failure");
        yield* scheduler.setEnabled(job.id, true);
        yield* TestClock.adjust("1 hour");
        yield* scheduler.tick();
        expect((yield* scheduler.list()).runs).toHaveLength(1);
        expect((yield* scheduler.list()).jobs[0]?.nextRunAt).toBe("2026-09-30T04:00:00.000Z");
        yield* scheduler.remove(job.id);
        expect(yield* scheduler.list()).toEqual({ jobs: [], runs: [] });
        expect(orchestration.threads.has(run.threadId)).toBe(true);
        expect((yield* scheduler.save(input, job.id).pipe(Effect.result))._tag).toBe("Failure");
      }),
    ),
  );

  it.effect(
    "catches up once after downtime and resumes a persisted launch with the same command",
    () =>
      withScheduler((orchestration) =>
        Effect.gen(function* () {
          const scheduler = yield* ScheduledJobs;
          const job = yield* scheduler.save(input);
          yield* TestClock.adjust("24 hours");
          yield* scheduler.tick();
          const snapshot = yield* scheduler.list();
          expect(snapshot.runs).toHaveLength(1);
          expect(snapshot.jobs[0]?.nextRunAt).toBe("2026-10-01T01:00:00.000Z");
          const sql = yield* SqlClient.SqlClient;
          // A crash after launching but before saving the result leaves this run pending.
          yield* sql`UPDATE scheduled_job_runs SET data = json_set(data, '$.state', 'pending') WHERE job_id = ${job.id}`;
          const restarted = yield* make;
          yield* restarted.tick();
          expect((yield* restarted.list()).runs).toHaveLength(1);
          expect(orchestration.launches).toHaveLength(2);
          expect(orchestration.launches[1]?.commandId).toBe(orchestration.launches[0]?.commandId);
          expect(orchestration.launches[1]?.initialMessage?.messageId).toBe(
            orchestration.launches[0]?.initialMessage?.messageId,
          );
          expect(orchestration.threads.size).toBe(1);
        }),
      ),
  );

  it.effect("rejects invalid input and reports launch failures when a project was deleted", () =>
    withScheduler((orchestration) =>
      Effect.gen(function* () {
        const scheduler = yield* ScheduledJobs;
        expect(
          (yield* scheduler.save({ ...input, schedule: "broken" }).pipe(Effect.result))._tag,
        ).toBe("Failure");
        expect(
          (yield* scheduler
            .save({ ...input, projectId: ProjectId.make("missing") })
            .pipe(Effect.result))._tag,
        ).toBe("Failure");
        expect((yield* scheduler.list()).jobs).toHaveLength(0);
        const job = yield* scheduler.save(input);
        orchestration.projects.delete(projectId);
        yield* TestClock.adjust("1 hour");
        yield* scheduler.tick();
        expect((yield* scheduler.list()).runs[0]).toMatchObject({
          jobId: job.id,
          state: "failed",
          message: "Choose an existing project on this computer.",
        });
        expect(orchestration.launches).toHaveLength(0);
      }),
    ),
  );

  it.effect("records a launch failure on the run instead of failing the sweep", () =>
    withScheduler(() =>
      Effect.gen(function* () {
        const scheduler = yield* ScheduledJobs;
        const job = yield* scheduler.save(input);
        const failing = yield* make.pipe(
          Effect.provide(
            Layer.mock(ThreadLaunchService)({
              launch: (launch) =>
                Effect.fail(
                  new ThreadLaunchError({
                    operation: "resolve-project",
                    commandId: launch.commandId,
                    projectId: launch.projectId,
                    cause: "unavailable",
                  }),
                ),
            }),
          ),
        );
        const run = yield* failing.runNow(job.id);
        expect(run.state).toBe("failed");
        expect(ThreadId.make(run.threadId)).toBe(run.threadId);
      }),
    ),
  );
});
