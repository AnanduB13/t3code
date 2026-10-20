import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { readTokenUsageStats } from "../../usage/tokenUsageStats.ts";
import { runMigrations } from "../Migrations.ts";

const layer = it.layer(NodeSqliteClient.layer({ filename: ":memory:" }));

layer("After Dark legacy token usage", (it) => {
  it.effect("keeps V1 lifetime usage after upstream drops the V1 activities", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 43 });
      yield* sql`
        INSERT INTO projection_thread_activities
          (activity_id, thread_id, turn_id, tone, kind, summary, payload_json, created_at, sequence)
        VALUES
          ('a-1', 'thread-1', NULL, 'info', 'context-window.updated', '',
            '{"totalProcessedTokens":100}', '2026-09-01T00:00:00.000Z', 1),
          ('a-2', 'thread-1', NULL, 'info', 'context-window.updated', '',
            '{"totalProcessedTokens":250}', '2026-09-02T00:00:00.000Z', 2),
          ('a-3', 'thread-1', NULL, 'info', 'context-window.updated', '',
            '{"totalProcessedTokens":null}', '2026-09-03T00:00:00.000Z', 3),
          ('b-1', 'thread-2', NULL, 'info', 'context-window.updated', '',
            '{"usedTokens":40}', '2026-09-02T00:00:00.000Z', 1)
      `;

      yield* runMigrations();

      const tables = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projection_thread_activities'
      `;
      assert.equal(tables.length, 0);
      const stats = yield* readTokenUsageStats();
      assert.equal(stats.lifetimeTokens, 290);
      assert.equal(stats.trackedThreads, 2);
      assert.deepEqual(stats.daily, [{ date: "2026-09-02", tokens: 290 }]);
    }),
  );
});
