export interface ComposerPastedTextAttachment {
  readonly id: string;
  readonly text: string;
}

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

export interface ExtractedPastedTexts {
  readonly promptText: string;
  readonly pastedTexts: ReadonlyArray<ComposerPastedTextAttachment>;
}

const TRAILING_PASTED_TEXTS_PATTERN =
  /(?:^|\n\n)<pasted_text_(\d+)>\n([\s\S]*?)\n<\/pasted_text_\1>(?=\n\n<pasted_text_\d+>|\s*$)/g;

/**
 * Separates the send-only pasted-text blocks from a persisted user message.
 * The full message remains stored and is still sent to the provider; callers
 * use this result only to render the compact attachment presentation.
 */
export function extractTrailingPastedTexts(prompt: string): ExtractedPastedTexts {
  const matches = [...prompt.matchAll(TRAILING_PASTED_TEXTS_PATTERN)];
  if (matches.length === 0) return { promptText: prompt, pastedTexts: [] };

  const first = matches[0];
  const last = matches.at(-1);
  if (first?.index === undefined || last?.index === undefined) {
    return { promptText: prompt, pastedTexts: [] };
  }

  const lastEnd = last.index + last[0].length;
  if (prompt.slice(lastEnd).trim().length > 0) {
    return { promptText: prompt, pastedTexts: [] };
  }

  const pastedTexts = matches.map((match, index) => ({
    id: `sent-pasted-text-${match[1] ?? index + 1}`,
    text: match[2] ?? "",
  }));

  return {
    promptText: prompt.slice(0, first.index).replace(/\n+$/, ""),
    pastedTexts,
  };
}
