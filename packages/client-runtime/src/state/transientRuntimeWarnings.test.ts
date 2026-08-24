import { EventId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { omitRecoveredRuntimeWarnings } from "./transientRuntimeWarnings.js";

function activity(
  id: string,
  kind: OrchestrationThreadActivity["kind"],
  turnId: string,
  payload: unknown = {},
): OrchestrationThreadActivity {
  return {
    id: EventId.make(id),
    kind,
    turnId: TurnId.make(turnId),
    tone: "info",
    summary: id,
    payload,
    createdAt: "2026-08-24T00:00:00.000Z",
  };
}

describe("omitRecoveredRuntimeWarnings", () => {
  it("keeps a retry warning while its turn has not resumed", () => {
    const earlierTool = activity("earlier-tool", "tool.completed", "turn-1");
    const warning = activity("warning", "runtime.warning", "turn-1", {
      detail: { willRetry: true },
    });

    expect(omitRecoveredRuntimeWarnings([earlierTool, warning])).toEqual([earlierTool, warning]);
  });

  it("removes retry warnings after the same turn resumes", () => {
    const warning = activity("warning", "runtime.warning", "turn-1", {
      detail: { willRetry: true },
    });
    const recoveredTool = activity("tool", "tool.completed", "turn-1");

    expect(omitRecoveredRuntimeWarnings([warning, recoveredTool])).toEqual([recoveredTool]);
  });

  it("does not let activity from another turn resolve the warning", () => {
    const warning = activity("warning", "runtime.warning", "turn-1", {
      detail: { willRetry: true },
    });
    const otherTurnTool = activity("tool", "tool.completed", "turn-2");

    expect(omitRecoveredRuntimeWarnings([warning, otherTurnTool])).toEqual([
      warning,
      otherTurnTool,
    ]);
  });

  it("keeps non-retry runtime warnings", () => {
    const warning = activity("warning", "runtime.warning", "turn-1", {
      detail: { willRetry: false },
    });
    const recoveredTool = activity("tool", "tool.completed", "turn-1");

    expect(omitRecoveredRuntimeWarnings([warning, recoveredTool])).toEqual([
      warning,
      recoveredTool,
    ]);
  });
});
