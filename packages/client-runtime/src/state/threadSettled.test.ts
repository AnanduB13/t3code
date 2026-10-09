import { describe, expect, it } from "vite-plus/test";

import {
  hasQueuedTurnStart,
  isLatestTurnCompleted,
  threadLastActivityAt,
} from "./threadSettled.ts";

const NOW = "2026-04-10T00:00:00.000Z";

function run(input: {
  readonly status: string;
  readonly requestedAt?: string | null;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
}) {
  return {
    status: input.status,
    requestedAt: input.requestedAt ?? null,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
  };
}

describe("isLatestTurnCompleted", () => {
  it("keeps completion independent from whether a client has read the result", () => {
    expect(isLatestTurnCompleted(run({ status: "completed" }))).toBe(true);
    expect(isLatestTurnCompleted(run({ status: "running" }))).toBe(false);
    expect(isLatestTurnCompleted(null)).toBe(false);
  });
});

describe("threadLastActivityAt", () => {
  it("returns the latest user send or run lifecycle time", () => {
    expect(
      threadLastActivityAt({
        latestUserMessageAt: "2026-04-04T00:00:00.000Z",
        latestRun: run({
          status: "completed",
          requestedAt: "2026-04-03T00:00:00.000Z",
          startedAt: "2026-04-05T00:00:00.000Z",
          completedAt: "2026-04-06T00:00:00.000Z",
        }),
      }),
    ).toBe("2026-04-06T00:00:00.000Z");
    expect(threadLastActivityAt({ latestUserMessageAt: null, latestRun: null })).toBeNull();
  });
});

describe("hasQueuedTurnStart", () => {
  it("treats a fresh unadopted user message as pending work", () => {
    expect(
      hasQueuedTurnStart(
        {
          latestUserMessageAt: "2026-04-09T23:59:30.000Z",
          latestRun: run({ status: "completed", completedAt: "2026-04-09T23:00:00.000Z" }),
        },
        { now: NOW },
      ),
    ).toBe(true);
  });
});
