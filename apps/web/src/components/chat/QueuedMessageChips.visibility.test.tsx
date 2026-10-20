// @vitest-environment jsdom

import { act, cloneElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { QueuedPrompt } from "@t3tools/client-runtime/state/queued-prompts";
import { MessageId, RunId } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { QueuedMessageChips } from "./QueuedMessageChips";

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render, children }: { render: ReactElement; children: ReactNode }) =>
    cloneElement(render, {}, children),
  TooltipPopup: () => null,
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

// The queue sits above the composer on its own, outside the banner dock.
it("shows duplicate queued prompts and disappears when emptied", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  let queuedMessages: ReadonlyArray<QueuedPrompt> = [];
  const renderQueue = () => {
    root!.render(
      <QueuedMessageChips
        queuedMessages={queuedMessages}
        onSteer={vi.fn()}
        onRemove={(messageId) => {
          queuedMessages = queuedMessages.filter((message) => message.messageId !== messageId);
          renderQueue();
        }}
        onUpdate={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
  };
  const queue = () => host!.querySelector('[aria-label="Prompt queue"]');
  await act(renderQueue);
  expect(queue()).toBeNull();

  queuedMessages = ["first", "second"].map((id) => ({
    messageId: MessageId.make(id),
    runId: RunId.make(`run-${id}`),
    text: "This is a test message.",
    attachments: [],
    queuedAt: "2026-10-06T15:39:58.623Z",
    holdUntilUserAction: false,
  }));
  await act(renderQueue);
  expect([...queue()!.querySelectorAll("ol > li")].map((row) => row.textContent)).toEqual([
    expect.stringContaining("This is a test message."),
    expect.stringContaining("This is a test message."),
  ]);

  const removeFirst = () =>
    host!.querySelector<HTMLButtonElement>('button[aria-label="Remove queued message"]')!.click();
  await act(removeFirst);
  expect(queue()!.querySelectorAll("ol > li")).toHaveLength(1);
  await act(removeFirst);
  expect(queue()).toBeNull();
});
