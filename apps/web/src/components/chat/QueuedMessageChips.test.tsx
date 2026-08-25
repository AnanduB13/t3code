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
        onUpdate={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(markup.indexOf("Check the failing tests")).toBeLessThan(
      markup.indexOf("Then update the docs"),
    );
    expect(markup).toContain('aria-label="Steer queued prompt 1"');
    expect(markup).toContain('aria-label="Steer queued prompts 1 through 2"');
    expect(markup.match(/aria-label="Reorder queued prompt/g)).toHaveLength(2);
    expect(markup.match(/aria-label="Edit queued message"/g)).toHaveLength(2);
    expect(markup.match(/aria-label="Remove queued message"/g)).toHaveLength(2);
  });

  it("uses an attachment summary for an attachment-only queued message", () => {
    const attachmentUrlById = new Map([
      ["attachment-1", "https://assets.example.test/attachment-1.png"],
    ]);
    const markup = renderToStaticMarkup(
      <QueuedMessageChips
        queuedMessages={[queuedMessage("attachment-only", "", 2)]}
        attachmentUrlById={attachmentUrlById}
        onSteer={vi.fn()}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(markup).toContain("image-1.png, image-2.png");
    expect(markup).toContain('src="https://assets.example.test/attachment-1.png"');
    expect(markup).toContain('title="image-2.png"');
  });

  it("shows queued image attachments alongside prompt text", () => {
    const markup = renderToStaticMarkup(
      <QueuedMessageChips
        queuedMessages={[queuedMessage("with-image", "Fix the layout", 1)]}
        attachmentUrlById={new Map([["attachment-1", "/attachment-preview.png"]])}
        onSteer={vi.fn()}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(markup).toContain("Fix the layout");
    expect(markup).toContain('src="/attachment-preview.png"');
    expect(markup).toContain("1 queued attachment: image-1.png");
  });

  it("keeps remove available while steer waits for a running turn", () => {
    const markup = renderToStaticMarkup(
      <QueuedMessageChips
        queuedMessages={[queuedMessage("waiting", "Waiting follow-up")]}
        steerDisabled
        onSteer={vi.fn()}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
        onReorder={vi.fn()}
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
        <QueuedMessageChips
          queuedMessages={[]}
          onSteer={vi.fn()}
          onRemove={vi.fn()}
          onUpdate={vi.fn()}
          onReorder={vi.fn()}
        />,
      ),
    ).toBe("");
  });
});
