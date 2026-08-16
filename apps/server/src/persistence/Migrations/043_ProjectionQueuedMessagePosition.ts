import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

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

  yield* sql`
    CREATE INDEX idx_projection_queued_messages_order
    ON projection_queued_messages(thread_id, queue_position)
  `;
});
