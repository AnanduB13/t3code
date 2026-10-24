import {
  DesktopTaskActivity,
  EnvironmentId,
  NodeId,
  RuntimeRequestId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2RuntimeRequest,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import {
  v2Now,
  v2Projection,
} from "../../../packages/client-runtime/src/state/orchestrationV2TestFixtures";
import { projectDesktopTaskRequests } from "./desktopTaskRequests";

const requestId = RuntimeRequestId.make("q1");
const request: OrchestrationV2RuntimeRequest = {
  id: requestId,
  nodeId: NodeId.make("question-node"),
  providerTurnId: null,
  nativeRequestRef: null,
  kind: "user_input",
  status: "pending",
  responseCapability: { type: "message" },
  createdAt: v2Now,
  resolvedAt: null,
};
const item: OrchestrationV2TurnItem = {
  id: TurnItemId.make("question-item"),
  threadId: v2Projection.thread.id,
  runId: null,
  nodeId: NodeId.make("question-node"),
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  ordinal: 0,
  status: "completed",
  title: null,
  startedAt: v2Now,
  completedAt: v2Now,
  updatedAt: v2Now,
  type: "user_input_request",
  requestId,
  questions: [
    {
      id: " exact id ",
      header: "Layout",
      question: "Choose a screen",
      options: [{ label: "Built-in", value: " exact value ", description: "Internal screen" }],
      multiSelect: false,
      initialAnswer: "  Proposed answer  ",
    },
  ],
};
const projection = { runtimeRequests: [request], turnItems: [item] };
const decodeActivity = Schema.decodeSync(DesktopTaskActivity);

describe("notch current runtime requests", () => {
  it("projects the same pending questions as the app and preserves exact answer keys through IPC", () => {
    const requests = projectDesktopTaskRequests(projection);
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
      requestId,
      dismissible: true,
      questions: [
        {
          id: " exact id ",
          initialAnswer: "  Proposed answer  ",
          options: [{ value: " exact value " }],
        },
      ],
    });
  });
  it("removes answered requests and includes asynchronous questions after the originating runtime exits", () => {
    expect(
      projectDesktopTaskRequests({
        ...projection,
        runtimeRequests: [{ ...request, status: "resolved" }],
      }),
    ).toEqual([]);
    expect(projectDesktopTaskRequests(projection)[0]).toMatchObject({
      kind: "input",
      dismissible: true,
    });
  });
  it("preserves approval details, provider choices and warnings", () => {
    const options = [
      { decision: "decline" as const, label: "Deny" },
      { decision: "acceptAlways" as const, label: "Always allow", warning: "Future access" },
    ];
    const approval: OrchestrationV2TurnItem = {
      ...item,
      type: "approval_request",
      requestKind: "mcp-elicitation",
      prompt: "Read the whole command\nincluding this line",
      appName: "Safari",
      options,
    };
    expect(
      projectDesktopTaskRequests({
        runtimeRequests: [{ ...request, kind: "mcp-elicitation" }],
        turnItems: [approval],
      }),
    ).toEqual([
      {
        kind: "approval",
        requestId,
        requestKind: "mcp-elicitation",
        appName: "Safari",
        detail: "Read the whole command\nincluding this line",
        options,
      },
    ]);
  });
  it("keeps expired runtime callbacks readable without allowing invalid responses", () => {
    expect(
      projectDesktopTaskRequests({
        ...projection,
        runtimeRequests: [
          {
            ...request,
            responseCapability: {
              type: "not_resumable",
              reason: "Provider session ended. Open the chat to continue.",
            },
          },
        ],
      })[0],
    ).toMatchObject({
      responseUnavailableReason: "Provider session ended. Open the chat to continue.",
    });
  });
});
