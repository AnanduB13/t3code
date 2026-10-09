import { act, cloneElement, type ReactElement, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import type { QueuedPrompt } from "@t3tools/client-runtime/state/queued-prompts";
import { MessageId, RunId } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";

// Keep the selection interaction headless; the shared dialog owns portal/focus behavior.
vi.mock("../ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? children : null),
  DialogPopup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render, children }: { render: ReactElement; children: ReactNode }) =>
    cloneElement(render, {}, children),
  TooltipPopup: () => null,
}));

import { QueuedMessageChips } from "./QueuedMessageChips";

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});

it("preselects only the clicked prompt, allows explicit additions, and cancels without sending", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const queuedMessages: QueuedPrompt[] = ["B", "C", "D"].map((id) => ({
    messageId: MessageId.make(id),
    runId: RunId.make(`run-${id}`),
    holdUntilUserAction: false,
    text: id,
    attachments: [],
    queuedAt: "2026-09-13T00:00:00Z",
  }));
  const onSteer = vi.fn();
  await act(async () => {
    renderer = create(
      <QueuedMessageChips
        queuedMessages={queuedMessages}
        onSteer={onSteer}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
  });
  const buttons = () => renderer!.root.findAllByType("button");
  const steerC = () =>
    buttons().find((button) => button.props["aria-label"] === "Steer queued prompt 2")!;
  const confirm = () => buttons().find((button) => button.children.includes("Steer selected ("))!;
  await act(async () => steerC().props.onClick());
  expect(onSteer).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType("input").map((input) => input.props.checked)).toEqual([
    false,
    true,
    false,
  ]);
  await act(async () => confirm().props.onClick());
  expect(onSteer).toHaveBeenLastCalledWith("C", ["C"]);

  await act(async () => steerC().props.onClick());
  await act(async () =>
    renderer!.root.findAllByType("input")[2]!.props.onChange({ target: { checked: true } }),
  );
  await act(async () => confirm().props.onClick());
  expect(onSteer).toHaveBeenLastCalledWith("D", ["C", "D"]);

  await act(async () => steerC().props.onClick());
  await act(async () =>
    renderer!.root.findAllByType("input")[1]!.props.onChange({ target: { checked: false } }),
  );
  expect(confirm().props.disabled).toBe(true);
  await act(async () =>
    buttons()
      .find((button) => button.children.includes("Cancel"))!
      .props.onClick(),
  );
  expect(renderer!.root.findAllByType("input")).toHaveLength(0);
  expect(onSteer).toHaveBeenCalledTimes(2);
});

it("collapses long queues into a summary until the user expands them", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const queued = (ids: string[]): QueuedPrompt[] =>
    ids.map((id) => ({
      messageId: MessageId.make(id),
      runId: RunId.make(`run-${id}`),
      holdUntilUserAction: false,
      text: `prompt ${id}`,
      attachments: [],
      queuedAt: "2026-09-13T00:00:00Z",
    }));
  const render = (queuedMessages: QueuedPrompt[]) => (
    <QueuedMessageChips
      queuedMessages={queuedMessages}
      onSteer={vi.fn()}
      onRemove={vi.fn()}
      onUpdate={vi.fn()}
      onReorder={vi.fn()}
    />
  );
  const button = (label: string) =>
    renderer!.root
      .findAllByType("button")
      .find((candidate) => candidate.props["aria-label"] === label);
  const rowCount = () => renderer!.root.findAllByType("li").length;

  await act(async () => {
    renderer = create(render(queued(["A", "B", "C"])));
  });
  expect(rowCount()).toBe(3);

  await act(async () => renderer!.update(render(queued(["A", "B", "C", "D"]))));
  expect(rowCount()).toBe(0);
  await act(async () => button("Show all 4 queued prompts")!.props.onClick());
  expect(rowCount()).toBe(4);

  // The expand choice survives new prompts arriving.
  await act(async () => renderer!.update(render(queued(["A", "B", "C", "D", "E"]))));
  expect(rowCount()).toBe(5);
  await act(async () =>
    renderer!.root
      .findAllByType("button")
      .find((candidate) => candidate.children.includes("Collapse"))!
      .props.onClick(),
  );
  expect(button("Show all 5 queued prompts")).toBeDefined();

  // Draining the queue resets to automatic collapsing.
  await act(async () => button("Show all 5 queued prompts")!.props.onClick());
  await act(async () => renderer!.update(render([])));
  await act(async () => renderer!.update(render(queued(["F", "G", "H", "I"]))));
  expect(rowCount()).toBe(0);
});
