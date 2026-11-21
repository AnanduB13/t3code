import { cloneElement, useState, type ReactElement, type ReactNode } from "react";
import type { QueuedPrompt } from "@t3tools/client-runtime/state/queued-prompts";
import { MessageId, RunId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { QueuedMessageChips } from "./QueuedMessageChips";

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render, children }: { render: ReactElement; children: ReactNode }) =>
    cloneElement(render, {}, children),
  TooltipPopup: () => null,
}));

function Queue({ messages }: { messages: ReadonlyArray<QueuedPrompt> }) {
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  return (
    <QueuedMessageChips
      queuedMessages={messages.filter((message) => !removed.has(message.messageId))}
      onSteer={vi.fn()}
      onRemove={(messageId) => setRemoved((current) => new Set(current).add(messageId))}
      onUpdate={vi.fn()}
      onReorder={vi.fn()}
    />
  );
}

// The queue sits above the composer on its own, outside the banner dock.
it("shows duplicate queued prompts and disappears when emptied", async () => {
  await using screen = await render(<Queue messages={[]} />);
  const host = screen.container;
  const queue = () => host.querySelector('[aria-label="Prompt queue"]');
  expect(queue()).toBeNull();

  const queuedMessages = ["first", "second"].map((id) => ({
    messageId: MessageId.make(id),
    runId: RunId.make(`run-${id}`),
    text: "This is a test message.",
    attachments: [],
    queuedAt: "2026-10-06T15:39:58.623Z",
    holdUntilUserAction: false,
  }));
  await screen.rerender(<Queue messages={queuedMessages} />);
  expect([...queue()!.querySelectorAll("ol > li")].map((row) => row.textContent)).toEqual([
    expect.stringContaining("This is a test message."),
    expect.stringContaining("This is a test message."),
  ]);

  const removeFirst = () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Remove queued message"]')!.click();
  await act(removeFirst);
  expect(queue()!.querySelectorAll("ol > li")).toHaveLength(1);
  await act(removeFirst);
  expect(queue()).toBeNull();
});
