import { MessageId, PROVIDER_SEND_TURN_MAX_INPUT_CHARS, RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { combineQueuedPrompts, planQueuedRunMoves, type QueuedPrompt } from "./queuedPrompts.ts";

const runs = (...ids: string[]) => ids.map((id) => RunId.make(id));

function applyMoves(
  order: ReadonlyArray<RunId>,
  moves: ReadonlyArray<{ readonly runId: RunId; readonly beforeRunId: RunId | null }>,
) {
  const next = [...order];
  for (const { runId, beforeRunId } of moves) {
    next.splice(next.indexOf(runId), 1);
    if (beforeRunId === null) next.push(runId);
    else next.splice(next.indexOf(beforeRunId), 0, runId);
  }
  return next;
}

function prompt(id: string, text: string): QueuedPrompt {
  return {
    messageId: MessageId.make(`message-${id}`),
    runId: RunId.make(`run-${id}`),
    text,
    attachments: [],
    queuedAt: "2026-10-06T00:00:00.000Z",
    holdUntilUserAction: false,
  };
}

describe("planQueuedRunMoves", () => {
  it("moves a dragged prompt with a single command", () => {
    const current = runs("a", "b", "c", "d");
    const desired = runs("c", "a", "b", "d");
    const moves = planQueuedRunMoves(current, desired);
    expect(moves).toEqual([{ runId: RunId.make("c"), beforeRunId: RunId.make("a") }]);
    expect(applyMoves(current, moves!)).toEqual(desired);
  });

  it("produces the requested order for arbitrary permutations", () => {
    const current = runs("a", "b", "c", "d", "e");
    for (const desired of [
      runs("e", "d", "c", "b", "a"),
      runs("b", "a", "d", "c", "e"),
      runs("a", "b", "c", "d", "e"),
    ]) {
      expect(applyMoves(current, planQueuedRunMoves(current, desired)!)).toEqual(desired);
    }
  });

  it("rejects an order built from a stale queue", () => {
    expect(planQueuedRunMoves(runs("a", "b"), runs("a", "c"))).toBeNull();
    expect(planQueuedRunMoves(runs("a", "b"), runs("a"))).toBeNull();
    expect(planQueuedRunMoves(runs("a", "b"), runs("a", "a"))).toBeNull();
  });
});

describe("combineQueuedPrompts", () => {
  it("joins selected prompts in queue order", () => {
    const combined = combineQueuedPrompts([prompt("1", "first"), prompt("2", "second")]);
    expect(combined).toEqual({ ok: true, text: "first\n\nsecond", attachments: [] });
  });

  it("refuses a steer over the provider input limit", () => {
    const long = "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS);
    const combined = combineQueuedPrompts([prompt("1", long), prompt("2", "more")]);
    expect(combined.ok).toBe(false);
  });
});
