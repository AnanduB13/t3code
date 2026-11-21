import { cloneElement, type ReactElement, type ReactNode } from "react";
import type { QueuedPrompt } from "@t3tools/client-runtime/state/queued-prompts";
import { MessageId, RunId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";

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

function queueControls(container: HTMLElement) {
  const buttons = () => [...container.querySelectorAll("button")];
  const byLabel = (label: string) =>
    buttons().find((button) => button.getAttribute("aria-label") === label);
  const byText = (text: string) =>
    buttons().find((button) => button.textContent?.trim().startsWith(text));
  const checkboxes = () => [...container.querySelectorAll<HTMLInputElement>("input")];
  const click = (element: HTMLElement | undefined) => act(() => element!.click());
  return { byLabel, byText, checkboxes, click };
}

it("preselects only the clicked prompt, allows explicit additions, and cancels without sending", async () => {
  const queuedMessages: QueuedPrompt[] = ["B", "C", "D"].map((id) => ({
    messageId: MessageId.make(id),
    runId: RunId.make(`run-${id}`),
    holdUntilUserAction: false,
    text: id,
    attachments: [],
    queuedAt: "2026-09-13T00:00:00Z",
  }));
  const onSteer = vi.fn();
  await using screen = await render(
    <QueuedMessageChips
      queuedMessages={queuedMessages}
      onSteer={onSteer}
      onRemove={vi.fn()}
      onUpdate={vi.fn()}
      onReorder={vi.fn()}
    />,
  );
  const { byLabel, byText, checkboxes, click } = queueControls(screen.container);
  const steerC = () => byLabel("Steer queued prompt 2");
  const confirm = () => byText("Steer selected (");
  await click(steerC());
  expect(onSteer).not.toHaveBeenCalled();
  expect(checkboxes().map((input) => input.checked)).toEqual([false, true, false]);
  await click(confirm());
  expect(onSteer).toHaveBeenLastCalledWith("C", ["C"]);

  await click(steerC());
  await click(checkboxes()[2]);
  await click(confirm());
  expect(onSteer).toHaveBeenLastCalledWith("D", ["C", "D"]);

  await click(steerC());
  await click(checkboxes()[1]);
  expect(confirm()!.disabled).toBe(true);
  await click(byText("Cancel"));
  expect(checkboxes()).toHaveLength(0);
  expect(onSteer).toHaveBeenCalledTimes(2);
});

it("collapses long queues into a summary until the user expands them", async () => {
  const queued = (ids: string[]): QueuedPrompt[] =>
    ids.map((id) => ({
      messageId: MessageId.make(id),
      runId: RunId.make(`run-${id}`),
      holdUntilUserAction: false,
      text: `prompt ${id}`,
      attachments: [],
      queuedAt: "2026-09-13T00:00:00Z",
    }));
  const queue = (queuedMessages: QueuedPrompt[]) => (
    <QueuedMessageChips
      queuedMessages={queuedMessages}
      onSteer={vi.fn()}
      onRemove={vi.fn()}
      onUpdate={vi.fn()}
      onReorder={vi.fn()}
    />
  );
  await using screen = await render(queue(queued(["A", "B", "C"])));
  const { byLabel, byText, click } = queueControls(screen.container);
  const rowCount = () => screen.container.querySelectorAll("li").length;
  expect(rowCount()).toBe(3);

  await screen.rerender(queue(queued(["A", "B", "C", "D"])));
  expect(rowCount()).toBe(0);
  await click(byLabel("Show all 4 queued prompts"));
  expect(rowCount()).toBe(4);

  // The expand choice survives new prompts arriving.
  await screen.rerender(queue(queued(["A", "B", "C", "D", "E"])));
  expect(rowCount()).toBe(5);
  await click(byText("Collapse"));
  expect(byLabel("Show all 5 queued prompts")).toBeDefined();

  // Draining the queue resets to automatic collapsing.
  await click(byLabel("Show all 5 queued prompts"));
  await screen.rerender(queue([]));
  await screen.rerender(queue(queued(["F", "G", "H", "I"])));
  expect(rowCount()).toBe(0);
});
