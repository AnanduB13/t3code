import { CommandId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

import { ProjectionSnapshotQuery } from "../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { ProviderSessionDirectory } from "../Services/ProviderSessionDirectory.ts";
import {
  ProviderSessionReaper,
  type ProviderSessionReaperShape,
} from "../Services/ProviderSessionReaper.ts";
import { forkParked } from "../../serverActivation.ts";
import { ProviderService } from "../Services/ProviderService.ts";

const DEFAULT_INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000;
const DEFAULT_ACTIVE_TURN_INACTIVITY_THRESHOLD_MS = 15 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export interface ProviderSessionReaperLiveOptions {
  readonly inactivityThresholdMs?: number;
  readonly activeTurnInactivityThresholdMs?: number;
  readonly sweepIntervalMs?: number;
}

const makeProviderSessionReaper = (options?: ProviderSessionReaperLiveOptions) =>
  Effect.gen(function* () {
    const providerService = yield* ProviderService;
    const directory = yield* ProviderSessionDirectory;
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    const orchestrationEngine = yield* OrchestrationEngineService;

    const inactivityThresholdMs = Math.max(
      1,
      options?.inactivityThresholdMs ?? DEFAULT_INACTIVITY_THRESHOLD_MS,
    );
    const activeTurnInactivityThresholdMs = Math.max(
      1,
      options?.activeTurnInactivityThresholdMs ??
        options?.inactivityThresholdMs ??
        DEFAULT_ACTIVE_TURN_INACTIVITY_THRESHOLD_MS,
    );
    const sweepIntervalMs = Math.max(1, options?.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS);

    const sweep = Effect.gen(function* () {
      const bindings = yield* directory.listBindings();
      // The directory is durable, while adapter sessions are process-local. A
      // server restart can therefore leave a projected active turn pointing at
      // a process that is gone, or at a newly restored session that does not
      // own that turn. Keep this runtime snapshot separate from persisted
      // bindings so ownership can be checked using the exact turn id.
      const liveSessions = yield* providerService.listSessions();
      const now = yield* Clock.currentTimeMillis;
      let reapedCount = 0;

      for (const binding of bindings) {
        const lastSeenMs = Date.parse(binding.lastSeenAt);
        if (Number.isNaN(lastSeenMs)) {
          yield* Effect.logWarning("provider.session.reaper.invalid-last-seen", {
            threadId: binding.threadId,
            provider: binding.provider,
            lastSeenAt: binding.lastSeenAt,
          });
          continue;
        }

        const thread = yield* projectionSnapshotQuery
          .getThreadShellById(binding.threadId)
          .pipe(Effect.map(Option.getOrUndefined));

        const projectedActiveTurnId = thread?.session?.activeTurnId ?? null;
        const threadLiveSessions = liveSessions.filter(
          (session) => session.threadId === binding.threadId,
        );
        const projectedTurnSession =
          projectedActiveTurnId === null
            ? undefined
            : threadLiveSessions.find(
                (session) =>
                  session.status === "running" && session.activeTurnId === projectedActiveTurnId,
              );
        const providerOwnsProjectedTurn =
          projectedActiveTurnId === null || projectedTurnSession !== undefined;
        const providerOwnsBackgroundWork =
          thread?.backgroundLiveness == null || threadLiveSessions.length > 0;
        // Adapter session timestamps describe changes to the session record;
        // they are not a provider-event heartbeat. In particular, a recovered
        // Codex session can retain an old updatedAt while its resumed turn is
        // actively emitting messages and tool events. Every projected provider
        // event advances the thread timestamp, so use the newest of the two
        // before declaring a provider-owned turn stalled.
        const projectedTurnSessionUpdatedMs = projectedTurnSession
          ? Date.parse(projectedTurnSession.updatedAt)
          : Number.NaN;
        const projectedThreadUpdatedMs = thread ? Date.parse(thread.updatedAt) : Number.NaN;
        const projectedTurnLastActivityMs = Math.max(
          Number.isNaN(projectedTurnSessionUpdatedMs)
            ? Number.NEGATIVE_INFINITY
            : projectedTurnSessionUpdatedMs,
          Number.isNaN(projectedThreadUpdatedMs)
            ? Number.NEGATIVE_INFINITY
            : projectedThreadUpdatedMs,
        );
        const hasStalledProjectedTurn =
          projectedTurnSession !== undefined &&
          projectedTurnLastActivityMs !== Number.NEGATIVE_INFINITY &&
          now - projectedTurnLastActivityMs >= activeTurnInactivityThresholdMs;
        const hasOrphanedProjectedWork = !providerOwnsProjectedTurn || !providerOwnsBackgroundWork;

        if (hasOrphanedProjectedWork || hasStalledProjectedTurn) {
          // Dispatching through orchestration is essential here: marking only
          // the provider binding stopped leaves the read model (and its timer)
          // running forever. Orphans end at their last projected activity so
          // downtime is not reported as work; a live runtime that stalls ends
          // when the watchdog detects it so the visible elapsed timer and the
          // final interruption duration stay consistent.
          const reconciled = yield* orchestrationEngine
            .dispatch({
              type: "thread.session.stop",
              commandId: CommandId.make(
                `server:provider-session-reaper:${binding.threadId}:${String(now)}`,
              ),
              threadId: binding.threadId,
              failureMessage: hasStalledProjectedTurn
                ? "The provider stopped responding before the turn completed. Retry the task to continue."
                : "The provider session ended before the turn completed. Retry the task to continue.",
              createdAt: hasStalledProjectedTurn
                ? DateTime.formatIso(DateTime.makeUnsafe(now))
                : (thread?.updatedAt ?? binding.lastSeenAt),
            })
            .pipe(
              Effect.tap(() =>
                Effect.logWarning("provider.session.reaper.reconciled-orphaned-work", {
                  threadId: binding.threadId,
                  provider: binding.provider,
                  activeTurnId: projectedActiveTurnId,
                  liveSessionStatuses: threadLiveSessions.map((session) => session.status),
                  liveActiveTurnIds: threadLiveSessions.map(
                    (session) => session.activeTurnId ?? null,
                  ),
                  backgroundLiveness: thread?.backgroundLiveness ?? null,
                  reason: hasStalledProjectedTurn
                    ? "active_turn_inactivity_threshold"
                    : "orphaned_projected_work",
                  lastTurnActivityAt:
                    projectedTurnLastActivityMs === Number.NEGATIVE_INFINITY
                      ? null
                      : DateTime.formatIso(DateTime.makeUnsafe(projectedTurnLastActivityMs)),
                }),
              ),
              Effect.as(true),
              Effect.catchCause((cause) =>
                Effect.logWarning("provider.session.reaper.reconcile-orphan-failed", {
                  threadId: binding.threadId,
                  provider: binding.provider,
                  cause,
                }).pipe(Effect.as(false)),
              ),
            );
          if (reconciled) {
            reapedCount += 1;
          }
          continue;
        }

        // A stopped runtime normally needs no cleanup, but it can still have
        // a projected running turn after a provider exit or server restart.
        // Reconcile that mismatch above before skipping idle-session reaping;
        // otherwise clients retain a working indicator forever even though no
        // process owns the turn.
        if (binding.status === "stopped") {
          continue;
        }

        const idleDurationMs = now - lastSeenMs;
        if (idleDurationMs < inactivityThresholdMs) {
          continue;
        }

        if (thread?.session?.activeTurnId != null) {
          yield* Effect.logDebug("provider.session.reaper.skipped-live-active-turn", {
            threadId: binding.threadId,
            activeTurnId: thread.session.activeTurnId,
            idleDurationMs,
          });
          continue;
        }

        // The turn can settle while background work runs on (subagent
        // fleets, workflow runs, Monitor watch loops). Those live inside the
        // provider process, so stopping the session would kill them silently,
        // and nothing bumps lastSeenAt between turns.
        if (thread?.backgroundLiveness != null) {
          yield* Effect.logDebug("provider.session.reaper.skipped-live-background-work", {
            threadId: binding.threadId,
            backgroundLiveness: thread.backgroundLiveness,
            idleDurationMs,
          });
          continue;
        }

        const reaped = yield* providerService.stopSession({ threadId: binding.threadId }).pipe(
          Effect.tap(() =>
            Effect.logInfo("provider.session.reaped", {
              threadId: binding.threadId,
              provider: binding.provider,
              idleDurationMs,
              reason: "inactivity_threshold",
            }),
          ),
          Effect.as(true),
          Effect.catchCause((cause) =>
            Effect.logWarning("provider.session.reaper.stop-failed", {
              threadId: binding.threadId,
              provider: binding.provider,
              idleDurationMs,
              cause,
            }).pipe(Effect.as(false)),
          ),
        );

        if (reaped) {
          reapedCount += 1;
        }
      }

      if (reapedCount > 0) {
        yield* Effect.logInfo("provider.session.reaper.sweep-complete", {
          reapedCount,
          totalBindings: bindings.length,
        });
      }
    });

    const start: ProviderSessionReaperShape["start"] = () =>
      Effect.gen(function* () {
        yield* forkParked(
          sweep.pipe(
            Effect.catch((error: unknown) =>
              Effect.logWarning("provider.session.reaper.sweep-failed", {
                error,
              }),
            ),
            Effect.catchDefect((defect: unknown) =>
              Effect.logWarning("provider.session.reaper.sweep-defect", {
                defect,
              }),
            ),
            Effect.repeat(Schedule.spaced(Duration.millis(sweepIntervalMs))),
          ),
        );

        yield* Effect.logInfo("provider.session.reaper.started", {
          inactivityThresholdMs,
          activeTurnInactivityThresholdMs,
          sweepIntervalMs,
        });
      });

    return {
      start,
    } satisfies ProviderSessionReaperShape;
  });

export const makeProviderSessionReaperLive = (options?: ProviderSessionReaperLiveOptions) =>
  Layer.effect(ProviderSessionReaper, makeProviderSessionReaper(options));

export const ProviderSessionReaperLive = makeProviderSessionReaperLive();
