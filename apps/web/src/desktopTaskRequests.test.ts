import {
  DesktopTaskActivity,
  EnvironmentId,
  EventId,
  ThreadId,
  type OrchestrationThreadActivity,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { projectDesktopTaskRequests } from "./desktopTaskRequests";

const activity = (
  id: string,
  kind: string,
  payload: Record<string, unknown>,
): OrchestrationThreadActivity => ({
  id: EventId.make(id),
  kind,
  payload,
  createdAt: "2026-10-24T10:00:00Z",
  summary: kind,
  tone: "info",
  turnId: null,
});
const requested = activity("question", "user-input.requested", {
  requestId: "q1",
  responseMode: "message",
  questions: [
    {
      id: " exact id ",
      header: "Layout",
      question: "Choose a screen",
      options: [{ label: "Built-in", value: " exact value ", description: "" }],
      multiSelect: false,
    },
  ],
});
const decodeActivity = Schema.decodeUnknownSync(DesktopTaskActivity);
describe("notch pending request projection", () => {
  it("uses live app questions and preserves their exact answer keys through IPC", () => {
    const requests = projectDesktopTaskRequests([requested]);
    const decoded = decodeActivity({
      enabled: true,
      tasks: [
        {
          environmentId: EnvironmentId.make("remote"),
          threadId: ThreadId.make("one"),
          title: "Choose layout",
          project: "Studio",
          detail: "Input needed",
          status: "input",
          requests,
        },
      ],
    });
    expect(decoded.tasks[0]?.requests).toEqual(requests);
    expect(requests[0]).toMatchObject({
      kind: "input",
      requestId: "q1",
      dismissible: true,
      questions: [{ id: " exact id ", options: [{ value: " exact value " }] }],
    });
  });
  it("keeps retryable provider failures visible and removes requests resolved on another client", () => {
    const failed = activity("failure-1", "provider.user-input.respond.failed", {
      requestId: "q1",
      detail: "Provider disconnected. Retry your response.",
    });
    expect(projectDesktopTaskRequests([requested, failed])[0]?.responseFailure).toEqual({
      activityId: failed.id,
      message: "Provider disconnected. Retry your response.",
    });
    const resolved = activity("resolved", "user-input.resolved", { requestId: "q1" });
    expect(projectDesktopTaskRequests([requested, failed, resolved])).toEqual([]);
    const stale = activity("stale", "provider.user-input.respond.failed", {
      requestId: "q1",
      detail: "Unknown pending user-input request",
    });
    expect(projectDesktopTaskRequests([requested, stale])).toEqual([]);
  });
  it("preserves approval details, provider choices and warnings", () => {
    const options = [
      { decision: "decline", label: "Deny" },
      { decision: "acceptAlways", label: "Always allow", warning: "Future access" },
    ];
    const approval = activity("approval", "approval.requested", {
      requestId: "a1",
      requestKind: "mcp-elicitation",
      appName: "Safari",
      detail: "Read the whole command\nincluding this line",
      options,
    });
    expect(projectDesktopTaskRequests([approval])).toEqual([
      {
        kind: "approval",
        requestId: "a1",
        requestKind: "mcp-elicitation",
        appName: "Safari",
        detail: "Read the whole command\nincluding this line",
        options,
      },
    ]);
  });
});
