import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import AfterDarkCompatibility from "./044_AfterDarkUpstreamCompatibility.ts";
import ClearAutomaticProjectModelDefaults from "./044_ClearAutomaticProjectModelDefaults.ts";
import LastVisitedAt from "./045_ProjectionThreadLastVisitedAt.ts";
import ProjectsAutoPull from "./045_ProjectionProjectsAutoPull.ts";

/** Converges existing After Dark and upstream databases without renumbering either history. */
export default Effect.gen(function* () {
  yield* AfterDarkCompatibility;
  yield* LastVisitedAt;
  yield* ProjectsAutoPull;

  const sql = yield* SqlClient.SqlClient;
  const previous = yield* sql<{ readonly name: string }>`
    SELECT name FROM effect_sql_migrations WHERE migration_id = 44
  `;
  if (previous.some((migration) => migration.name === "AfterDarkUpstreamCompatibility")) {
    yield* ClearAutomaticProjectModelDefaults;
  }

  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_queued_messages)
  `;
  if (!columns.some((column) => column.name === "context_json")) {
    yield* sql`ALTER TABLE projection_queued_messages ADD COLUMN context_json TEXT`;
  }
});
