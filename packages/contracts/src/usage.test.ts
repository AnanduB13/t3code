import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { UsageBucket } from "./usage.ts";

describe("UsageBucket", () => {
  it("defaults buckets from version-3 servers to an unknown origin", () => {
    const decode = Schema.decodeUnknownSync(UsageBucket);

    expect(
      decode({
        day: "2026-08-12",
        provider: "codex",
        model: "gpt-5.6-sol",
        totals: {
          uncachedInputTokens: 1,
          cachedInputTokens: 2,
          cacheCreationTokens: 0,
          outputTokens: 3,
          reasoningTokens: 1,
        },
        costUsd: 0.01,
        cacheSavingsUsd: 0.02,
        costSource: "modelPriced",
        records: 1,
        unpricedRecords: 0,
        sessions: 1,
      }).origin,
    ).toBe("unknown");
  });
});
