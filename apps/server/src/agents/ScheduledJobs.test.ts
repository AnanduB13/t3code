import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  type ScheduledJobInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as Fiber from "effect/Fiber";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { TestClock } from "effect/testing";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { OrchestrationLayerLive } from "../orchestration/runtimeLayer.ts";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { RepositoryIdentityResolver } from "../project/RepositoryIdentityResolver.ts";
import { ServerConfig } from "../config.ts";
import { ScheduledJobs, layer, make, nextScheduledRun } from "./ScheduledJobs.ts";

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
const testLayer = layer.pipe(
  Layer.provideMerge(OrchestrationLayerLive),
  Layer.provide(Layer.succeed(RepositoryIdentityResolver, { resolve: () => Effect.succeed(null) })),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-scheduled-tests-" })),
  Layer.provideMerge(NodeServices.layer),
);
const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse(at));
  const engine = yield* OrchestrationEngineService;
  yield* engine.dispatch({
    type: "project.create",
    commandId: CommandId.make("create-project"),
    projectId,
    title: "Project",
    workspaceRoot: "/tmp/scheduled-test-project",
    createdAt: at,
  });
  return yield* ScheduledJobs;
});

describe("native scheduled jobs", () => {
  it.effect("keeps archived runs busy and preserves completed results after session shutdown", () =>
    Effect.gen(function* () {
      const scheduler = yield* setup;
      const job = yield* scheduler.save(input);
      const run = yield* scheduler.runNow(job.id);
      const engine = yield* OrchestrationEngineService;
      yield* engine.dispatch({
        type: "thread.archive",
        commandId: CommandId.make("archive-run"),
        threadId: run.threadId,
      });
      expect((yield* scheduler.runNow(job.id).pipe(Effect.result))._tag).toBe("Failure");
      const sql = yield* SqlClient.SqlClient;
      yield* sql`UPDATE projection_turns SET state = 'completed' WHERE thread_id = ${run.threadId}`;
      yield* engine.dispatch({
        type: "thread.session.set",
        commandId: CommandId.make("stop-completed-session"),
        threadId: run.threadId,
        createdAt: at,
        session: {
          threadId: run.threadId,
          status: "stopped",
          providerName: "codex",
          runtimeMode: "approval-required",
          activeTurnId: null,
          lastError: null,
          updatedAt: at,
        },
      });
      expect((yield* scheduler.list()).runs[0]?.state).toBe("completed");
      // A follow-up uses a different prompt and must not change the scheduled run's result.
      yield* sql`INSERT INTO projection_turns (thread_id, turn_id, pending_message_id, state, requested_at, checkpoint_files_json)
        VALUES (${run.threadId}, 'follow-up-turn', 'follow-up-message', 'running', ${at}, '[]')`;
      expect((yield* scheduler.list()).runs[0]?.state).toBe("completed");
      expect((yield* scheduler.runNow(job.id)).threadId).not.toBe(run.threadId);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("starts scheduled turns from the background clock without a connected client", () =>
    Effect.gen(function* () {
      const scheduler = yield* setup;
      yield* scheduler.save({ ...input, schedule: "every 1m" });
      const engine = yield* OrchestrationEngineService;
      const events = yield* engine.subscribeDomainEvents;
      const receipt = yield* events.pipe(
        Stream.filter((event) => event.type === "thread.turn-start-requested"),
        Stream.runHead,
        Effect.forkScoped,
      );
      yield* scheduler.start();
      yield* TestClock.adjust("1 minute");
      expect(Option.isSome(yield* Fiber.join(receipt))).toBe(true);
    }).pipe(Effect.provide(testLayer), Effect.scoped),
  );

  it.effect("shows provider startup failures and allows the next run", () =>
    Effect.gen(function* () {
      const scheduler = yield* setup;
      const job = yield* scheduler.save(input);
      const first = yield* scheduler.runNow(job.id);
      const engine = yield* OrchestrationEngineService;
      yield* engine.dispatch({
        type: "thread.session.set",
        commandId: CommandId.make("provider-failed"),
        threadId: first.threadId,
        createdAt: at,
        session: {
          threadId: first.threadId,
          status: "error",
          providerName: "codex",
          runtimeMode: "approval-required",
          activeTurnId: null,
          lastError: "Provider needs authentication",
          updatedAt: at,
        },
      });
      expect((yield* scheduler.list()).runs[0]).toMatchObject({
        state: "failed",
        message: "Provider needs authentication",
      });
      yield* TestClock.adjust("1 hour");
      yield* scheduler.tick();
      expect((yield* scheduler.list()).runs).toHaveLength(2);
    }).pipe(Effect.provide(testLayer)),
  );
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

  it.effect(
    "persists jobs and dispatches ordinary project turns with the selected model and permissions",
    () =>
      Effect.gen(function* () {
        const scheduler = yield* setup;
        const job = yield* scheduler.save(input);
        expect(job.nextRunAt).toBe("2026-09-30T01:00:00.000Z");
        yield* scheduler.tick();
        expect((yield* scheduler.list()).runs).toHaveLength(0);
        yield* TestClock.adjust("1 hour");
        yield* scheduler.tick();
        const snapshot = yield* scheduler.list();
        expect(snapshot.runs).toHaveLength(1);
        const queries = yield* ProjectionSnapshotQuery;
        const thread = Option.getOrThrow(
          yield* queries.getThreadDetailById(snapshot.runs[0]!.threadId),
        );
        expect(thread).toMatchObject({
          projectId,
          modelSelection: input.modelSelection,
          runtimeMode: "approval-required",
        });
        expect(thread.messages.some((message) => message.text === input.prompt)).toBe(true);
        expect(snapshot.jobs[0]?.nextRunAt).toBe("2026-09-30T02:00:00.000Z");
        yield* scheduler.tick();
        expect((yield* scheduler.list()).runs).toHaveLength(1);
        const restarted = yield* make;
        expect((yield* restarted.list()).jobs[0]?.id).toBe(job.id);
      }).pipe(Effect.provide(testLayer)),
  );

  it.effect("supports edits, pause/resume, manual runs, overlap prevention and deletion", () =>
    Effect.gen(function* () {
      const scheduler = yield* setup;
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
      const overlapping = yield* scheduler.runNow(job.id).pipe(Effect.result);
      expect(overlapping._tag).toBe("Failure");
      yield* scheduler.setEnabled(job.id, true);
      yield* TestClock.adjust("1 hour");
      yield* scheduler.tick();
      expect((yield* scheduler.list()).runs).toHaveLength(1);
      expect((yield* scheduler.list()).jobs[0]?.nextRunAt).toBe("2026-09-30T04:00:00.000Z");
      yield* scheduler.remove(job.id);
      expect(yield* scheduler.list()).toEqual({ jobs: [], runs: [] });
      const queries = yield* ProjectionSnapshotQuery;
      expect(Option.isSome(yield* queries.getThreadShellById(run.threadId))).toBe(true);
      expect((yield* scheduler.save(input, job.id).pipe(Effect.result))._tag).toBe("Failure");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect(
    "catches up once after downtime and resumes a persisted launch without duplicating its turn",
    () =>
      Effect.gen(function* () {
        const scheduler = yield* setup;
        const job = yield* scheduler.save(input);
        yield* TestClock.adjust("24 hours");
        yield* scheduler.tick();
        const snapshot = yield* scheduler.list();
        expect(snapshot.runs).toHaveLength(1);
        expect(snapshot.jobs[0]?.nextRunAt).toBe("2026-10-01T01:00:00.000Z");
        const sql = yield* SqlClient.SqlClient;
        // A crash after dispatch but before saving the receipt leaves this persisted launch pending.
        yield* sql`UPDATE scheduled_job_runs SET data = json_set(data, '$.state', 'pending') WHERE job_id = ${job.id}`;
        const restarted = yield* make;
        yield* restarted.tick();
        expect((yield* restarted.list()).runs).toHaveLength(1);
        const queries = yield* ProjectionSnapshotQuery;
        const thread = Option.getOrThrow(
          yield* queries.getThreadDetailById(snapshot.runs[0]!.threadId),
        );
        expect(thread.messages.filter((message) => message.role === "user")).toHaveLength(1);
        const events = yield* sql<{
          count: number;
        }>`SELECT count(*) AS count FROM orchestration_events WHERE event_type = 'thread.turn-start-requested'`;
        expect(events[0]?.count).toBe(1);
      }).pipe(Effect.provide(testLayer)),
  );

  it.effect("rejects invalid input and reports launch failures when a project was deleted", () =>
    Effect.gen(function* () {
      const scheduler = yield* setup;
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
      const engine = yield* OrchestrationEngineService;
      yield* engine.dispatch({
        type: "project.delete",
        commandId: CommandId.make("delete-project"),
        projectId,
      });
      yield* TestClock.adjust("1 hour");
      yield* scheduler.tick();
      expect((yield* scheduler.list()).runs[0]).toMatchObject({
        jobId: job.id,
        state: "failed",
        message: "Choose an existing project on this computer.",
      });
    }).pipe(Effect.provide(testLayer)),
  );
});
