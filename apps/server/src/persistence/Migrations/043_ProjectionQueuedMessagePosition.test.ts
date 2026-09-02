import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("043_ProjectionQueuedMessagePosition", (it) => {
  it.effect("backfills stable per-thread queue positions in insertion order", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 43 });
      yield* sql`
        CREATE TABLE projection_queued_messages (
          message_id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          text TEXT NOT NULL,
          attachments_json TEXT NOT NULL,
          model_selection_json TEXT,
          source_proposed_plan_thread_id TEXT,
          source_proposed_plan_id TEXT,
          queued_at TEXT NOT NULL
        )
      `;
      for (const [messageId, threadId] of [
        ["message-a", "thread-1"],
        ["message-b", "thread-2"],
        ["message-c", "thread-1"],
      ] as const) {
        yield* sql`
          INSERT INTO projection_queued_messages (
            message_id, thread_id, text, attachments_json, queued_at
          ) VALUES (
            ${messageId}, ${threadId}, ${messageId}, '[]', '2026-08-16T00:00:00.000Z'
          )
        `;
      }

      yield* runMigrations({ toMigrationInclusive: 44 });

      const rows = yield* sql<{
        readonly messageId: string;
        readonly threadId: string;
        readonly queuePosition: number;
      }>`
        SELECT
          message_id AS "messageId",
          thread_id AS "threadId",
          queue_position AS "queuePosition"
        FROM projection_queued_messages
        ORDER BY rowid ASC
      `;
      assert.deepStrictEqual(rows, [
        { messageId: "message-a", threadId: "thread-1", queuePosition: 0 },
        { messageId: "message-b", threadId: "thread-2", queuePosition: 0 },
        { messageId: "message-c", threadId: "thread-1", queuePosition: 1 },
      ]);
    }),
  );
});
