import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { latestLegacyTokenSamples } from "../../usage/tokenUsageStats.ts";

/**
 * Keeps each V1 thread's final token count for lifetime usage. Upstream
 * migration 63 drops `projection_thread_activities`, and this ledger runs
 * before it, so the frozen V1 totals survive in one row per thread.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS after_dark_legacy_token_usage (
      thread_id TEXT PRIMARY KEY,
      tokens INTEGER NOT NULL,
      sampled_at TEXT NOT NULL
    )
  `;
  const source = yield* sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projection_thread_activities'
  `;
  if (source.length === 0) return;
  const rows = yield* sql<{
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
  for (const sample of latestLegacyTokenSamples(rows)) {
    yield* sql`
      INSERT OR IGNORE INTO after_dark_legacy_token_usage (thread_id, tokens, sampled_at)
      VALUES (${sample.threadId}, ${sample.tokens}, ${sample.sampledAt})
    `;
  }
});
