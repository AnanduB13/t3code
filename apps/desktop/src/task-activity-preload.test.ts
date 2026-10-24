// @vitest-environment jsdom
import { ipcRenderer } from "electron";
import {
  ApprovalRequestId,
  EnvironmentId,
  ThreadId,
  type DesktopTask,
  type DesktopTaskRequest,
  type DesktopTaskRequestTarget,
  type DesktopTaskResponseResult,
} from "@t3tools/contracts";
import { modelLogoDataUrl } from "@t3tools/shared/modelLogo";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TASK_ACTIVITY_PANEL_CHANNEL } from "./ipc/channels.ts";
import { taskPanelHtml } from "./activity/taskPanelHtml.ts";

vi.mock("electron", () => ({ ipcRenderer: { on: vi.fn(), send: vi.fn() } }));
const tasks: readonly DesktopTask[] = [
  {
    environmentId: EnvironmentId.make("remote"),
    threadId: ThreadId.make("one"),
    title: "Keyboard navigation",
    project: "T3 Code",
    detail: "Working",
    status: "running",
    model: "GPT-6.1",
    modelIcon: modelLogoDataUrl("GPT-6.1"),
    startedAt: "2026-10-24T10:00:00Z",
    projectIcon: "data:image/png;base64,aGVsbG8=",
  },
  {
    environmentId: EnvironmentId.make("remote"),
    threadId: ThreadId.make("two"),
    title: "Landing page",
    project: "Studio",
    detail: "Approval needed",
    status: "approval",
    model: "Claude Sonnet",
    modelIcon: modelLogoDataUrl("Claude Sonnet"),
    startedAt: "2026-10-24T10:04:00Z",
  },
];
let hidden = false;
let reduce = true;
const animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }));
const publish = (
  next = tasks,
  expanded = false,
  branding: { name: string; icon: string | null } = {
    name: "After Dark",
    icon: "data:image/png;base64,YXBw",
  },
  activeRequest?: DesktopTaskRequestTarget,
) => {
  const listener = vi
    .mocked(ipcRenderer.on)
    .mock.calls.find(([channel]) => channel === TASK_ACTIVITY_PANEL_CHANNEL)![1];
  listener({} as Electron.IpcRendererEvent, {
    tasks: next,
    branding,
    expanded,
    collapsing: false,
    revision: 0,
    activeRequest,
    layout: { headerHeight: 40, notchWidth: 0, compactWidth: 240, width: 400, height: 190 },
  });
};
const header = () => document.querySelector("#identity > :last-child .summary-title")?.textContent;
const clock = () => document.querySelector("#metadata > :last-child .elapsed")?.textContent;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-24T10:05:00Z"));
  hidden = false;
  reduce = true;
  vi.clearAllMocks();
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    hidden ? "hidden" : "visible",
  );
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduce;
    },
  }));
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
  const parsed = new DOMParser().parseFromString(taskPanelHtml, "text/html");
  document.body.replaceChildren(...parsed.body.childNodes);
  vi.resetModules();
  await import("./task-activity-preload.ts");
  window.dispatchEvent(new Event("DOMContentLoaded"));
});

const inputRequest = {
  kind: "input",
  requestId: ApprovalRequestId.make("question-1"),
  dismissible: true,
  questions: [
    {
      id: " choice ",
      header: "Layout",
      question: "Which display?",
      options: [
        { label: "Built-in", value: " internal ", description: "Beside the camera" },
        { label: "External", description: "" },
      ],
      multiSelect: false,
    },
    {
      id: "features",
      header: "Features",
      question: "Select features",
      options: [
        { label: "A", description: "" },
        { label: "B", description: "" },
      ],
      multiSelect: true,
      allowCustomAnswer: false,
    },
    { id: "notes", header: "Notes", question: "Anything else?", options: [], multiSelect: false },
  ],
} satisfies DesktopTaskRequest;
const inputTask: DesktopTask = { ...tasks[0]!, status: "input", requests: [inputRequest] };
const inputTarget = {
  environmentId: inputTask.environmentId,
  threadId: inputTask.threadId,
  requestId: inputTask.requests![0]!.requestId,
};
const showInput = (next: readonly DesktopTask[] = [inputTask], target = inputTarget) =>
  publish(next, true, undefined, target);
const answer = () => document.querySelector<HTMLTextAreaElement>(".request-custom")!;
const primary = () => document.querySelector<HTMLButtonElement>(".request-primary")!;
const choice = (index: number) =>
  document.querySelectorAll<HTMLButtonElement>(".request-option")[index]!;
const reply = (result: DesktopTaskResponseResult) => {
  const listener = vi
    .mocked(ipcRenderer.on)
    .mock.calls.find(([channel]) => channel === TASK_ACTIVITY_PANEL_CHANNEL)![1];
  listener({} as Electron.IpcRendererEvent, { action: "response-result", result });
};

