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

/**
 * Lifetime token usage across orchestration V2 provider threads and the
 * frozen V1 history copied into this database.
 */
export const readTokenUsageStats = Effect.fn("readTokenUsageStats")(function* () {
  const sql = yield* SqlClient.SqlClient;
  // V1 rows stop growing after the V2 cutover; the last snapshot per thread wins.
  const legacyRows = yield* sql<{
    readonly threadId: string;
    readonly totalProcessed: unknown;
    readonly used: unknown;
    readonly createdAt: string;
  }>`
    SELECT thread_id AS "threadId",
      json_extract(payload_json, '$.totalProcessedTokens') AS "totalProcessed",
      json_extract(payload_json, '$.usedTokens') AS "used",
      created_at AS "createdAt"
    FROM projection_thread_activities
    WHERE kind = 'context-window.updated' AND json_valid(payload_json)
    ORDER BY thread_id ASC, sequence ASC, created_at ASC, activity_id ASC
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
  const latestLegacy = new Map<string, TokenUsageSample>();
  for (const row of legacyRows) {
    const tokens = tokenCount(row.totalProcessed) ?? tokenCount(row.used);
    if (tokens !== null) {
      latestLegacy.set(row.threadId, {
        threadId: row.threadId,
        tokens,
        date: row.createdAt.slice(0, 10),
      });
    }
  }
  const samples: Array<TokenUsageSample> = [...latestLegacy.values()];
  for (const row of providerRows) {
    const tokens = tokenCount(row.totalProcessed) ?? tokenCount(row.used);
    if (tokens !== null && row.threadId !== null) {
      samples.push({ threadId: row.threadId, tokens, date: row.updatedAt.slice(0, 10) });
    }
  }
  return summarizeTokenUsage(samples);
});
