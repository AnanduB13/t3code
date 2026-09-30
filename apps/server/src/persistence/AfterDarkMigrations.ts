import * as Effect from "effect/Effect";
import * as Migrator from "effect/unstable/sql/Migrator";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import AfterDarkCompatibility from "./Migrations/044_AfterDarkUpstreamCompatibility.ts";
import ClearAutomaticProjectModelDefaults from "./Migrations/044_ClearAutomaticProjectModelDefaults.ts";
import ProjectionProjectsAutoPull from "./Migrations/045_ProjectionProjectsAutoPull.ts";
import ProjectionThreadLastVisitedAt from "./Migrations/045_ProjectionThreadLastVisitedAt.ts";
import ProjectionThreadsAutoSettleDisabledAt from "./Migrations/054_ProjectionThreadsAutoSettleDisabledAt.ts";

const repairSkippedUpstreamMigrations = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const history = yield* sql<{ readonly migration_id: number; readonly name: string }>`
    SELECT migration_id, name FROM effect_sql_migrations WHERE migration_id IN (44, 45)
  `;
  if (
    history.some((row) => row.migration_id === 44 && row.name === "AfterDarkUpstreamCompatibility")
  ) {
    yield* ClearAutomaticProjectModelDefaults;
  }
  if (
    history.some((row) => row.migration_id === 45 && row.name === "ProjectionThreadLastVisitedAt")
  ) {
    yield* ProjectionProjectsAutoPull;
  }
});

const addQueuedMessageContext = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{
    readonly name: string;
  }>`PRAGMA table_info(projection_queued_messages)`;
  if (!columns.some((column) => column.name === "context_json")) {
    yield* sql`ALTER TABLE projection_queued_messages ADD COLUMN context_json TEXT`;
  }
});

const addQueuedMessageHold = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{
    readonly name: string;
  }>`PRAGMA table_info(projection_queued_messages)`;
  if (!columns.some((column) => column.name === "hold_until_user_action")) {
    yield* sql`ALTER TABLE projection_queued_messages ADD COLUMN hold_until_user_action INTEGER NOT NULL DEFAULT 0`;
  }
});

const repairLegacyMainCompatibility = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const history = yield* sql<{ readonly name: string }>`
    SELECT name FROM effect_sql_migrations WHERE migration_id = 54
  `;
  if (history.some((row) => row.name === "AfterDarkMainCompatibility")) {
    yield* ProjectionThreadsAutoSettleDisabledAt;
  }
});

const run = Migrator.make({});

/** Runs fork additions separately, including repairs for old shared migration IDs. */
export const runAfterDarkMigrations = (throughUpstreamId?: number) =>
  run({
    table: "after_dark_migrations",
    loader: Migrator.fromRecord({
      "1_QueueAndLegacyCompatibility": AfterDarkCompatibility,
      ...(throughUpstreamId === undefined || throughUpstreamId >= 45
        ? {
            "2_ThreadLastVisitedAt": ProjectionThreadLastVisitedAt,
            "3_RepairSkippedUpstreamMigrations": repairSkippedUpstreamMigrations,
            "4_QueuedMessageContext": addQueuedMessageContext,
            "5_QueuedMessageHold": addQueuedMessageHold,
            "6_RepairLegacyMainCompatibility": repairLegacyMainCompatibility,
          }
        : {}),
    }),
  });
