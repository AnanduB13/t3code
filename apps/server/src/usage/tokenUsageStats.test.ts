import { describe, expect, it } from "@effect/vitest";

import { summarizeTokenUsage } from "./tokenUsageStats.ts";

describe("summarizeTokenUsage", () => {
  it("adds a thread's legacy and provider-thread totals and buckets them by day", () => {
    expect(
      summarizeTokenUsage([
        { threadId: "a", tokens: 100, date: "2026-09-01" },
        { threadId: "a", tokens: 50, date: "2026-10-01" },
        { threadId: "b", tokens: 120, date: "2026-10-01" },
      ]),
    ).toEqual({
      lifetimeTokens: 270,
      peakThreadTokens: 150,
      trackedThreads: 2,
      daily: [
        { date: "2026-09-01", tokens: 100 },
        { date: "2026-10-01", tokens: 170 },
      ],
    });
  });
});
