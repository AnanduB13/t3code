import { ComposerContextId, MessageId, type OrchestrationQueuedMessage } from "@t3tools/contracts";
import { collectComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import { describe, expect, it } from "vite-plus/test";
import { prepareQueuedMessageContext } from "./queuedMessageRestore";

const message: OrchestrationQueuedMessage = {
  messageId: MessageId.make("queued"),
  text: "Check [Terminal](t3-context://v1/terminal/terminal_same)",
  queuedAt: "2026-09-30T00:00:00Z",
  attachments: [],
  context: {
    version: 1,
    records: [
      {
        version: 1,
        kind: "terminal",
        contextId: ComposerContextId.make("terminal_same"),
        label: "Terminal",
        terminalId: "terminal-1",
        terminalLabel: "Terminal 1",
        lineStart: 1,
        lineEnd: 2,
        text: "original terminal output",
      },
    ],
  },
};

describe("queued prompt restoration", () => {
  it("keeps distinct context when two queued messages reuse the same composer chip", () => {
    const first = prepareQueuedMessageContext(message)!.message;
    const second = prepareQueuedMessageContext(message)!.message;
    const firstId = first.context!.records[0]!.contextId;
    const secondId = second.context!.records[0]!.contextId;
    expect(firstId).not.toBe(secondId);
    expect(firstId).not.toBe("terminal_same");
    expect(collectComposerContextReferences(first.text).map((record) => record.contextId)).toEqual([
      firstId,
    ]);
    expect(collectComposerContextReferences(second.text).map((record) => record.contextId)).toEqual(
      [secondId],
    );
    expect(first.context!.records[0]).toMatchObject({ text: "original terminal output" });
    expect(message.context!.records[0]!.contextId).toBe("terminal_same");
  });

  it("upgrades queued legacy terminal context instead of removing it during prompt recall", () => {
    const restored = prepareQueuedMessageContext({
      ...message,
      context: undefined,
      text: "Check @terminal-1:1\n\n<terminal_context>\n- Terminal 1 line 1:\n  1 | build failed\n</terminal_context>",
    })!.message;
    expect(restored.context!.records).toEqual([
      expect.objectContaining({ kind: "terminal", text: expect.stringContaining("build failed") }),
    ]);
    expect(collectComposerContextReferences(restored.text)).toHaveLength(1);
  });

  it("compares the original queued text even when restoring changes context references", () => {
    const prepared = prepareQueuedMessageContext(message)!;
    expect(prepared.message.text).not.toBe(message.text);
    expect(prepared.expectedText).toBe(message.text);

    const edited = prepareQueuedMessageContext({ ...message, text: "Edited on another client" })!;
    expect(prepared.expectedText).not.toBe(edited.expectedText);
  });

  it("leaves future context queued rather than returning a prompt without it", () => {
    expect(
      prepareQueuedMessageContext({
        ...message,
        context: {
          version: 1,
          records: [
            {
              version: 1,
              kind: "future",
              contextId: ComposerContextId.make("future_1"),
              label: "Future",
              payload: { content: "retain me" },
            },
          ],
        },
      }),
    ).toBeNull();
  });
});