describe("notch agent questions", () => {
  it("shows thread, project, model and icons, keeps focus and drafts through live clock updates", async () => {
    showInput();
    expect(document.querySelector(".request-context .title")?.textContent).toBe(inputTask.title);
    expect(document.querySelector(".request-context .detail")?.textContent).toBe(inputTask.project);
    expect(document.querySelector(".request-model .model")?.textContent).toBe(inputTask.model);
    expect(document.querySelector(".request-context .project-icon img")?.getAttribute("src")).toBe(
      inputTask.projectIcon,
    );
    expect(document.querySelector(".request-model img")?.getAttribute("src")).toBe(
      inputTask.modelIcon,
    );
    expect(document.activeElement).toBe(document.body);
    const field = answer();
    field.value = "Use my preferred screen";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.focus();
    field.setSelectionRange(4, 6);
    await vi.advanceTimersByTimeAsync(4_000);
    showInput([
      {
        ...inputTask,
        detail: "Still waiting",
        model: "Updated model",
        projectIcon: "data:image/png;base64,YXBw",
      },
      tasks[1]!,
    ]);
    expect(answer()).toBe(field);
    expect(field.value).toBe("Use my preferred screen");
    expect([field.selectionStart, field.selectionEnd]).toEqual([4, 6]);
    expect(document.activeElement).toBe(field);
    expect(document.querySelector(".request-model .model")?.textContent).toBe("Updated model");
    expect(document.querySelector(".request-elapsed")?.textContent).toBe("5m 4s");
    document.documentElement.dispatchEvent(new Event("mouseleave"));
    expect(ipcRenderer.send).not.toHaveBeenCalledWith(TASK_ACTIVITY_PANEL_CHANNEL, "collapse");
  });
  it("advances single choices, supports multiple choices and submits all answers to the exact thread", async () => {
    showInput();
    choice(0).click();
    await vi.advanceTimersByTimeAsync(199);
    expect(document.querySelector(".request-question")?.textContent).toBe("Which display?");
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector(".request-question")?.textContent).toBe("Select features");
    expect(primary().disabled).toBe(true);
    choice(0).click();
    choice(1).click();
    expect(document.querySelectorAll('[aria-checked="true"]')).toHaveLength(2);
    expect(document.querySelector(".request-custom")).toBeNull();
    primary().click();
    expect(document.querySelector(".request-question")?.textContent).toBe("Anything else?");
    answer().value = " Keep it simple ";
    answer().dispatchEvent(new Event("input", { bubbles: true }));
    primary().click();
    expect(ipcRenderer.send).toHaveBeenCalledWith(TASK_ACTIVITY_PANEL_CHANNEL, {
      action: "respond",
      response: {
        ...inputTarget,
        kind: "input",
        answers: { " choice ": " internal ", features: ["A", "B"], notes: "Keep it simple" },
      },
    });
    expect(primary().disabled).toBe(true);
  });
  it("cancels automatic choice submission when typing, hiding, or dismissing the popup", async () => {
    const one = {
      ...inputTask,
      requests: [{ ...inputRequest, questions: [inputRequest.questions[0]!] }],
    };
    showInput([one]);
    choice(0).click();
    answer().value = "A custom answer";
    answer().dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);
    expect(ipcRenderer.send).not.toHaveBeenCalledWith(
      TASK_ACTIVITY_PANEL_CHANNEL,
      expect.objectContaining({ action: "respond" }),
    );
    showInput([one, { ...one, threadId: ThreadId.make("next-question") }]);
    choice(0).click();
    document.querySelector<HTMLButtonElement>('[aria-label="Next request"]')!.click();
    await vi.advanceTimersByTimeAsync(200);
    expect(ipcRenderer.send).not.toHaveBeenCalledWith(
      TASK_ACTIVITY_PANEL_CHANNEL,
      expect.objectContaining({ action: "respond" }),
    );
    choice(0).click();
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(200);
    expect(ipcRenderer.send).not.toHaveBeenCalledWith(
      TASK_ACTIVITY_PANEL_CHANNEL,
      expect.objectContaining({ action: "respond" }),
    );
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    choice(0).click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);
    expect(ipcRenderer.send).toHaveBeenCalledWith(TASK_ACTIVITY_PANEL_CHANNEL, "collapse");
    expect(ipcRenderer.send).not.toHaveBeenCalledWith(
      TASK_ACTIVITY_PANEL_CHANNEL,
      expect.objectContaining({ action: "respond" }),
    );
  });
  it("keeps a tucked-away answer, clears resolved drafts, and navigates waiting threads", () => {
    const second: DesktopTask = {
      ...inputTask,
      environmentId: EnvironmentId.make("another-server"),
      title: "Second thread",
    };
    const secondTarget = { ...inputTarget, environmentId: second.environmentId };
    showInput([inputTask, second]);
    answer().value = "First draft";
    answer().dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[aria-label="Next request"]')!.click();
    expect(ipcRenderer.send).toHaveBeenCalledWith(TASK_ACTIVITY_PANEL_CHANNEL, {
      action: "show-request",
      target: secondTarget,
    });
    showInput([inputTask, second], secondTarget);
    expect(answer().value).toBe("");
    answer().value = "Second draft";
    answer().dispatchEvent(new Event("input", { bubbles: true }));
    publish([inputTask, second]);
    showInput([inputTask, second]);
    expect(answer().value).toBe("First draft");
    showInput([second], secondTarget);
    expect(answer().value).toBe("Second draft");
    showInput([inputTask, second]);
    expect(answer().value).toBe("");
  });
  it("shows response errors and keeps the answer available for retry", () => {
    showInput();
    document.querySelector<HTMLButtonElement>(".request-actions button")!.click();
    expect(ipcRenderer.send).toHaveBeenCalledWith(TASK_ACTIVITY_PANEL_CHANNEL, {
      action: "respond",
      response: { ...inputTarget, kind: "dismiss" },
    });
    reply({ ...inputTarget, error: "Connection interrupted" });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Connection interrupted");
    expect(document.querySelector<HTMLTextAreaElement>(".request-custom")?.disabled).toBe(false);
    expect(document.querySelector<HTMLFieldSetElement>("fieldset")?.disabled).toBe(false);
  });
  it("leaves the current answer focused when another waiting request joins the queue", () => {
    showInput();
    const field = answer();
    field.value = "Keep typing";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.focus();
    const second = { ...inputTask, threadId: ThreadId.make("new-waiting-thread") };
    showInput([inputTask, second]);
    expect(answer()).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("Keep typing");
    expect(document.querySelector(".request-footer")?.textContent).toContain("1 of 2 requests");
  });
  it("shows provider failures that arrive after the command was queued and preserves the draft for retry", () => {
    const one: DesktopTask = {
      ...inputTask,
      requests: [{ ...inputRequest, questions: [inputRequest.questions[2]!] }],
    };
    showInput([one]);
    answer().value = "My response";
    answer().dispatchEvent(new Event("input", { bubbles: true }));
    primary().click();
    const failed: DesktopTask = {
      ...one,
      requests: [
        {
          ...inputRequest,
          questions: [inputRequest.questions[2]!],
          responseFailure: { activityId: "failure-1", message: "Provider disconnected" },
        },
      ],
    };
    showInput([failed]);
    reply({ ...inputTarget, error: null });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Provider disconnected");
    expect(answer().value).toBe("My response");
    expect(primary().disabled).toBe(false);
    primary().click();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(primary().disabled).toBe(true);
  });
  it("supports numeric choices, keeps typing separate from shortcuts, and traps Tab inside the request", async () => {
    showInput();
    const field = answer();
    field.focus();
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);
    expect(document.querySelector(".request-question")?.textContent).toBe("Which display?");
    const last = document.querySelectorAll<HTMLButtonElement>(".request-footer button").item(1);
    last.focus();
    last.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(choice(0));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true }));
    await vi.advanceTimersByTimeAsync(200);
    expect(document.querySelector(".request-question")?.textContent).toBe("Select features");
    const back = document.querySelector<HTMLButtonElement>(".request-actions button")!;
    back.click();
    expect(choice(1).getAttribute("aria-checked")).toBe("true");
  });
  it("renders complete approvals, provider warnings and persistence choices", () => {
    const approval: DesktopTask = {
      ...inputTask,
      requests: [
        {
          kind: "approval",
          requestId: inputTarget.requestId,
          requestKind: "mcp-elicitation",
          appName: "Safari",
          detail: "Allow access?\nRead the complete request.",
          options: [
            { decision: "decline", label: "Decline" },
            { decision: "acceptAlways", label: "Always allow", warning: "Allows future access" },
            { decision: "accept", label: "Approve" },
          ],
        },
      ],
    };
    showInput([approval]);
    expect(document.querySelector(".request-approval-detail")?.textContent).toBe(
      "Allow access?\nRead the complete request.",
    );
    expect(document.querySelector(".request-warning")?.textContent).toContain(
      "Allows future access",
    );
    const always = [
      ...document.querySelectorAll<HTMLButtonElement>(".request-actions button"),
    ].find((node) => node.textContent === "Always allow")!;
    always.click();
    expect(ipcRenderer.send).toHaveBeenCalledWith(TASK_ACTIVITY_PANEL_CHANNEL, {
      action: "respond",
      response: { ...inputTarget, kind: "approval", decision: "acceptAlways" },
    });
  });
});

