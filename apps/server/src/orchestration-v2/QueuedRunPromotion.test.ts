import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import type { ProviderAdapterV2Shape } from "./ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";

const instanceId = ProviderInstanceId.make("codex");
const modelSelection = { instanceId, model: "gpt-5.1-codex" };
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("Runs here never reach a provider"),
} as ProviderAdapterV2Shape;
const layerDatabase = SqlitePersistence.layerMemory;
// No effect worker: started runs stay at "starting", so the test reads queue order directly.
const layerTest = Layer.mergeAll(
  layerDatabase,
  ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "queued-run-promotion" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: layerDatabase, runEffectWorker: false },
  ),
);

const send = (threadId: ThreadId, text: string, type: "start_immediately" | "queue_after_active") =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    yield* orchestrator.dispatch({
      type: "message.dispatch",
      commandId: CommandId.make(`send:${threadId}:${text}`),
      threadId,
      messageId: MessageId.make(`message:${threadId}:${text}`),
      text,
      attachments: [],
      dispatchMode: { type },
      createdBy: "user",
      creationSource: "web",
    });
  });

/** Runs in order as `status:text`, so a test reads which prompt holds which slot. */
const runOrder = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projection = yield* orchestrator.getThreadProjection(threadId);
    return projection.runs.map((run) => {
      const text = projection.messages.find((message) => message.id === run.userMessageId)?.text;
      return `${run.status}:${text}`;
    });
  });

/**
 * Leaves the thread where the terminal-run listener has not yet promoted the
 * queue: the first run is over and "second" is still waiting.
 */
const finishFirstRunBeforePromotion = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    yield* orchestrator.dispatch({
      type: "thread.create",
      commandId: CommandId.make(`create:${threadId}`),
      threadId,
      projectId: ProjectId.make("project:queued-run-promotion"),
      title: threadId,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "web",
    });
    yield* send(threadId, "first", "start_immediately");
    yield* send(threadId, "second", "queue_after_active");
    const now = yield* DateTime.now;
    const firstRun = (yield* orchestrator.getThreadProjection(threadId)).runs[0]!;
    // Applied to the projection only, so the listener never sees it end.
    yield* projections.apply({
      id: EventId.make(`event:${threadId}:first-run-completed`),
      type: "run.updated",
      threadId,
      runId: firstRun.id,
      occurredAt: now,
      payload: { ...firstRun, status: "completed", startedAt: now, completedAt: now },
    });
    assert.deepEqual(yield* runOrder(threadId), ["completed:first", "queued:second"]);
  });

it.effect.each(["queue_after_active", "start_immediately"] as const)(
  "a %s message sent before queue promotion lines up behind the waiting prompt",
  (type) =>
    Effect.gen(function* () {
      const threadId = ThreadId.make(`thread:promotion:${type}`);
      yield* finishFirstRunBeforePromotion(threadId);

      yield* send(threadId, "third", type);

      assert.deepEqual(yield* runOrder(threadId), [
        "completed:first",
        "starting:second",
        "queued:third",
      ]);
    }).pipe(Effect.provide(layerTest)),
);
