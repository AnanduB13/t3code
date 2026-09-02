import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";
import ProjectionQueuedMessages from "./036_ProjectionQueuedMessages.ts";
import ProjectionQueuedMessagePosition from "./043_ProjectionQueuedMessagePosition.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("044_AfterDarkUpstreamCompatibility legacy history", (it) => {
  it.effect("replays upstream migrations skipped by an existing After Dark database", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 40 });
      yield* ProjectionQueuedMessages;
      yield* ProjectionQueuedMessagePosition;
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name) VALUES
          (41, 'ProjectionQueuedMessages'),
          (42, 'EnsureProjectionThreadsPinned'),
          (43, 'ProjectionQueuedMessagePosition')
      `;

      yield* runMigrations({ toMigrationInclusive: 44 });

      const authColumns = yield* sql<{ readonly name: string }>`PRAGMA table_info(auth_sessions)`;
      const threadColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      const queueColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_queued_messages)
      `;
      assert.ok(authColumns.some((column) => column.name === "client_surface"));
      assert.ok(authColumns.some((column) => column.name === "client_app_version"));
      assert.ok(threadColumns.some((column) => column.name === "linked_pull_request_json"));
      assert.ok(threadColumns.some((column) => column.name === "unsettled_at"));
      assert.ok(threadColumns.some((column) => column.name === "pinned_at"));
      assert.ok(queueColumns.some((column) => column.name === "queue_position"));
    }),
  );
});
