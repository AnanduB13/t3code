import { describe, expect, it } from "vite-plus/test";

import {
  appendPastedTextsToPrompt,
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
});
