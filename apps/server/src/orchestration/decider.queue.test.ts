import {
  ClientOrchestrationCommand,
  CommandId,
  ComposerContextId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationEvent,
  type OrchestrationReadModel,
  type OrchestrationSessionStatus,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const decodeClientCommand = Schema.decodeUnknownEffect(ClientOrchestrationCommand);

const NOW = "2026-01-01T00:00:00.000Z";
const asCommandId = (value: string): CommandId => CommandId.make(value);
const asEventId = (value: string): EventId => EventId.make(value);
const asMessageId = (value: string): MessageId => MessageId.make(value);
const asProjectId = (value: string): ProjectId => ProjectId.make(value);
const asThreadId = (value: string): ThreadId => ThreadId.make(value);

const THREAD_ID = asThreadId("thread-queue");

const seedReadModel = Effect.gen(function* () {
  const initial = createEmptyReadModel(NOW);
  const withProject = yield* projectEvent(initial, {
    sequence: 1,
    eventId: asEventId("evt-project-create"),
    aggregateKind: "project",
    aggregateId: asProjectId("project-queue"),
    type: "project.created",
    occurredAt: NOW,
    commandId: asCommandId("cmd-project-create"),
    causationEventId: null,
    correlationId: asCommandId("cmd-project-create"),
    metadata: {},
    payload: {
      projectId: asProjectId("project-queue"),
      title: "Project Queue",
      workspaceRoot: "/tmp/project-queue",
      defaultModelSelection: null,
      scripts: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
  });

  return yield* projectEvent(withProject, {
    sequence: 2,
    eventId: asEventId("evt-thread-create"),
    aggregateKind: "thread",
    aggregateId: THREAD_ID,
    type: "thread.created",
    occurredAt: NOW,
    commandId: asCommandId("cmd-thread-create"),
    causationEventId: null,
    correlationId: asCommandId("cmd-thread-create"),
    metadata: {},
    payload: {
      threadId: THREAD_ID,
      projectId: asProjectId("project-queue"),
      title: "Thread Queue",
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5-codex",
      },
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "full-access",
      branch: null,
      worktreePath: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
  });
});

const withSessionStatus = (
  readModel: OrchestrationReadModel,
  status: OrchestrationSessionStatus,
  sequence: number,
) =>
  projectEvent(readModel, {
    sequence,
    eventId: asEventId(`evt-session-${status}-${sequence}`),
    aggregateKind: "thread",
    aggregateId: THREAD_ID,
    type: "thread.session-set",
    occurredAt: NOW,
    commandId: asCommandId(`cmd-session-${status}-${sequence}`),
    causationEventId: null,
    correlationId: null,
    metadata: {},
    payload: {
      threadId: THREAD_ID,
      session: {
        threadId: THREAD_ID,
        status,
        providerName: "codex",
        runtimeMode: "full-access",
        activeTurnId: status === "running" ? TurnId.make("turn-active") : null,
        lastError: null,
        updatedAt: NOW,
      },
    },
  });

const turnStartCommand = (suffix: string) =>
  ({
    type: "thread.turn.start",
    commandId: asCommandId(`cmd-turn-start-${suffix}`),
    threadId: THREAD_ID,
    message: {
      messageId: asMessageId(`message-${suffix}`),
      role: "user",
      text: `Follow up ${suffix}`,
      attachments: [],
    },
    runtimeMode: "full-access",
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    createdAt: NOW,
  }) as const;

const IMAGE_ATTACHMENT = {
  type: "image" as const,
  id: "thread-queue-image",
  name: "queued-image.png",
  mimeType: "image/png",
  sizeBytes: 1_024,
};

const applyPlanned = (
  readModel: OrchestrationReadModel,
  planned:
    | Omit<OrchestrationEvent, "sequence">
    | ReadonlyArray<Omit<OrchestrationEvent, "sequence">>,
) =>
  Effect.gen(function* () {
    let nextReadModel = readModel;
    let nextSequence = readModel.snapshotSequence;
    for (const event of Array.isArray(planned) ? planned : [planned]) {
      nextSequence += 1;
      nextReadModel = yield* projectEvent(nextReadModel, { ...event, sequence: nextSequence });
    }
    return nextReadModel;
  });

it.layer(NodeServices.layer)("decider queue flows", (it) => {
  it.effect("starts a turn immediately when the thread is idle", () =>
    Effect.gen(function* () {
      const readModel = yield* seedReadModel;
      const planned = yield* decideOrchestrationCommand({
        command: turnStartCommand("idle"),
        readModel,
      });
      const events = Array.isArray(planned) ? planned : [planned];
      expect(events.map((event) => event.type)).toEqual([
        "thread.message-sent",
        "thread.turn-start-requested",
      ]);
    }),
  );

  it.effect(
    "explicit steering starts immediately without consuming previously queued prompts",
    () =>
      Effect.gen(function* () {
        let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
        readModel = yield* applyPlanned(
          readModel,
          yield* decideOrchestrationCommand({ command: turnStartCommand("waiting"), readModel }),
        );
        const projected = yield* applyPlanned(
          readModel,
          yield* decideOrchestrationCommand({
            command: { ...turnStartCommand("steer-now"), followUpBehavior: "steer" },
            readModel,
          }),
        );
        const thread = projected.threads.find((entry) => entry.id === THREAD_ID)!;
        expect(thread.queuedMessages.map((message) => message.messageId)).toEqual([
          asMessageId("message-waiting"),
        ]);
        expect(thread.messages.at(-1)?.text).toBe("Follow up steer-now");
        expect(thread.pendingTurnStart?.messageId).toBe(asMessageId("message-steer-now"));
      }),
  );

  it.effect("keeps rich context through queue persistence and multi-prompt steering", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      const records = [
        {
          version: 1 as const,
          contextId: ComposerContextId.make("first"),
          kind: "mention" as const,
          label: "@a.ts",
          path: "a.ts",
        },
        {
          version: 1 as const,
          contextId: ComposerContextId.make("second"),
          kind: "skill" as const,
          label: "$review",
          name: "review",
        },
      ];
      for (const [index, suffix] of ["first", "second"].entries()) {
        const command = turnStartCommand(suffix);
        readModel = yield* applyPlanned(
          readModel,
          yield* decideOrchestrationCommand({
            command: {
              ...command,
              message: { ...command.message, context: { version: 1, records: [records[index]!] } },
            },
            readModel,
          }),
        );
      }
      const thread = readModel.threads.find((entry) => entry.id === THREAD_ID)!;
      expect(thread.queuedMessages.flatMap((message) => message.context?.records ?? [])).toEqual(
        records,
      );
      const projected = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({
          command: {
            type: "thread.queue.steer",
            commandId: asCommandId("context-steer"),
            threadId: THREAD_ID,
            messageId: asMessageId("message-second"),
            messageIds: [asMessageId("message-second"), asMessageId("message-first")],
            createdAt: NOW,
          },
          readModel,
        }),
      );
      expect(
        projected.threads.find((entry) => entry.id === THREAD_ID)?.messages.at(-1)?.context,
      ).toEqual({ version: 1, records });
    }),
  );

  it.effect("rejects conflicting context IDs without dropping either queued prompt", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      for (const suffix of ["first", "second"]) {
        const command = turnStartCommand(suffix);
        readModel = yield* applyPlanned(
          readModel,
          yield* decideOrchestrationCommand({
            command: {
              ...command,
              message: {
                ...command.message,
                context: {
                  version: 1,
                  records: [
                    {
                      version: 1,
                      contextId: ComposerContextId.make("same-id"),
                      kind: "mention",
                      label: suffix,
                      path: `${suffix}.ts`,
                    },
                  ],
                },
              },
            },
            readModel,
          }),
        );
      }
      const error = yield* decideOrchestrationCommand({
        command: {
          type: "thread.queue.steer",
          commandId: asCommandId("conflicting-context"),
          threadId: THREAD_ID,
          messageId: asMessageId("message-second"),
          messageIds: [asMessageId("message-first"), asMessageId("message-second")],
          createdAt: NOW,
        },
        readModel,
      }).pipe(Effect.flip);
      expect(error.message).toContain("conflicting context");
      expect(
        readModel.threads.find((entry) => entry.id === THREAD_ID)?.queuedMessages,
      ).toHaveLength(2);
    }),
  );

  it.effect("queues a follow-up while a turn is running", () =>
    Effect.gen(function* () {
      const readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      const planned = yield* decideOrchestrationCommand({
        command: turnStartCommand("busy"),
        readModel,
      });
      const events = Array.isArray(planned) ? planned : [planned];
      expect(events.map((event) => event.type)).toEqual(["thread.message-queued"]);

      const projected = yield* applyPlanned(readModel, planned);
      const thread = projected.threads.find((entry) => entry.id === THREAD_ID);
      expect(thread?.queuedMessages.map((entry) => entry.messageId)).toEqual([
        asMessageId("message-busy"),
      ]);
    }),
  );

  it.effect("preserves queued image attachments through automatic dispatch", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      const command = {
        ...turnStartCommand("image"),
        message: {
          ...turnStartCommand("image").message,
          attachments: [IMAGE_ATTACHMENT],
        },
      };
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({ command, readModel }),
      );

      const queued = readModel.threads.find((entry) => entry.id === THREAD_ID)?.queuedMessages[0];
      expect(queued?.attachments).toEqual([IMAGE_ATTACHMENT]);

      const planned = yield* decideOrchestrationCommand({
        command: {
          type: "thread.queue.drain",
          commandId: asCommandId("cmd-drain-image"),
          threadId: THREAD_ID,
          afterTurnId: TurnId.make("turn-active"),
          createdAt: NOW,
        },
        readModel,
      });
      const projected = yield* applyPlanned(readModel, planned);
      const sent = projected.threads
        .find((entry) => entry.id === THREAD_ID)
        ?.messages.find((message) => message.id === asMessageId("message-image"));
      expect(sent?.attachments).toEqual([IMAGE_ATTACHMENT]);
    }),
  );

  it.effect("treats a legacy thread without queuedMessages as having an empty queue", () =>
    Effect.gen(function* () {
      const currentReadModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      const readModel = {
        ...currentReadModel,
        threads: currentReadModel.threads.map((thread) => {
          const { queuedMessages: _queuedMessages, ...legacyThread } = thread;
          return legacyThread;
        }),
      } as unknown as OrchestrationReadModel;

      const planned = yield* decideOrchestrationCommand({
        command: turnStartCommand("legacy-queue"),
        readModel,
      });

      const events = Array.isArray(planned) ? planned : [planned];
      expect(events.map((event) => event.type)).toEqual(["thread.message-queued"]);
    }),
  );

  it.effect("queues a follow-up racing in behind a just-dispatched turn start", () =>
    Effect.gen(function* () {
      // First send on an idle thread: dispatches message-sent +
      // turn-start-requested, but the provider has not reported any
      // session status yet — the pending-start window.
      let readModel = yield* seedReadModel;
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({ command: turnStartCommand("pending-1"), readModel }),
      );

      // Second send in that window must queue, not open a second turn.
      const planned = yield* decideOrchestrationCommand({
        command: turnStartCommand("pending-2"),
        readModel,
      });
      const events = Array.isArray(planned) ? planned : [planned];
      expect(events.map((event) => event.type)).toEqual(["thread.message-queued"]);

      // A drain in the same window is rejected and keeps the queue intact.
      readModel = yield* applyPlanned(readModel, planned);
      const drainError = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "thread.queue.drain",
            commandId: asCommandId("cmd-drain-pending"),
            threadId: THREAD_ID,
            createdAt: NOW,
          },
          readModel,
        }),
      );
      expect(drainError.message).toContain("busy");
    }),
  );

  it.effect("keeps new sends behind the existing queue during the completion handoff", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({
          command: turnStartCommand("older"),
          readModel,
        }),
      );
      readModel = yield* withSessionStatus(readModel, "ready", readModel.snapshotSequence + 1);
      const planned = yield* decideOrchestrationCommand({
        command: turnStartCommand("newer"),
        readModel,
      });
      const projected = yield* applyPlanned(readModel, planned);
      expect(projected.threads[0]?.messages).toEqual([]);
      expect(projected.threads[0]?.queuedMessages.map((entry) => entry.messageId)).toEqual([
        asMessageId("message-older"),
        asMessageId("message-newer"),
      ]);
    }),
  );

  it.effect("queues, reorders, removes, and drains more than the former 50-prompt limit", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      const ids = Array.from({ length: 128 }, (_, index) => asMessageId(`message-many-${index}`));
      for (let index = 0; index < ids.length; index += 1) {
        readModel = yield* applyPlanned(
          readModel,
          yield* decideOrchestrationCommand({
            command: turnStartCommand(`many-${index}`),
            readModel,
          }),
        );
      }
      expect(readModel.threads[0]?.queuedMessages.map((message) => message.messageId)).toEqual(ids);
      expect(readModel.threads[0]?.messages).toEqual([]);
      const reordered = ids.toReversed();
      const command = {
        type: "thread.queue.reorder",
        commandId: asCommandId("many-reorder"),
        threadId: THREAD_ID,
        messageIds: reordered,
        createdAt: NOW,
      } as const;
      yield* decodeClientCommand(command);
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({ command, readModel }),
      );
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({
          command: {
            type: "thread.queue.remove",
            commandId: asCommandId("many-remove"),
            threadId: THREAD_ID,
            messageId: reordered[0]!,
            createdAt: NOW,
          },
          readModel,
        }),
      );
      readModel = yield* withSessionStatus(readModel, "ready", readModel.snapshotSequence + 1);
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({
          command: {
            type: "thread.queue.drain",
            commandId: asCommandId("many-drain"),
            threadId: THREAD_ID,
            createdAt: NOW,
          },
          readModel,
        }),
      );
      expect(readModel.threads[0]?.messages.map((message) => message.id)).toEqual([reordered[1]]);
      expect(readModel.threads[0]?.queuedMessages.map((message) => message.messageId)).toEqual(
        reordered.slice(2),
      );
    }),
  );

  it.effect("steer dispatches a queued message even while running", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({ command: turnStartCommand("steer"), readModel }),
      );

      const planned = yield* decideOrchestrationCommand({
        command: {
          type: "thread.queue.steer",
          commandId: asCommandId("cmd-steer"),
          threadId: THREAD_ID,
          messageId: asMessageId("message-steer"),
          createdAt: NOW,
        },
        readModel,
      });
      const events = Array.isArray(planned) ? planned : [planned];
      expect(events.map((event) => event.type)).toEqual([
        "thread.queued-message-removed",
        "thread.message-sent",
        "thread.turn-start-requested",
      ]);

      const projected = yield* applyPlanned(readModel, planned);
      const thread = projected.threads.find((entry) => entry.id === THREAD_ID);
      expect(thread?.queuedMessages).toEqual([]);
      expect(thread?.messages.map((entry) => entry.id)).toContain(asMessageId("message-steer"));
    }),
  );

  it.effect(
    "steer sends only the selected prompt and leaves earlier and later prompts queued",
    () =>
      Effect.gen(function* () {
        let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
        for (const suffix of ["first", "second", "later"]) {
          readModel = yield* applyPlanned(
            readModel,
            yield* decideOrchestrationCommand({ command: turnStartCommand(suffix), readModel }),
          );
        }

        const planned = yield* decideOrchestrationCommand({
          command: {
            type: "thread.queue.steer",
            commandId: asCommandId("cmd-steer-second"),
            threadId: THREAD_ID,
            messageId: asMessageId("message-second"),
            createdAt: NOW,
          },
          readModel,
        });
        const events = Array.isArray(planned) ? planned : [planned];
        expect(events.map((event) => event.type)).toEqual([
          "thread.queued-message-removed",
          "thread.message-sent",
          "thread.turn-start-requested",
        ]);

        const projected = yield* applyPlanned(readModel, planned);
        const thread = projected.threads.find((entry) => entry.id === THREAD_ID);
        expect(thread?.queuedMessages.map((entry) => entry.messageId)).toEqual([
          asMessageId("message-first"),
          asMessageId("message-later"),
        ]);
        expect(
          thread?.messages.find((entry) => entry.id === asMessageId("message-second"))?.text,
        ).toBe("Follow up second");
      }),
  );

  it.effect("steer combines only explicit selections in queue order", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      for (const suffix of ["first", "second", "later"]) {
        readModel = yield* applyPlanned(
          readModel,
          yield* decideOrchestrationCommand({
            command: turnStartCommand(suffix),
            readModel,
          }),
        );
      }
      const command = yield* decodeClientCommand({
        type: "thread.queue.steer",
        commandId: asCommandId("cmd-select"),
        threadId: THREAD_ID,
        messageId: asMessageId("message-later"),
        messageIds: [asMessageId("message-later"), asMessageId("message-first")],
        createdAt: NOW,
      });
      if (command.type !== "thread.queue.steer") throw new Error("Expected steer command");
      const projected = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({ command, readModel }),
      );
      const thread = projected.threads.find((entry) => entry.id === THREAD_ID);
      expect(thread?.queuedMessages.map((entry) => entry.messageId)).toEqual([
        asMessageId("message-second"),
      ]);
      expect(
        thread?.messages.find((entry) => entry.id === asMessageId("message-later"))?.text,
      ).toBe("Follow up first\n\nFollow up later");
    }),
  );

  it.effect(
    "steer rejects empty, duplicate, missing, or inconsistent selections without consuming the queue",
    () =>
      Effect.gen(function* () {
        let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
        readModel = yield* applyPlanned(
          readModel,
          yield* decideOrchestrationCommand({
            command: turnStartCommand("first"),
            readModel,
          }),
        );
        for (const ids of [
          [],
          ["message-first", "message-first"],
          ["message-first", "missing"],
          ["missing"],
        ]) {
          const result = yield* decideOrchestrationCommand({
            command: {
              type: "thread.queue.steer",
              commandId: asCommandId("cmd-invalid-selection"),
              threadId: THREAD_ID,
              messageId: asMessageId("message-first"),
              messageIds: ids.map(asMessageId),
              createdAt: NOW,
            },
            readModel,
          }).pipe(Effect.flip);
          expect(result._tag).toBe("OrchestrationCommandInvariantError");
        }
        expect(
          readModel.threads.find((entry) => entry.id === THREAD_ID)?.queuedMessages,
        ).toHaveLength(1);
      }),
  );

  it.effect("steer rejects while the session is still starting", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "starting", 3);
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({
          command: turnStartCommand("steer-starting"),
          readModel,
        }),
      );

      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "thread.queue.steer",
            commandId: asCommandId("cmd-steer-starting"),
            threadId: THREAD_ID,
            messageId: asMessageId("message-steer-starting"),
            createdAt: NOW,
          },
          readModel,
        }),
      );
      expect(error.message).toContain("starting");

      // The queued message survives the rejected steer.
      const thread = readModel.threads.find((entry) => entry.id === THREAD_ID);
      expect(thread?.queuedMessages.map((entry) => entry.messageId)).toEqual([
        asMessageId("message-steer-starting"),
      ]);
    }),
  );

  it.effect("does not requeue a delivered prompt when its legacy removal event is missing", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({
          command: turnStartCommand("delivered"),
          readModel,
        }),
      );
      const dispatch = yield* decideOrchestrationCommand({
        command: {
          type: "thread.queue.steer",
          commandId: asCommandId("legacy-steer"),
          threadId: THREAD_ID,
          messageId: asMessageId("message-delivered"),
          createdAt: NOW,
        },
        readModel,
      });
      const events = Array.isArray(dispatch) ? dispatch : [dispatch];
      readModel = yield* applyPlanned(
        readModel,
        events.filter((event) => event.type === "thread.message-sent"),
      );
      expect(readModel.threads[0]?.queuedMessages).toEqual([]);
      readModel = yield* withSessionStatus(readModel, "ready", readModel.snapshotSequence + 1);
      const next = yield* decideOrchestrationCommand({
        command: turnStartCommand("new"),
        readModel,
      });
      const projected = yield* applyPlanned(readModel, next);
      expect(projected.threads[0]?.queuedMessages).toEqual([]);
      expect(projected.threads[0]?.messages.map((message) => message.id)).toEqual([
        asMessageId("message-delivered"),
        asMessageId("message-new"),
      ]);
    }),
  );

  it.effect("remove deletes a queued message without dispatching", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({ command: turnStartCommand("remove"), readModel }),
      );

      const planned = yield* decideOrchestrationCommand({
        command: {
          type: "thread.queue.remove",
          commandId: asCommandId("cmd-remove"),
          threadId: THREAD_ID,
          messageId: asMessageId("message-remove"),
          createdAt: NOW,
        },
        readModel,
      });
      const events = Array.isArray(planned) ? planned : [planned];
      expect(events.map((event) => event.type)).toEqual(["thread.queued-message-removed"]);

      const projected = yield* applyPlanned(readModel, planned);
      const thread = projected.threads.find((entry) => entry.id === THREAD_ID);
      expect(thread?.queuedMessages).toEqual([]);
      expect(thread?.messages.map((entry) => entry.id)).not.toContain(
        asMessageId("message-remove"),
      );
    }),
  );

  it.effect("updates queued text without changing its position", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      for (const suffix of ["edit-first", "edit-second"]) {
        readModel = yield* applyPlanned(
          readModel,
          yield* decideOrchestrationCommand({ command: turnStartCommand(suffix), readModel }),
        );
      }

      const planned = yield* decideOrchestrationCommand({
        command: {
          type: "thread.queue.update",
          commandId: asCommandId("cmd-update-queued"),
          threadId: THREAD_ID,
          messageId: asMessageId("message-edit-first"),
          text: "Edited first prompt",
          createdAt: NOW,
        },
        readModel,
      });
      const projected = yield* applyPlanned(readModel, planned);
      const queue = projected.threads.find((entry) => entry.id === THREAD_ID)?.queuedMessages;
      expect(queue?.map((entry) => [entry.messageId, entry.text])).toEqual([
        [asMessageId("message-edit-first"), "Edited first prompt"],
        [asMessageId("message-edit-second"), "Follow up edit-second"],
      ]);
    }),
  );

  it.effect("reorders the complete durable queue", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      for (const suffix of ["order-first", "order-second", "order-third"]) {
        readModel = yield* applyPlanned(
          readModel,
          yield* decideOrchestrationCommand({ command: turnStartCommand(suffix), readModel }),
        );
      }
      const reorderedIds = [
        asMessageId("message-order-third"),
        asMessageId("message-order-first"),
        asMessageId("message-order-second"),
      ];
      const planned = yield* decideOrchestrationCommand({
        command: {
          type: "thread.queue.reorder",
          commandId: asCommandId("cmd-reorder-queued"),
          threadId: THREAD_ID,
          messageIds: reorderedIds,
          createdAt: NOW,
        },
        readModel,
      });
      const projected = yield* applyPlanned(readModel, planned);
      expect(
        projected.threads
          .find((entry) => entry.id === THREAD_ID)
          ?.queuedMessages.map((entry) => entry.messageId),
      ).toEqual(reorderedIds);
    }),
  );

  it.effect("steer and remove reject unknown queued messages", () =>
    Effect.gen(function* () {
      const readModel = yield* seedReadModel;
      for (const type of ["thread.queue.steer", "thread.queue.remove"] as const) {
        const error = yield* Effect.flip(
          decideOrchestrationCommand({
            command: {
              type,
              commandId: asCommandId(`cmd-${type}-missing`),
              threadId: THREAD_ID,
              messageId: asMessageId("message-missing"),
              createdAt: NOW,
            },
            readModel,
          }),
        );
        expect(error.message).toContain("does not exist");
      }
    }),
  );

  it.effect("drain dispatches the queue head once the thread is idle", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({ command: turnStartCommand("drain-1"), readModel }),
      );
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({ command: turnStartCommand("drain-2"), readModel }),
      );
      readModel = yield* withSessionStatus(readModel, "ready", readModel.snapshotSequence + 1);

      const planned = yield* decideOrchestrationCommand({
        command: {
          type: "thread.queue.drain",
          commandId: asCommandId("cmd-drain"),
          threadId: THREAD_ID,
          createdAt: NOW,
        },
        readModel,
      });
      const events = Array.isArray(planned) ? planned : [planned];
      expect(events.map((event) => event.type)).toEqual([
        "thread.queued-message-removed",
        "thread.message-sent",
        "thread.turn-start-requested",
      ]);

      const projected = yield* applyPlanned(readModel, planned);
      const thread = projected.threads.find((entry) => entry.id === THREAD_ID);
      // FIFO: the first queued message dispatches, the second stays queued.
      expect(thread?.messages.map((entry) => entry.id)).toContain(asMessageId("message-drain-1"));
      expect(thread?.queuedMessages.map((entry) => entry.messageId)).toEqual([
        asMessageId("message-drain-2"),
      ]);
    }),
  );

  it.effect("drain rejects while the thread is busy and keeps the queue intact", () =>
    Effect.gen(function* () {
      let readModel = yield* withSessionStatus(yield* seedReadModel, "running", 3);
      readModel = yield* applyPlanned(
        readModel,
        yield* decideOrchestrationCommand({ command: turnStartCommand("drain-busy"), readModel }),
      );

      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "thread.queue.drain",
            commandId: asCommandId("cmd-drain-busy"),
            threadId: THREAD_ID,
            createdAt: NOW,
          },
          readModel,
        }),
      );
      expect(error.message).toContain("busy");
    }),
  );

  it.effect("drain rejects when the queue is empty", () =>
    Effect.gen(function* () {
      const readModel = yield* seedReadModel;
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "thread.queue.drain",
            commandId: asCommandId("cmd-drain-empty"),
            threadId: THREAD_ID,
            createdAt: NOW,
          },
          readModel,
        }),
      );
      expect(error.message).toContain("no queued messages");
    }),
  );
});
