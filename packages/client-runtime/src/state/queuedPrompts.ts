import {
  OrchestrationMessageContext,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type ChatAttachment,
  type MessageId,
  type OrchestrationV2ThreadProjection,
  type RunId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { deriveThreadQueueWorkflowState } from "./threadWorkflows.ts";

/**
 * After Dark's view of one queued follow-up. The server owns the queue as V2
 * queued runs; this is the shape the queue chips, Stop restore, and steer
 * selection work with.
 */
export interface QueuedPrompt {
  readonly messageId: MessageId;
  readonly runId: RunId;
  readonly text: string;
  readonly attachments: ReadonlyArray<ChatAttachment>;
  readonly context?: OrchestrationMessageContext | undefined;
  readonly queuedAt: string;
  /** Held after Stop or a restart: nothing sends until the user acts. */
  readonly holdUntilUserAction: boolean;
}

const EMPTY_QUEUED_PROMPTS: ReadonlyArray<QueuedPrompt> = [];

/** Queued prompts in send order. */
export function deriveQueuedPrompts(
  projection: OrchestrationV2ThreadProjection | null | undefined,
): ReadonlyArray<QueuedPrompt> {
  if (!projection) return EMPTY_QUEUED_PROMPTS;
  const { queuedRuns } = deriveThreadQueueWorkflowState(projection);
  if (queuedRuns.length === 0) return EMPTY_QUEUED_PROMPTS;
  return queuedRuns.map(({ run, text, attachments, messageId, context }) => ({
    messageId,
    runId: run.id,
    text,
    attachments,
    ...(context ? { context } : {}),
    queuedAt: DateTime.formatIso(run.requestedAt),
    holdUntilUserAction: run.queueHeld === true,
  }));
}

const decodeMessageContext = Schema.decodeUnknownOption(OrchestrationMessageContext);

export type CombinedQueuedPrompt =
  | {
      readonly ok: true;
      readonly text: string;
      readonly attachments: ReadonlyArray<ChatAttachment>;
      readonly context?: OrchestrationMessageContext;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Joins selected queued prompts into one message for a steer, the way a single
 * typed message would carry them: text separated by blank lines, every
 * attachment, and each context record once.
 */
export function combineQueuedPrompts(prompts: ReadonlyArray<QueuedPrompt>): CombinedQueuedPrompt {
  const text = prompts.map((prompt) => prompt.text).join("\n\n");
  const attachments = prompts.flatMap((prompt) => prompt.attachments);
  const records = [
    ...new Map(
      prompts
        .flatMap((prompt) => prompt.context?.records ?? [])
        .map((record) => [record.contextId, record] as const),
    ).values(),
  ];
  if (text.length > PROVIDER_SEND_TURN_MAX_INPUT_CHARS) {
    return {
      ok: false,
      reason: `Selected queued prompts exceed the ${PROVIDER_SEND_TURN_MAX_INPUT_CHARS}-character steer limit.`,
    };
  }
  if (attachments.length > PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
    return {
      ok: false,
      reason: `Selected queued prompts exceed the ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS}-attachment steer limit.`,
    };
  }
  if (records.length === 0) return { ok: true, text, attachments };
  const context = decodeMessageContext({ version: 1, records });
  if (Option.isNone(context)) {
    return {
      ok: false,
      reason: "Selected queued prompts contain too much file context. Send fewer prompts together.",
    };
  }
  return { ok: true, text, attachments, context: context.value };
}

export interface QueuedRunMove {
  readonly runId: RunId;
  readonly beforeRunId: RunId | null;
}

/**
 * The fewest single-run moves that turn `current` into `desired`. Both must be
 * the same set of runs; anything else returns null so the caller can reject a
 * reorder made against a stale queue.
 */
export function planQueuedRunMoves(
  current: ReadonlyArray<RunId>,
  desired: ReadonlyArray<RunId>,
): ReadonlyArray<QueuedRunMove> | null {
  if (current.length !== desired.length) return null;
  const desiredSet = new Set(desired);
  if (desiredSet.size !== desired.length || current.some((runId) => !desiredSet.has(runId))) {
    return null;
  }
  // Runs on a longest increasing run of current positions keep their place;
  // only the rest move. Each moved run lands directly before its successor,
  // working from the back so every successor is already in final position.
  const positions = desired.map((runId) => current.indexOf(runId));
  const kept = longestIncreasingSubsequence(positions);
  const moves: QueuedRunMove[] = [];
  for (let index = desired.length - 1; index >= 0; index -= 1) {
    if (kept.has(index)) continue;
    moves.push({ runId: desired[index]!, beforeRunId: desired[index + 1] ?? null });
  }
  return moves;
}

/** Indexes of one longest strictly increasing subsequence of `values`. */
function longestIncreasingSubsequence(values: ReadonlyArray<number>): ReadonlySet<number> {
  const tails: number[] = [];
  const previous: number[] = Array.from({ length: values.length }, () => -1);
  for (let index = 0; index < values.length; index += 1) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (values[tails[middle]!]! < values[index]!) low = middle + 1;
      else high = middle;
    }
    if (low > 0) previous[index] = tails[low - 1]!;
    tails[low] = index;
  }
  const kept = new Set<number>();
  for (let index = tails.at(-1) ?? -1; index >= 0; index = previous[index]!) kept.add(index);
  return kept;
}
