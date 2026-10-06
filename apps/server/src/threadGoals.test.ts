import { describe, expect, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { threadGoalChangeCommand, threadGoalFromProviderGoal } from "./threadGoals.ts";

describe("thread goals", () => {
  it("maps the provider goal the thread shell mirrors", () => {
    expect(
      threadGoalFromProviderGoal({
        threadId: ThreadId.make("thread-goal"),
        goal: { objective: "Ship it", status: "paused", tokensUsed: 12, tokenBudget: 0 },
        createdAt: DateTime.makeUnsafe("2026-10-01T00:00:00.000Z"),
        updatedAt: DateTime.makeUnsafe("2026-10-01T00:00:10.000Z"),
      }),
    ).toEqual({
      threadId: "thread-goal",
      objective: "Ship it",
      status: "paused",
      tokenBudget: null,
      tokensUsed: 12,
      timeUsedSeconds: 0,
      createdAt: 1_790_812_800,
      updatedAt: 1_790_812_810,
    });
  });

  it("changes goals through the same /goal messages as the composer", () => {
    expect(threadGoalChangeCommand({ objective: "  Ship it " })).toEqual({
      _tag: "Command",
      text: "/goal Ship it",
    });
    expect(threadGoalChangeCommand({ status: "paused" })).toEqual({
      _tag: "Command",
      text: "/goal pause",
    });
    expect(threadGoalChangeCommand({ status: "active" })).toEqual({
      _tag: "Command",
      text: "/goal resume",
    });
    expect(threadGoalChangeCommand({ status: "complete" })._tag).toBe("Unsupported");
    expect(threadGoalChangeCommand({ objective: "x", tokenBudget: 10 })._tag).toBe("Unsupported");
    expect(threadGoalChangeCommand({})._tag).toBe("Unsupported");
  });
});
