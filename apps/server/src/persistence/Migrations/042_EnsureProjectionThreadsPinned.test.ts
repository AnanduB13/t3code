import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("042_EnsureProjectionThreadsPinned", (it) => {
  it.effect("repairs databases where the legacy queue migration occupied ID 36", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 35 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (36, 'ProjectionQueuedMessages')
      `;

      yield* runMigrations({ toMigrationInclusive: 42 });

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      assert.ok(columns.some((column) => column.name === "pinned_at"));

      const migrations = yield* sql<{ readonly migration_id: number; readonly name: string }>`
        SELECT migration_id, name
        FROM effect_sql_migrations
        WHERE migration_id = 42
      `;
      assert.deepStrictEqual(migrations, [
        {
          migration_id: 42,
          name: "EnsureProjectionThreadsPinned",
        },
      ]);
    }),
  );
});
