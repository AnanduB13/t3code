import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import AuthSessionClientConnection from "./041_AuthSessionClientConnection.ts";
import ProjectionThreadLinkedPullRequest from "./042_ProjectionThreadLinkedPullRequest.ts";
import ProjectionThreadsUnsettledAt from "./043_ProjectionThreadsUnsettledAt.ts";

/**
 * After Dark previously used migration IDs 41-43 for queued prompts. Replay
 * the upstream additions idempotently, then ensure the After Dark queue schema
 * exists, so both histories converge without discarding either feature set.
 */
export default Effect.gen(function* () {
  yield* AuthSessionClientConnection;
  yield* ProjectionThreadLinkedPullRequest;
  yield* ProjectionThreadsUnsettledAt;

  const sql = yield* SqlClient.SqlClient;
  const threadColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  if (!threadColumns.some((column) => column.name === "pinned_at")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN pinned_at TEXT
    `;
  }

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_queued_messages (
      message_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      text TEXT NOT NULL,
      attachments_json TEXT NOT NULL,
      model_selection_json TEXT,
      source_proposed_plan_thread_id TEXT,
      source_proposed_plan_id TEXT,
      queued_at TEXT NOT NULL,
      queue_position INTEGER NOT NULL DEFAULT 0
    )
  `;

  const queueColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_queued_messages)
  `;
  if (!queueColumns.some((column) => column.name === "queue_position")) {
    yield* sql`
      ALTER TABLE projection_queued_messages
      ADD COLUMN queue_position INTEGER NOT NULL DEFAULT 0
    `;
    yield* sql`
      UPDATE projection_queued_messages AS queued
      SET queue_position = (
        SELECT COUNT(*) - 1
        FROM projection_queued_messages AS earlier
        WHERE earlier.thread_id = queued.thread_id
          AND earlier.rowid <= queued.rowid
      )
    `;
  }

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_queued_messages_thread
    ON projection_queued_messages(thread_id)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_queued_messages_order
    ON projection_queued_messages(thread_id, queue_position)
  `;
});
