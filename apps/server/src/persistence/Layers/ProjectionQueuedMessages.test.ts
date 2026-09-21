import { ComposerContextId, MessageId, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  ProjectionQueuedMessageRepository,
  type ProjectionQueuedMessage,
} from "../Services/ProjectionQueuedMessages.ts";
import { ProjectionQueuedMessageRepositoryLive } from "./ProjectionQueuedMessages.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(
  ProjectionQueuedMessageRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

layer("ProjectionQueuedMessageRepository", (it) => {
  it.effect(
    "retains rich context through queue reloads, edits and reorder without affecting another thread",
    () =>
      Effect.gen(function* () {
        const repository = yield* ProjectionQueuedMessageRepository;
        const threadId = ThreadId.make("queue-thread");
        const first: ProjectionQueuedMessage = {
          messageId: MessageId.make("queue-first"),
          threadId,
          text: "Review this file",
          attachments: [],
          context: {
            version: 1,
            records: [
              {
                version: 1,
                contextId: ComposerContextId.make("file"),
                kind: "mention",
                label: "@src/app.ts",
                path: "src/app.ts",
              },
            ],
          },
          modelSelection: null,
          sourceProposedPlanThreadId: null,
          sourceProposedPlanId: null,
          queuedAt: "2026-09-20T00:00:00.000Z",
        };
        const { context: _context, ...withoutContext } = first;
        const second = {
          ...withoutContext,
          messageId: MessageId.make("queue-second"),
          text: "A plain follow-up",
        };
        const other = {
          ...first,
          messageId: MessageId.make("queue-other"),
          threadId: ThreadId.make("other-thread"),
        };
        for (const message of [first, second, other]) yield* repository.upsert(message);
        assert.deepStrictEqual(yield* repository.listByThreadId({ threadId }), [first, second]);
        yield* repository.updateText({
          threadId,
          messageId: first.messageId,
          text: "Review this file carefully",
        });
        yield* repository.reorder({ threadId, messageIds: [second.messageId, first.messageId] });
        assert.deepStrictEqual(yield* repository.listByThreadId({ threadId }), [
          second,
          { ...first, text: "Review this file carefully" },
        ]);
        assert.deepStrictEqual(yield* repository.listByThreadId({ threadId: other.threadId }), [
          other,
        ]);
        yield* repository.deleteByMessageId({ threadId, messageId: second.messageId });
        assert.strictEqual((yield* repository.listByThreadId({ threadId })).length, 1);
        yield* repository.deleteByThreadId({ threadId });
        assert.deepStrictEqual(yield* repository.listByThreadId({ threadId }), []);
        assert.deepStrictEqual(yield* repository.listByThreadId({ threadId: other.threadId }), [
          other,
        ]);
      }),
  );
});
