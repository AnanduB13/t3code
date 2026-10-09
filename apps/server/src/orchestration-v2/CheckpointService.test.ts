import { assert, it, vi } from "@effect/vitest";
import {
  CheckpointScopeId,
  NodeId,
  ProviderThreadId,
  RunId,
  ThreadId,
  type OrchestrationV2CheckpointScope,
  VcsProcessTimeoutError,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";

import * as CheckpointStore from "../checkpointing/CheckpointStore.ts";
import * as CheckpointService from "./CheckpointService.ts";
import * as IdAllocator from "./IdAllocator.ts";

it.effect.each([false, true, "interrupt"] as const)(
  "materializes baseline, lookup fails=%s",
  (lookupFails) => {
    const scope: OrchestrationV2CheckpointScope = {
      id: CheckpointScopeId.make("checkpoint-scope:materialize-baseline"),
      threadId: ThreadId.make("thread:materialize-baseline"),
      runId: RunId.make("run:materialize-baseline:3"),
      nodeId: NodeId.make("node:materialize-baseline:3"),
      parentScopeId: null,
      providerThreadId: ProviderThreadId.make("provider-thread:materialize-baseline"),
      kind: "root_run",
      ordinalWithinParent: 0,
      advancesAppRunCount: true,
      cwd: "/repo",
      createdAt: DateTime.makeUnsafe("2026-07-28T00:00:00.000Z"),
    };
    const hasCheckpointRef = vi.fn((_input: CheckpointStore.RestoreCheckpointInput) =>
      lookupFails === "interrupt"
        ? Effect.interrupt
        : lookupFails
          ? Effect.fail(
              new VcsProcessTimeoutError({
                operation: "test.ref",
                command: "git",
                cwd: "/repo",
                timeoutMs: 30000,
              }),
            )
          : Effect.succeed(true),
    );
    const layerTest = CheckpointService.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          IdAllocator.layer,
          Layer.mock(CheckpointStore.CheckpointStore)({
            isGitRepository: () => Effect.succeed(true),
            hasCheckpointRef,
            captureCheckpoint: () => Effect.void,
          }),
        ),
      ),
    );

    return Effect.gen(function* () {
      const checkpoints = yield* CheckpointService.CheckpointServiceV2;
      if (lookupFails === "interrupt") {
        const exit = yield* Effect.exit(
          checkpoints.materializeBaselineCheckpoint({ scope, ordinalWithinScope: 2 }),
        );
        assert.isTrue(Exit.hasInterrupts(exit));
        const captureExit = yield* Effect.exit(
          checkpoints.capture({
            scope,
            ordinalWithinScope: 1,
            runId: scope.runId!,
            nodeId: scope.nodeId!,
            appRunOrdinal: 1,
            capturedAt: scope.createdAt,
          }),
        );
        assert.isTrue(Exit.hasInterrupts(captureExit));
        return;
      }
      const baseline = yield* checkpoints.materializeBaselineCheckpoint({
        scope,
        ordinalWithinScope: 2,
      });

      assert.equal(baseline.ordinalWithinScope, 2);
      assert.equal(
        baseline.ref,
        CheckpointService.checkpointRefForScopeOrdinal({
          scopeId: scope.id,
          ordinalWithinScope: 2,
        }),
      );
      assert.equal(baseline.status, lookupFails ? "missing" : "ready");
      assert.deepEqual(hasCheckpointRef.mock.calls[0]?.[0], {
        cwd: scope.cwd,
        checkpointRef: baseline.ref,
      });
    }).pipe(Effect.provide(layerTest));
  },
);

it.effect("isolates each run's baseline from work done between runs", () => {
  const scope: OrchestrationV2CheckpointScope = {
    id: CheckpointScopeId.make("checkpoint-scope:isolated-baseline"),
    threadId: ThreadId.make("thread:isolated-baseline"),
    runId: RunId.make("run:isolated-baseline:2"),
    nodeId: NodeId.make("node:isolated-baseline:2"),
    parentScopeId: null,
    providerThreadId: ProviderThreadId.make("provider-thread:isolated-baseline"),
    kind: "root_run",
    ordinalWithinParent: 0,
    advancesAppRunCount: true,
    cwd: "/repo",
    createdAt: DateTime.makeUnsafe("2026-07-28T00:00:00.000Z"),
  };
  const refs = new Set<string>([
    CheckpointService.checkpointRefForScopeOrdinal({ scopeId: scope.id, ordinalWithinScope: 1 }),
  ]);
  const diffs: Array<string> = [];
  const deleted: Array<string> = [];
  const layerTest = CheckpointService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        IdAllocator.layer,
        Layer.mock(CheckpointStore.CheckpointStore)({
          isGitRepository: () => Effect.succeed(true),
          hasCheckpointRef: ({ checkpointRef }) => Effect.succeed(refs.has(checkpointRef)),
          captureCheckpoint: ({ checkpointRef }) => Effect.sync(() => void refs.add(checkpointRef)),
          diffCheckpoints: ({ fromCheckpointRef }) =>
            Effect.sync(() => {
              diffs.push(fromCheckpointRef);
              return "";
            }),
          deleteCheckpointRefs: ({ checkpointRefs }) =>
            Effect.sync(() => void deleted.push(...checkpointRefs)),
        }),
      ),
    ),
  );
  const baselineRef = (ordinalWithinScope: number) =>
    CheckpointService.checkpointBaselineRefForScopeOrdinal({ scopeId: scope.id, ordinalWithinScope });

  return Effect.gen(function* () {
    const checkpoints = yield* CheckpointService.CheckpointServiceV2;
    // Run 2 starts after run 1 completed: its own pre-run snapshot is taken.
    yield* checkpoints.captureBaseline({ scope, ordinalWithinScope: 1 });
    assert.isTrue(refs.has(baselineRef(1)));
    const checkpoint = yield* checkpoints.capture({
      scope,
      ordinalWithinScope: 2,
      runId: scope.runId!,
      nodeId: scope.nodeId!,
      appRunOrdinal: 2,
      capturedAt: scope.createdAt,
    });
    assert.deepEqual(diffs, [baselineRef(1)]);

    yield* checkpoints.deleteStaleRefs({ scope, checkpoints: [checkpoint] });
    assert.deepEqual(deleted, [checkpoint.ref, baselineRef(1), baselineRef(2)]);
  }).pipe(Effect.provide(layerTest));
});
