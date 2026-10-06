import type {
  OrchestrationV2ProviderGoal,
  ThreadGoal,
  ThreadGoalStatus,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

/**
 * Thread goals are provider-native (`/goal` in Codex and Claude). The goal RPCs
 * read the goal the thread shell mirrors and change it by sending the same
 * `/goal` control message the composer sends, so the provider stays the owner.
 */
export function threadGoalFromProviderGoal(input: {
  readonly threadId: ThreadId;
  readonly goal: OrchestrationV2ProviderGoal;
  readonly createdAt: DateTime.Utc;
  readonly updatedAt: DateTime.Utc;
}): ThreadGoal {
  const tokenBudget = input.goal.tokenBudget ?? null;
  return {
    threadId: input.threadId,
    objective: input.goal.objective,
    status: input.goal.status,
    tokenBudget: tokenBudget !== null && tokenBudget > 0 ? tokenBudget : null,
    tokensUsed: input.goal.tokensUsed ?? 0,
    timeUsedSeconds: input.goal.timeUsedSeconds ?? 0,
    createdAt: Math.floor(DateTime.toEpochMillis(input.createdAt) / 1000),
    updatedAt: Math.floor(DateTime.toEpochMillis(input.updatedAt) / 1000),
  };
}

export type ThreadGoalChange =
  | { readonly _tag: "Command"; readonly text: string }
  | { readonly _tag: "Unsupported"; readonly reason: string };

/** The `/goal` message that applies a requested change, or why none can. */
export function threadGoalChangeCommand(input: {
  readonly objective?: string | undefined;
  readonly status?: ThreadGoalStatus | undefined;
  readonly tokenBudget?: number | null | undefined;
}): ThreadGoalChange {
  if (input.tokenBudget !== undefined) {
    return {
      _tag: "Unsupported",
      reason: "Goal token budgets are managed by the provider and cannot be changed here.",
    };
  }
  const objective = input.objective?.trim();
  if (objective !== undefined && objective.length > 0) {
    if (input.status !== undefined && input.status !== "active") {
      return { _tag: "Unsupported", reason: "A new goal always starts active." };
    }
    return { _tag: "Command", text: `/goal ${objective}` };
  }
  switch (input.status) {
    case "active":
      return { _tag: "Command", text: "/goal resume" };
    case "paused":
      return { _tag: "Command", text: "/goal pause" };
    case undefined:
      return { _tag: "Unsupported", reason: "Provide an objective or a status to change." };
    default:
      return {
        _tag: "Unsupported",
        reason: `The provider sets the ${input.status.replace("_", " ")} status itself.`,
      };
  }
}

export const THREAD_GOAL_CLEAR_COMMAND = "/goal clear";
