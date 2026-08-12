import { describe, expect, it } from "vite-plus/test";

import {
  appendPastedTextsToPrompt,
  extractTrailingPastedTexts,
  PASTED_TEXT_ATTACHMENT_THRESHOLD,
  shouldAttachPastedText,
} from "./composerPastedText";

describe("composer pasted text", () => {
  it("only turns long clipboard text into an attachment", () => {
    expect(shouldAttachPastedText("a".repeat(PASTED_TEXT_ATTACHMENT_THRESHOLD - 1))).toBe(false);
    expect(shouldAttachPastedText("a".repeat(PASTED_TEXT_ATTACHMENT_THRESHOLD))).toBe(true);
  });

  it("appends numbered pasted text sections without changing their contents", () => {
    expect(
      appendPastedTextsToPrompt("Please inspect this", [
        { id: "one", text: "first\nblock" },
        { id: "two", text: "second block" },
      ]),
    ).toBe(
      "Please inspect this\n\n<pasted_text_1>\nfirst\nblock\n</pasted_text_1>\n\n<pasted_text_2>\nsecond block\n</pasted_text_2>",
    );
  });

  it("builds a sendable prompt from pasted text without a typed caption", () => {
    expect(appendPastedTextsToPrompt("", [{ id: "only", text: "the full error" }])).toBe(
      "<pasted_text_1>\nthe full error\n</pasted_text_1>",
    );
  });

  it("extracts trailing pasted text blocks for compact sent-message rendering", () => {
    const prompt = appendPastedTextsToPrompt("Please inspect this", [
      { id: "one", text: "first\nblock" },
      { id: "two", text: "second block" },
    ]);

    expect(extractTrailingPastedTexts(prompt)).toEqual({
      promptText: "Please inspect this",
      pastedTexts: [
        { id: "sent-pasted-text-1", text: "first\nblock" },
        { id: "sent-pasted-text-2", text: "second block" },
      ],
    });
  });

  it("does not hide pasted-text syntax that is not a trailing attachment block", () => {
    const prompt = "Explain <pasted_text_1> as literal syntax, please.";
    expect(extractTrailingPastedTexts(prompt)).toEqual({ promptText: prompt, pastedTexts: [] });
  });
});
