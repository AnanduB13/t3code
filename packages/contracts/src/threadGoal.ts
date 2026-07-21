import * as Schema from "effect/Schema";

import { NonNegativeInt, PositiveInt, ThreadId } from "./baseSchemas.ts";

export const ThreadGoalStatus = Schema.Literals([
  "active",
  "paused",
  "blocked",
  "usage_limited",
  "budget_limited",
  "complete",
]);
export type ThreadGoalStatus = typeof ThreadGoalStatus.Type;

export const ThreadGoal = Schema.Struct({
  threadId: ThreadId,
  objective: Schema.String,
  status: ThreadGoalStatus,
  tokenBudget: Schema.NullOr(PositiveInt),
  tokensUsed: NonNegativeInt,
  timeUsedSeconds: NonNegativeInt,
  createdAt: NonNegativeInt,
  updatedAt: NonNegativeInt,
});
export type ThreadGoal = typeof ThreadGoal.Type;

export const ThreadGoalGetInput = Schema.Struct({ threadId: ThreadId });
export const ThreadGoalGetResult = Schema.Struct({ goal: Schema.NullOr(ThreadGoal) });

export const ThreadGoalSetInput = Schema.Struct({
  threadId: ThreadId,
  objective: Schema.optional(Schema.String),
  status: Schema.optional(ThreadGoalStatus),
  tokenBudget: Schema.optional(Schema.NullOr(PositiveInt)),
});
export const ThreadGoalSetResult = Schema.Struct({ goal: ThreadGoal });

export const ThreadGoalClearInput = Schema.Struct({ threadId: ThreadId });
export const ThreadGoalClearResult = Schema.Struct({ cleared: Schema.Boolean });

export class ThreadGoalError extends Schema.TaggedErrorClass<ThreadGoalError>()("ThreadGoalError", {
  message: Schema.String,
}) {}
