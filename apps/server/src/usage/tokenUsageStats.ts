import type { TokenUsageStats } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

interface TokenUsageSample {
  readonly threadId: string;
  readonly tokens: number;
  readonly date: string;
}

const tokenCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

/**
 * Folds the latest cumulative token count of each conversation into totals.
 * A thread is one tracked conversation; its samples (legacy history plus each
 * provider thread it used) add up, because a continued thread starts a fresh
 * provider session whose count begins at zero.
 */
export function summarizeTokenUsage(samples: ReadonlyArray<TokenUsageSample>): TokenUsageStats {
  const perThread = new Map<string, number>();
  const daily = new Map<string, number>();
  for (const sample of samples) {
    perThread.set(sample.threadId, (perThread.get(sample.threadId) ?? 0) + sample.tokens);
    daily.set(sample.date, (daily.get(sample.date) ?? 0) + sample.tokens);
  }
  let lifetimeTokens = 0;
  let peakThreadTokens = 0;
  for (const tokens of perThread.values()) {
    lifetimeTokens += tokens;
    peakThreadTokens = Math.max(peakThreadTokens, tokens);
  }
  return {
    lifetimeTokens,
    peakThreadTokens,
    trackedThreads: perThread.size,
    daily: [...daily.entries()]
      .map(([date, tokens]) => ({ date, tokens }))
      .toSorted((left, right) => left.date.localeCompare(right.date)),
  };
}

interface LegacyTokenRow {
  readonly threadId: string;
  readonly totalProcessed: unknown;
  readonly used: unknown;
  readonly createdAt: string;
}

/**
 * The last usable cumulative count of each V1 thread, from its
 * `context-window.updated` activities in sequence order. The After Dark
 * migration that preserves V1 totals stores these.
 */
export function latestLegacyTokenSamples(rows: ReadonlyArray<LegacyTokenRow>): ReadonlyArray<{
  readonly threadId: string;
  readonly tokens: number;
  readonly sampledAt: string;
}> {
  const latest = new Map<string, { threadId: string; tokens: number; sampledAt: string }>();
  for (const row of rows) {
    const tokens = tokenCount(row.totalProcessed) ?? tokenCount(row.used);
    if (tokens !== null) {
      latest.set(row.threadId, { threadId: row.threadId, tokens, sampledAt: row.createdAt });
    }
  }
  return [...latest.values()];
}

/**
 * Lifetime token usage across orchestration V2 provider threads and the
 * frozen V1 totals the After Dark ledger preserved.
 */
export const readTokenUsageStats = Effect.fn("readTokenUsageStats")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const legacyRows = yield* sql<{
    readonly threadId: string;
    readonly tokens: number;
    readonly sampledAt: string;
  }>`
    SELECT thread_id AS "threadId", tokens, sampled_at AS "sampledAt"
    FROM after_dark_legacy_token_usage
  `;
  const providerRows = yield* sql<{
    readonly threadId: string | null;
    readonly totalProcessed: unknown;
    readonly used: unknown;
    readonly updatedAt: string;
  }>`
    SELECT thread_id AS "threadId",
      json_extract(payload_json, '$.contextUsage.totalProcessedTokens') AS "totalProcessed",
      json_extract(payload_json, '$.contextUsage.usedTokens') AS "used",
      updated_at AS "updatedAt"
    FROM orchestration_v2_projection_provider_threads
    WHERE json_valid(payload_json)
      AND json_extract(payload_json, '$.contextUsage') IS NOT NULL
  `;
  const samples: Array<TokenUsageSample> = legacyRows.map((row) => ({
    threadId: row.threadId,
    tokens: row.tokens,
    date: row.sampledAt.slice(0, 10),
  }));
  for (const row of providerRows) {
    const tokens = tokenCount(row.totalProcessed) ?? tokenCount(row.used);
    if (tokens !== null && row.threadId !== null) {
      samples.push({ threadId: row.threadId, tokens, date: row.updatedAt.slice(0, 10) });
    }
  }
  return summarizeTokenUsage(samples);
});