afterEach(() => {
  window.dispatchEvent(new Event("unload"));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("live task panel", () => {
  it("rotates the matching title, model, icon and duration on the four-second deadline", async () => {
    publish();
    expect(header()).toBe("Keyboard navigation");
    expect(clock()).toBe("5m 0s");
    expect(document.querySelector("#identity img")?.getAttribute("src")).toBe(
      tasks[0]?.projectIcon,
    );
    await vi.advanceTimersByTimeAsync(3_999);
    publish();
    expect(header()).toBe("Keyboard navigation");
    await vi.advanceTimersByTimeAsync(1);
    expect(header()).toBe("Landing page");
    expect(clock()).toBe("1m 4s");
    expect(document.querySelector("#metadata .model-icon img")?.getAttribute("src")).toBe(
      tasks[1]?.modelIcon,
    );
    expect(document.querySelector("#metadata .model")).toBeNull();
    expect(document.querySelector("#summary")?.getAttribute("aria-label")).toContain(
      "Claude Sonnet",
    );
    await vi.advanceTimersByTimeAsync(4_000);
    expect(header()).toBe("Keyboard navigation");
    expect(clock()).toBe("5m 8s");
    expect(animate).not.toHaveBeenCalled();
  });
  it("updates all clocks but pauses rotation while expanded", async () => {
    publish(tasks, true);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(document.querySelector(".app-name")?.textContent).toBe("After Dark");
    expect(
      [...document.querySelectorAll(".task .elapsed")].map((node) => node.textContent),
    ).toEqual(["5m 8s", "1m 8s"]);
    expect(
      [...document.querySelectorAll(".task .model-icon img")].map((image) =>
        image.getAttribute("src"),
      ),
    ).toEqual(tasks.map((task) => task.modelIcon));
    document.querySelector<HTMLButtonElement>(".task:last-child")!.click();
    expect(ipcRenderer.send).toHaveBeenCalledWith(TASK_ACTIVITY_PANEL_CHANNEL, {
      environmentId: "remote",
      threadId: "two",
    });
    publish(tasks, false);
    expect(header()).toBe("Keyboard navigation");
  });
  it("shows app branding and a live running count only in the expanded header", async () => {
    publish();
    await vi.advanceTimersByTimeAsync(4_000);
    publish(tasks, true);
    expect(document.querySelector(".app-name")?.textContent).toBe("After Dark");
    expect(document.querySelector(".app-icon img")?.getAttribute("src")).toBe(
      "data:image/png;base64,YXBw",
    );
    expect(document.querySelector(".task-count")?.textContent).toBe("1 running");
    expect(clock()).toBeUndefined();
    publish(
      tasks.map((task) => ({ ...task, status: "running" as const })),
      true,
    );
    expect(document.querySelector(".task-count")?.textContent).toBe("2 running");
    publish(
      tasks.map((task) => ({ ...task, status: "approval" as const })),
      true,
    );
    expect(document.querySelector(".task-count")?.textContent).toBe("0 running");
    publish(tasks, false);
    expect(header()).toBe("Landing page");
    expect(document.querySelector(".app-name")).toBeNull();
    expect(clock()).toBe("1m 4s");
  });
  it("refreshes app branding without a task update and supports the T3 Code fallback", () => {
    publish(tasks, true);
    publish(tasks, true, { name: "T3 Code", icon: null });
    expect(document.querySelector(".app-name")?.textContent).toBe("T3 Code");
    expect(document.querySelector(".app-icon")?.textContent).toBe("T3");
    expect(document.querySelector("#summary")?.getAttribute("aria-label")).toContain(
      "T3 Code, 1 running",
    );
  });
  it("removes completed tasks and resets the clock for a new turn in the same thread", async () => {
    publish();
    await vi.advanceTimersByTimeAsync(4_000);
    publish([{ ...tasks[0]!, startedAt: "2026-10-24T10:05:04Z" }]);
    expect(header()).toBe("Keyboard navigation");
    expect(clock()).toBe("0s");
    expect(document.querySelectorAll(".task")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(clock()).toBe("4s");
    expect(document.querySelector("#summary")?.getAttribute("aria-label")).toContain("4s");
  });
  it("stops timers while hidden and catches up on return", async () => {
    publish();
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(clock()).toBe("6m 0s");
    expect(vi.getTimerCount()).toBe(1);
    window.dispatchEvent(new Event("unload"));
    expect(vi.getTimerCount()).toBe(0);
  });
  it("animates the two header wings together when motion is enabled", async () => {
    reduce = false;
    publish();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(animate).toHaveBeenCalledTimes(4);
    expect(header()).toBe("Landing page");
  });
});
