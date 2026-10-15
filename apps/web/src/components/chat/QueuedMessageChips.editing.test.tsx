// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { QueuedPrompt } from "@t3tools/client-runtime/state/queued-prompts";
import { MessageId, RunId } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { QueuedMessageChips } from "./QueuedMessageChips";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let keyListener: ((event: KeyboardEvent) => void) | undefined;

afterEach(async () => {
  await act(() => root?.unmount());
  container?.remove();
  if (keyListener) document.body.removeEventListener("keydown", keyListener);
  keyListener = undefined;
  vi.unstubAllGlobals();
});

async function renderQueue(attachments: QueuedPrompt["attachments"] = []) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const onUpdate = vi.fn();

  function Queue() {
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

  await act(() => root!.render(<Queue />));
  return onUpdate;
}

function button(label: string) {
  return container!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

async function startEdit() {
  await act(() => button("Edit queued message").click());
  return container!.querySelector("textarea")!;
}

async function typeText(input: HTMLTextAreaElement, text: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("focuses the edit field, allows caret placement, and saves multiline changes", async () => {
  const onUpdate = await renderQueue();
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
  expect(container!.querySelector("textarea")).toBeNull();
  expect(container!.textContent).toContain("Updated prompt\nwith a second line");
});

it("discards cancelled edits and handles save/cancel shortcuts without bubbling", async () => {
  const onUpdate = await renderQueue();
  let input = await startEdit();
  await typeText(input, "Discard this");
  await act(() => button("Cancel editing queued prompt").click());
  expect(onUpdate).not.toHaveBeenCalled();

  input = await startEdit();
  expect(input.value).toBe("Original prompt");
  const bubbledKey = vi.fn();
  keyListener = bubbledKey;
  document.body.addEventListener("keydown", bubbledKey);
  const escape = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  await act(() => input.dispatchEvent(escape));
  expect(escape.defaultPrevented).toBe(true);
  expect(bubbledKey).not.toHaveBeenCalled();
  expect(container!.querySelector("textarea")).toBeNull();
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
  const onUpdate = await renderQueue();
  const input = await startEdit();
  await typeText(input, "   ");
  expect(button("Save queued prompt").disabled).toBe(true);
  await act(() => button("Save queued prompt").click());
  expect(onUpdate).not.toHaveBeenCalled();

  await act(() => root!.unmount());
  container!.remove();
  const attachmentUpdate = await renderQueue([
    {
      type: "image",
      id: "image",
      name: "reference.png",
      mimeType: "image/png",
      sizeBytes: 1,
    },
  ]);
  await typeText(await startEdit(), "");
  expect(button("Save queued prompt").disabled).toBe(false);
  await act(() => button("Save queued prompt").click());
  expect(attachmentUpdate).toHaveBeenCalledExactlyOnceWith("queued", "");
  expect(container!.textContent).toContain("reference.png");
});
