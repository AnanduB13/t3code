import type { ComposerPastedTextAttachment } from "~/composerDraftStore";

export const PASTED_TEXT_ATTACHMENT_THRESHOLD = 1_000;

export function shouldAttachPastedText(text: string): boolean {
  return text.length >= PASTED_TEXT_ATTACHMENT_THRESHOLD;
}

export function appendPastedTextsToPrompt(
  prompt: string,
  pastedTexts: ReadonlyArray<ComposerPastedTextAttachment>,
): string {
  if (pastedTexts.length === 0) return prompt;
  const sections = pastedTexts.map(
    (item, index) => `<pasted_text_${index + 1}>\n${item.text}\n</pasted_text_${index + 1}>`,
  );
  return [prompt.trimEnd(), ...sections].filter(Boolean).join("\n\n");
}
