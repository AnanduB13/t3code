import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "../Migrations.ts";
import Queue from "./036_ProjectionQueuedMessages.ts";
import QueuePosition from "./043_ProjectionQueuedMessagePosition.ts";
import AfterDarkCompatibility from "./044_AfterDarkUpstreamCompatibility.ts";
import LastVisitedAt from "./045_ProjectionThreadLastVisitedAt.ts";

for (const history of ["fresh", "after-dark-43", "after-dark-45", "upstream-53"] as const) {
  it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))(
    `054 compatibility: ${history}`,
    (it) => {
      it.effect(
        "converges without losing saved threads, queue order, read state or explicit project defaults",
        () =>
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            const now = "2026-09-02T12:00:00.000Z";
            const model = JSON.stringify({ instanceId: "codex", model: "custom-model" });
            if (history === "fresh") {
              yield* runMigrations();
            } else {
              if (history === "upstream-53") {
                yield* runMigrations({ toMigrationInclusive: 53 });
                // Emulate an upstream installation without either After Dark extension.
                yield* sql`DROP TABLE projection_queued_messages`;
                yield* sql`ALTER TABLE projection_threads DROP COLUMN last_visited_at`;
              } else {
                yield* runMigrations({ toMigrationInclusive: 40 });
                yield* Queue;
                yield* QueuePosition;
                yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES
              (41, 'ProjectionQueuedMessages'), (42, 'EnsureProjectionThreadsPinned'),
              (43, 'ProjectionQueuedMessagePosition')`;
                if (history === "after-dark-45") {
                  yield* AfterDarkCompatibility;
                  yield* LastVisitedAt;
                  yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES
                (44, 'AfterDarkUpstreamCompatibility'), (45, 'ProjectionThreadLastVisitedAt')`;
                }
                yield* sql`INSERT INTO projection_queued_messages
              (message_id, thread_id, text, attachments_json, queued_at, queue_position)
              VALUES ('second', 'thread', 'second prompt', '[]', ${now}, 0),
                ('first', 'thread', 'first prompt', '[]', ${now}, 1)`;
              }
              yield* sql`INSERT INTO projection_projects
            (project_id, title, workspace_root, scripts_json, default_model_selection_json, created_at, updated_at)
            VALUES ('project', 'My project', '/project', '[]', ${model}, ${now}, ${now})`;
              yield* sql`INSERT INTO projection_threads
            (thread_id, project_id, title, model_selection_json, created_at, updated_at, pinned_at, pin_order_key)
            VALUES ('thread', 'project', 'Keep my chat', ${model}, ${now}, ${now}, ${now}, 'm')`;
              for (const [index, eventType] of [
                "project.created",
                "project.meta-updated",
              ].entries()) {
                yield* sql`INSERT INTO orchestration_events
              (event_id, aggregate_kind, stream_id, stream_version, event_type, occurred_at, actor_kind, payload_json, metadata_json)
              VALUES (${`event-${index}`}, 'project', 'project', ${index + 1}, ${eventType}, ${now}, 'user',
                ${JSON.stringify({ defaultModelSelection: JSON.parse(model) })}, '{}')`;
              }
              if (history === "after-dark-45") {
                yield* sql`UPDATE projection_threads SET last_visited_at = ${now}`;
              }
              yield* runMigrations();
              const threads =
                yield* sql`SELECT title, pinned_at, pin_order_key, last_visited_at FROM projection_threads`;
              assert.deepEqual(threads, [
                {
                  title: "Keep my chat",
                  pinned_at: now,
                  pin_order_key: "m",
                  last_visited_at: history === "after-dark-45" ? now : null,
                },
              ]);
              const projects =
                yield* sql`SELECT default_model_selection_json, auto_pull FROM projection_projects`;
              assert.deepEqual(projects, [{ default_model_selection_json: model, auto_pull: 0 }]);
              if (history !== "upstream-53") {
                assert.deepEqual(
                  yield* sql`SELECT message_id, text, context_json FROM projection_queued_messages ORDER BY queue_position`,
                  [
                    { message_id: "second", text: "second prompt", context_json: null },
                    { message_id: "first", text: "first prompt", context_json: null },
                  ],
                );
              }
            }
            const context = JSON.stringify({ version: 1, records: [] });
            yield* sql`INSERT INTO projection_queued_messages
          (message_id, thread_id, text, attachments_json, queued_at, queue_position, context_json)
          VALUES ('context', 'thread', 'context prompt', '[]', ${now}, 2, ${context})`;
            yield* runMigrations();
            assert.deepEqual(
              yield* sql`SELECT context_json FROM projection_queued_messages WHERE message_id = 'context'`,
              [{ context_json: context }],
            );
            assert.equal(
              (yield* sql`SELECT migration_id FROM effect_sql_migrations WHERE migration_id = 54`)
                .length,
              1,
            );
          }),
      );
    },
  );
}
