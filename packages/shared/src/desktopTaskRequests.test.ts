import {
  ApprovalRequestId,
  DesktopTaskActivity,
  EnvironmentId,
  ThreadId,
  type DesktopTask,
  type DesktopTaskResponse,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { taskRequests, validTaskResponse } from "./desktopTaskRequests.ts";

const target = {
  environmentId: EnvironmentId.make("remote"),
  threadId: ThreadId.make("thread"),
  requestId: ApprovalRequestId.make("input"),
};
const task: DesktopTask = {
  ...target,
  title: "Choose a layout",
  project: "Studio",
  detail: "Waiting for input",
  status: "input",
  requests: [
    {
      kind: "input",
      requestId: target.requestId,
      dismissible: false,
      questions: [
        {
          id: " single ",
          header: "Layout",
          question: "Choose",
          options: [{ label: "First", value: " first ", description: "" }],
          multiSelect: false,
          allowCustomAnswer: false,
        },
        {
          id: "multi",
          header: "Features",
          question: "Pick features",
          options: [
            { label: "A", description: "" },
            { label: "B", description: "" },
          ],
          multiSelect: true,
          allowCustomAnswer: false,
        },
        {
          id: "custom",
          header: "Notes",
          question: "Anything else?",
          options: [],
          multiSelect: false,
        },
      ],
    },
  ],
};
const response: DesktopTaskResponse = {
  ...target,
  kind: "input",
  answers: { " single ": " first ", multi: ["A", "B"], custom: "My answer" },
};

const decodeActivity = Schema.decodeUnknownSync(DesktopTaskActivity);

describe("notch request boundaries", () => {
  it("preserves provider answer keys and choices through desktop IPC", () => {
    const decoded = decodeActivity({ enabled: true, tasks: [task] });
    expect(validTaskResponse(decoded.tasks, response)).toBe(true);
    expect(taskRequests(decoded.tasks)[0]?.target).toEqual(target);
  });
  it("rejects stale requests and responses targeting another environment or thread", () => {
    expect(validTaskResponse([], response)).toBe(false);
    for (const mismatch of [
      { environmentId: EnvironmentId.make("other") },
      { threadId: ThreadId.make("other") },
      { requestId: ApprovalRequestId.make("other") },
    ]) {
      expect(validTaskResponse([task], { ...response, ...mismatch })).toBe(false);
    }
  });
  it("requires every question, recognized choices, and nonempty custom answers", () => {
    for (const answers of [
      { ...response.answers, multi: ["unknown"] },
      { ...response.answers, multi: [] },
      { ...response.answers, multi: ["A", "A"] },
      { ...response.answers, " single ": "first" },
      { ...response.answers, custom: "  " },
      { ...response.answers, extra: "unexpected" },
      { " single ": " first " },
    ])
      expect(validTaskResponse([task], { ...response, answers })).toBe(false);
  });
  it("only dismisses async questions that support dismissal", () => {
    expect(validTaskResponse([task], { ...target, kind: "dismiss" })).toBe(false);
    const dismissible = {
      ...task,
      requests: task.requests!.map((request) => ({ ...request, dismissible: true })),
    };
    expect(validTaskResponse([dismissible], { ...target, kind: "dismiss" })).toBe(true);
  });
  it("uses provider approval choices without inventing persistence permissions", () => {
    const approval: DesktopTask = {
      ...task,
      requests: [
        {
          kind: "approval",
          requestId: target.requestId,
          requestKind: "permission",
          options: [
            { decision: "accept", label: "Allow once" },
            { decision: "decline", label: "Deny" },
          ],
        },
      ],
    };
    expect(validTaskResponse([approval], { ...target, kind: "approval", decision: "accept" })).toBe(
      true,
    );
    expect(
      validTaskResponse([approval], { ...target, kind: "approval", decision: "acceptAlways" }),
    ).toBe(false);
    expect(validTaskResponse([approval], response)).toBe(false);
    expect(validTaskResponse([approval], { ...target, kind: "dismiss" })).toBe(false);
  });
});
