import { assert, it } from "@effect/vitest";
import { MessageId, ThreadId, type OrchestrationMessageContext } from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "./Migrations.ts";
import compatibility from "./Migrations/044_AfterDarkUpstreamCompatibility.ts";
import lastVisited from "./Migrations/045_ProjectionThreadLastVisitedAt.ts";
import { ProjectionQueuedMessageRepositoryLive } from "./Layers/ProjectionQueuedMessages.ts";
import { ProjectionQueuedMessageRepository } from "./Services/ProjectionQueuedMessages.ts";

const now = "2026-09-01T00:00:00.000Z";
const context: OrchestrationMessageContext = {
  version: 1,
  records: [
    {
      version: 1,
      contextId: "skill_review" as OrchestrationMessageContext["records"][number]["contextId"],
      kind: "skill",
      label: "$review",
      name: "review",
    },
  ],
};

it.effect("upgrades the old After Dark ledger without losing queues, read state, or pins", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 40 });
    yield* compatibility;
    yield* lastVisited;
    yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES
      (41, 'ProjectionQueuedMessages'), (42, 'EnsureProjectionThreadsPinned'),
      (43, 'ProjectionQueuedMessagePosition'), (44, 'AfterDarkUpstreamCompatibility'),
      (45, 'ProjectionThreadLastVisitedAt')`;
    yield* sql`INSERT INTO projection_threads
      (thread_id, project_id, title, model_selection_json, created_at, updated_at, pinned_at, last_visited_at)
      VALUES ('thread-1', 'project-1', 'Keep this chat', '{"instanceId":"codex","model":"gpt-5.4"}', ${now}, ${now}, ${now}, ${now})`;
    yield* sql`INSERT INTO projection_queued_messages
      (message_id, thread_id, text, attachments_json, queued_at, queue_position)
      VALUES ('queued-1', 'thread-1', 'Keep this prompt', '[]', ${now}, 3)`;
    yield* runMigrations();
    assert.deepEqual(yield* runMigrations(), []);
    const threads =
      yield* sql`SELECT title, pinned_at, last_visited_at, active_order_key, auto_settle_disabled_at FROM projection_threads`;
    assert.deepEqual(threads, [
      {
        title: "Keep this chat",
        pinned_at: now,
        last_visited_at: now,
        active_order_key: null,
        auto_settle_disabled_at: null,
      },
    ]);
    const queued =
      yield* sql`SELECT text, queue_position, context_json, hold_until_user_action FROM projection_queued_messages`;
    assert.deepEqual(queued, [
      {
        text: "Keep this prompt",
        queue_position: 3,
        context_json: null,
        hold_until_user_action: 0,
      },
    ]);
    const projectColumns = yield* sql<{ name: string }>`PRAGMA table_info(projection_projects)`;
    assert.ok(projectColumns.some((column) => column.name === "auto_pull"));
    const forkLedger =
      yield* sql`SELECT migration_id FROM after_dark_migrations ORDER BY migration_id`;
    assert.deepEqual(
      forkLedger,
      [1, 2, 3, 4, 5, 6].map((migration_id) => ({ migration_id })),
    );
    const latest = yield* sql`SELECT MAX(migration_id) AS id FROM effect_sql_migrations`;
    assert.deepEqual(latest, [{ id: 54 }]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("repairs the deployed After Dark migration 54 without changing saved threads", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 53 });
    yield* sql`DELETE FROM after_dark_migrations WHERE migration_id = 6`;
    yield* sql`INSERT INTO effect_sql_migrations (migration_id, name)
      VALUES (54, 'AfterDarkMainCompatibility')`;
    yield* sql`INSERT INTO projection_threads
      (thread_id, project_id, title, model_selection_json, created_at, updated_at, pinned_at, last_visited_at)
      VALUES ('thread-1', 'project-1', 'Keep this chat', '{"instanceId":"codex","model":"gpt-5.4"}', ${now}, ${now}, ${now}, ${now})`;

    yield* runMigrations();
    assert.deepEqual(
      yield* sql`SELECT title, pinned_at, last_visited_at, auto_settle_disabled_at FROM projection_threads`,
      [
        {
          title: "Keep this chat",
          pinned_at: now,
          last_visited_at: now,
          auto_settle_disabled_at: null,
        },
      ],
    );
    yield* sql`UPDATE projection_threads SET auto_settle_disabled_at = ${now} WHERE thread_id = 'thread-1'`;
    assert.deepEqual(yield* runMigrations(), []);
    assert.deepEqual(yield* sql`SELECT auto_settle_disabled_at FROM projection_threads`, [
      { auto_settle_disabled_at: now },
    ]);
    assert.deepEqual(yield* sql`SELECT name FROM effect_sql_migrations WHERE migration_id = 54`, [
      { name: "AfterDarkMainCompatibility" },
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("adds fork state to an existing OG database without replaying upstream changes", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations();
    // Remove only fork additions to reproduce OG's current schema and ledger.
    yield* sql`DROP TABLE after_dark_migrations`;
    yield* sql`DROP TABLE projection_queued_messages`;
    yield* sql`ALTER TABLE projection_threads DROP COLUMN last_visited_at`;
    yield* runMigrations();
    assert.deepEqual(yield* runMigrations(), []);
    const columns = yield* sql<{ name: string }>`PRAGMA table_info(projection_queued_messages)`;
    assert.ok(columns.some((column) => column.name === "context_json"));
    assert.ok(columns.some((column) => column.name === "hold_until_user_action"));
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("persists queued context and Stop holds while editing and reordering prompts", () =>
  Effect.gen(function* () {
    yield* runMigrations();
    const queues = yield* ProjectionQueuedMessageRepository;
    const threadId = ThreadId.make("thread-1");
    const messageId = MessageId.make("queued-1");
    yield* queues.upsert({
      messageId,
      threadId,
      text: "Review",
      attachments: [],
      context,
      modelSelection: null,
      sourceProposedPlanThreadId: null,
      sourceProposedPlanId: null,
      queuedAt: now,
    });
    yield* queues.updateText({
      threadId,
      messageId,
      text: "Review carefully",
      holdUntilUserAction: true,
    });
    yield* queues.reorder({ threadId, messageIds: [messageId] });
    const rows = yield* queues.listByThreadId({ threadId });
    assert.deepEqual(rows[0]?.context, context);
    assert.equal(rows[0]?.holdUntilUserAction, true);
    assert.equal(rows[0]?.text, "Review carefully");
    yield* queues.updateText({
      threadId,
      messageId,
      text: "Review now",
      holdUntilUserAction: false,
    });
    assert.equal((yield* queues.listByThreadId({ threadId }))[0]?.holdUntilUserAction, false);
  }).pipe(
    Effect.provide(
      ProjectionQueuedMessageRepositoryLive.pipe(
        Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })),
      ),
    ),
  ),
);
