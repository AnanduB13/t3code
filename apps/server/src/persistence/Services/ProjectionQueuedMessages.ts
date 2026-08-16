import {
  ChatAttachment,
  IsoDateTime,
  MessageId,
  ModelSelection,
  OrchestrationProposedPlanId,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionQueuedMessage = Schema.Struct({
  messageId: MessageId,
  threadId: ThreadId,
  text: Schema.String,
  attachments: Schema.Array(ChatAttachment),
  modelSelection: Schema.NullOr(ModelSelection),
  sourceProposedPlanThreadId: Schema.NullOr(ThreadId),
  sourceProposedPlanId: Schema.NullOr(OrchestrationProposedPlanId),
  queuedAt: IsoDateTime,
});
export type ProjectionQueuedMessage = typeof ProjectionQueuedMessage.Type;

export const ListProjectionQueuedMessagesInput = Schema.Struct({
  threadId: ThreadId,
});
export type ListProjectionQueuedMessagesInput = typeof ListProjectionQueuedMessagesInput.Type;

export const DeleteProjectionQueuedMessageInput = Schema.Struct({
  threadId: ThreadId,
  messageId: MessageId,
});
export type DeleteProjectionQueuedMessageInput = typeof DeleteProjectionQueuedMessageInput.Type;

export const DeleteProjectionQueuedMessagesInput = Schema.Struct({
  threadId: ThreadId,
});
export type DeleteProjectionQueuedMessagesInput = typeof DeleteProjectionQueuedMessagesInput.Type;

export const UpdateProjectionQueuedMessageTextInput = Schema.Struct({
  threadId: ThreadId,
  messageId: MessageId,
  text: Schema.String,
});
export type UpdateProjectionQueuedMessageTextInput =
  typeof UpdateProjectionQueuedMessageTextInput.Type;

export const ReorderProjectionQueuedMessagesInput = Schema.Struct({
  threadId: ThreadId,
  messageIds: Schema.Array(MessageId),
});
export type ReorderProjectionQueuedMessagesInput = typeof ReorderProjectionQueuedMessagesInput.Type;

export interface ProjectionQueuedMessageRepositoryShape {
  readonly upsert: (
    queuedMessage: ProjectionQueuedMessage,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly listByThreadId: (
    input: ListProjectionQueuedMessagesInput,
  ) => Effect.Effect<ReadonlyArray<ProjectionQueuedMessage>, ProjectionRepositoryError>;
  readonly deleteByMessageId: (
    input: DeleteProjectionQueuedMessageInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly deleteByThreadId: (
    input: DeleteProjectionQueuedMessagesInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly updateText: (
    input: UpdateProjectionQueuedMessageTextInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly reorder: (
    input: ReorderProjectionQueuedMessagesInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionQueuedMessageRepository extends Context.Service<
  ProjectionQueuedMessageRepository,
  ProjectionQueuedMessageRepositoryShape
>()("t3/persistence/Services/ProjectionQueuedMessages/ProjectionQueuedMessageRepository") {}
