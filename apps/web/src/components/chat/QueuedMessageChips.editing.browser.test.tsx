import { useState } from "react";
import type { QueuedPrompt } from "@t3tools/client-runtime/state/queued-prompts";
import { MessageId, RunId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { QueuedMessageChips } from "./QueuedMessageChips";

function Queue({
  attachments,
  onUpdate,
}: {
  attachments: QueuedPrompt["attachments"];
  onUpdate: (messageId: string, text: string) => void;
}) {
  const [messages, setMessages] = useState<QueuedPrompt[]>([
    {
      messageId: MessageId.make("queued"),
      runId: RunId.make("queued-run"),
      holdUntilUserAction: false,
      text: "Original prompt",
      attachments,
      queuedAt: "2026-10-10T00:00:00Z",
    },
  ]);
  return (
    <QueuedMessageChips
      queuedMessages={messages}
      onSteer={vi.fn()}
      onRemove={vi.fn()}
      onReorder={vi.fn()}
      onUpdate={(messageId, text) => {
        onUpdate(messageId, text);
        setMessages((current) =>
          current.map((message) =>
            message.messageId === messageId ? { ...message, text } : message,
          ),
        );
      }}
    />
  );
}

async function renderQueue(attachments: QueuedPrompt["attachments"] = []) {
  const onUpdate = vi.fn();
  const screen = await render(<Queue attachments={attachments} onUpdate={onUpdate} />);
  const { container } = screen;
  const button = (label: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  return {
    onUpdate,
    container,
    button,
    startEdit: async () => {
      await act(() => button("Edit queued message").click());
      return container.querySelector("textarea")!;
    },
    [Symbol.asyncDispose]: () => screen[Symbol.asyncDispose](),
  };
}

async function typeText(input: HTMLTextAreaElement, text: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function listenForBubbledKeys() {
  const listener = vi.fn();
  document.body.addEventListener("keydown", listener);
  return Object.assign(listener, {
    [Symbol.dispose]: () => document.body.removeEventListener("keydown", listener),
  });
}

it("focuses the edit field, allows caret placement, and saves multiline changes", async () => {
  await using queue = await renderQueue();
  const { onUpdate, container, button, startEdit } = queue;
  const input = await startEdit();
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("Original prompt");

  // Pointer events on the editor must retain native caret placement.
  const pointerDown = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
  await act(() => input.dispatchEvent(pointerDown));
  expect(pointerDown.defaultPrevented).toBe(false);
  input.setSelectionRange(3, 3);
  expect(input.selectionStart).toBe(3);

  await typeText(input, "Updated prompt\nwith a second line");
  await act(() => button("Save queued prompt").click());
  expect(onUpdate).toHaveBeenCalledExactlyOnceWith("queued", "Updated prompt\nwith a second line");
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.textContent).toContain("Updated prompt\nwith a second line");
});

it("discards cancelled edits and handles save/cancel shortcuts without bubbling", async () => {
  await using queue = await renderQueue();
  const { onUpdate, container, button, startEdit } = queue;
  let input = await startEdit();
  await typeText(input, "Discard this");
  await act(() => button("Cancel editing queued prompt").click());
  expect(onUpdate).not.toHaveBeenCalled();

  input = await startEdit();
  expect(input.value).toBe("Original prompt");
  using bubbledKey = listenForBubbledKeys();
  const escape = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  await act(() => input.dispatchEvent(escape));
  expect(escape.defaultPrevented).toBe(true);
  expect(bubbledKey).not.toHaveBeenCalled();
  expect(container.querySelector("textarea")).toBeNull();
  expect(onUpdate).not.toHaveBeenCalled();

  input = await startEdit();
  await typeText(input, "Save with keyboard");
  const save = new KeyboardEvent("keydown", {
    key: "Enter",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  await act(() => input.dispatchEvent(save));
  expect(save.defaultPrevented).toBe(true);
  expect(bubbledKey).not.toHaveBeenCalled();
  expect(onUpdate).toHaveBeenCalledExactlyOnceWith("queued", "Save with keyboard");
});

it("rejects an empty prompt while allowing an attachment-only edit", async () => {
  {
    await using queue = await renderQueue();
    const input = await queue.startEdit();
    await typeText(input, "   ");
    expect(queue.button("Save queued prompt").disabled).toBe(true);
    await act(() => queue.button("Save queued prompt").click());
    expect(queue.onUpdate).not.toHaveBeenCalled();
  }

  await using queue = await renderQueue([
    {
      type: "image",
      id: "image",
      name: "reference.png",
      mimeType: "image/png",
      sizeBytes: 1,
    },
  ]);
  await typeText(await queue.startEdit(), "");
  expect(queue.button("Save queued prompt").disabled).toBe(false);
  await act(() => queue.button("Save queued prompt").click());
  expect(queue.onUpdate).toHaveBeenCalledExactlyOnceWith("queued", "");
  expect(queue.container.textContent).toContain("reference.png");
});
