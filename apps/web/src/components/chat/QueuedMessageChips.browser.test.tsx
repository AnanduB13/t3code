import type { QueuedPrompt } from "@t3tools/client-runtime/state/queued-prompts";
import { MessageId, RunId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { QueuedMessageChips } from "./QueuedMessageChips";

const queuedMessage = (messageId: string, text: string, attachmentCount = 0): QueuedPrompt => ({
  messageId: MessageId.make(messageId),
  runId: RunId.make(`run-${messageId}`),
  holdUntilUserAction: false,
  text,
  attachments: Array.from({ length: attachmentCount }, (_, index) => ({
    type: "image" as const,
    id: `attachment-${index + 1}`,
    name: `image-${index + 1}.png`,
    mimeType: "image/png",
    sizeBytes: 1,
  })),
  queuedAt: "2026-07-23T10:00:00.000Z",
});

const handlers = () => ({
  onSteer: vi.fn(),
  onRemove: vi.fn(),
  onUpdate: vi.fn(),
  onReorder: vi.fn(),
});

describe("QueuedMessageChips", () => {
  it("renders server-queued messages in order with steer and remove actions", async () => {
    await using screen = await render(
      <QueuedMessageChips
        queuedMessages={[
          queuedMessage("first", "Check the failing tests"),
          queuedMessage("second", "Then update the docs"),
        ]}
        {...handlers()}
      />,
    );

    const rows = [...screen.container.querySelectorAll("ol > li")].map((row) => row.textContent);
    expect(rows).toEqual([
      expect.stringContaining("Check the failing tests"),
      expect.stringContaining("Then update the docs"),
    ]);
    await expect
      .element(screen.getByRole("button", { name: "Steer queued prompt 1" }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Steer queued prompt 2" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Reorder queued prompt/ }).all()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Edit queued message" }).all()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Remove queued message" }).all()).toHaveLength(2);
  });

  it("uses an attachment summary for an attachment-only queued message", async () => {
    await using screen = await render(
      <QueuedMessageChips
        queuedMessages={[queuedMessage("attachment-only", "", 2)]}
        attachmentUrlById={
          new Map([["attachment-1", "https://assets.example.test/attachment-1.png"]])
        }
        {...handlers()}
      />,
    );

    await expect.element(screen.getByText("image-1.png, image-2.png")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("img", { name: "image-1.png" }))
      .toHaveAttribute("src", "https://assets.example.test/attachment-1.png");
    await expect.element(screen.getByLabelText("image-2.png")).toBeInTheDocument();
  });

  it("shows queued image attachments alongside prompt text", async () => {
    await using screen = await render(
      <QueuedMessageChips
        queuedMessages={[queuedMessage("with-image", "Fix the layout", 1)]}
        attachmentUrlById={new Map([["attachment-1", "/attachment-preview.png"]])}
        {...handlers()}
      />,
    );

    await expect.element(screen.getByText("Fix the layout")).toBeInTheDocument();
    await expect
      .element(screen.getByRole("img", { name: "image-1.png" }))
      .toHaveAttribute("src", "/attachment-preview.png");
    await expect
      .element(screen.getByLabelText("1 queued attachment: image-1.png"))
      .toBeInTheDocument();
  });

  it("keeps remove available while steer waits for a running turn", async () => {
    await using screen = await render(
      <QueuedMessageChips
        queuedMessages={[queuedMessage("waiting", "Waiting follow-up")]}
        steerDisabled
        {...handlers()}
      />,
    );

    await expect
      .element(screen.getByRole("button", { name: "Steer queued prompt 1" }))
      .toBeDisabled();
    await expect
      .element(screen.getByRole("button", { name: "Remove queued message" }))
      .toBeEnabled();
  });

  it("renders nothing for an empty queue", async () => {
    await using screen = await render(<QueuedMessageChips queuedMessages={[]} {...handlers()} />);

    expect(screen.container.innerHTML).toBe("");
  });
});
