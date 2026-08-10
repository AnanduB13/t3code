import { MessageId, type OrchestrationQueuedMessage } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { QueuedMessageChips } from "./QueuedMessageChips";

const queuedMessage = (
  messageId: string,
  text: string,
  attachmentCount = 0,
): OrchestrationQueuedMessage => ({
  messageId: MessageId.make(messageId),
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

describe("QueuedMessageChips", () => {
  it("renders server-queued messages in order with steer and remove actions", () => {
    const markup = renderToStaticMarkup(
      <QueuedMessageChips
        queuedMessages={[
          queuedMessage("first", "Check the failing tests"),
          queuedMessage("second", "Then update the docs"),
        ]}
        onSteer={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(markup.indexOf("Check the failing tests")).toBeLessThan(
      markup.indexOf("Then update the docs"),
    );
    expect(markup.match(/aria-label="Steer queued prompt 1"/g)).toHaveLength(1);
    expect(markup.match(/aria-label="Steer queued prompts 1 through 2"/g)).toHaveLength(1);
    expect(markup.match(/aria-label="Remove queued message"/g)).toHaveLength(2);
  });

  it("uses an attachment summary for an attachment-only queued message", () => {
    const markup = renderToStaticMarkup(
      <QueuedMessageChips
        queuedMessages={[queuedMessage("attachment-only", "", 2)]}
        onSteer={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(markup).toContain("2 attachment(s)");
  });

  it("keeps remove available while steer waits for a running turn", () => {
    const markup = renderToStaticMarkup(
      <QueuedMessageChips
        queuedMessages={[queuedMessage("waiting", "Waiting follow-up")]}
        steerDisabled
        onSteer={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(markup).toMatch(/<button[^>]*disabled[^>]*aria-label="Steer queued prompt 1"/);
    const removeButton = markup.match(/<button[^>]*aria-label="Remove queued message"[^>]*>/)?.[0];
    expect(removeButton).toBeDefined();
    expect(removeButton).not.toContain(' disabled=""');
  });

  it("renders nothing for an empty queue", () => {
    expect(
      renderToStaticMarkup(
        <QueuedMessageChips queuedMessages={[]} onSteer={vi.fn()} onRemove={vi.fn()} />,
      ),
    ).toBe("");
  });
});
