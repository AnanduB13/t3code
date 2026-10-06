import {
  ChatAttachment,
  CommandId,
  MessageId,
  ModelSelection,
  OrchestrationMessageContext,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import * as ThreadManagementService from "../ThreadManagementService.ts";

interface LegacyQueuedMessageRow {
  readonly message_id: string;
  readonly thread_id: string;
  readonly text: string;
  readonly attachments_json: string;
  readonly context_json: string | null;
  readonly model_selection_json: string | null;
}

const decodeAttachments = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(ChatAttachment)),
);
const decodeContext = Schema.decodeUnknownOption(
  Schema.fromJsonString(OrchestrationMessageContext),
);
const decodeModelSelection = Schema.decodeUnknownOption(Schema.fromJsonString(ModelSelection));

/** Deterministic, so a retried import replays the recorded receipt instead of queueing twice. */
export const legacyQueuedMessageCommandId = (messageId: string) =>
  CommandId.make(`migration:v1:queued:${messageId}`);

/**
 * Re-queues the prompts After Dark's V1 queue still held at the V2 cutover.
 * Each becomes a held queued run on its thread through the normal
 * `message.dispatch` path, in its V1 order, so nothing sends until the user
 * resumes the queue. V1 rows stay in place as the import source;
 * `after_dark_legacy_queue_imports` records each attempt so a prompt the user
 * later cancels never returns.
 */
export const importLegacyQueuedMessages = Effect.fn("importLegacyQueuedMessages")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const threads = yield* ThreadManagementService.ThreadManagementService;
  const tables = yield* sql<{ readonly name: string }>`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = 'projection_queued_messages'
  `;
  if (tables.length === 0) return 0;
  const rows = yield* sql<LegacyQueuedMessageRow>`
    SELECT
      queued.message_id,
      queued.thread_id,
      queued.text,
      queued.attachments_json,
      queued.context_json,
      queued.model_selection_json
    FROM projection_queued_messages AS queued
    INNER JOIN projection_threads AS thread ON thread.thread_id = queued.thread_id
    WHERE thread.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM after_dark_legacy_queue_imports AS done
        WHERE done.message_id = queued.message_id
      )
    ORDER BY queued.thread_id ASC, queued.queue_position ASC, queued.rowid ASC
  `;
  let imported = 0;
  for (const row of rows) {
    const context =
      row.context_json === null ? Option.none() : decodeContext(row.context_json);
    const modelSelection =
      row.model_selection_json === null
        ? Option.none()
        : decodeModelSelection(row.model_selection_json);
    const failure = yield* threads
      .dispatch({
        type: "message.dispatch",
        commandId: legacyQueuedMessageCommandId(row.message_id),
        threadId: ThreadId.make(row.thread_id),
        messageId: MessageId.make(row.message_id),
        text: row.text,
        attachments: Option.getOrElse(decodeAttachments(row.attachments_json), () => []),
        ...(Option.isSome(context) ? { context: context.value } : {}),
        ...(Option.isSome(modelSelection) ? { modelSelection: modelSelection.value } : {}),
        createdBy: "user",
        creationSource: "server",
        dispatchMode: { type: "queue_after_active" },
        queueHeld: true,
      })
      .pipe(
        Effect.as(null),
        Effect.catch((error) =>
          Effect.logWarning("Could not import a legacy queued prompt", {
            threadId: row.thread_id,
            messageId: row.message_id,
            cause: error,
          }).pipe(Effect.as(error.message)),
        ),
      );
    const importedAt = DateTime.formatIso(yield* DateTime.now);
    yield* sql`
      INSERT INTO after_dark_legacy_queue_imports (message_id, thread_id, imported_at, error)
      VALUES (${row.message_id}, ${row.thread_id}, ${importedAt}, ${failure})
      ON CONFLICT(message_id) DO NOTHING
    `;
    if (failure === null) imported += 1;
  }
  return imported;
});
