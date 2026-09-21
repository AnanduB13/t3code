import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS, type ChatAttachment } from "@t3tools/contracts";

export interface ResolvedProviderAttachment {
  readonly attachment: ChatAttachment;
  readonly originalPath: string;
  readonly extractedTextPath?: string;
  readonly extractedText?: string;
}

const pdfPathPrompt = (
  attachment: ChatAttachment,
  originalPath: string,
  extractedTextPath: string,
) =>
  [
    `[Attached PDF "${attachment.name}" is saved at: ${originalPath}]`,
    `[Complete extracted text for "${attachment.name}" is saved at: ${extractedTextPath}]`,
  ].join("\n");

export function buildProviderInputWithAttachments(input: {
  readonly text?: string;
  readonly attachments: ReadonlyArray<ResolvedProviderAttachment>;
}): string | undefined {
  // Reserve every file reference before deciding which PDF texts fit. Otherwise
  // an early PDF can consume space required by later attachments.
  const prompts = input.attachments.map((resolved) => {
    const { attachment, originalPath, extractedTextPath, extractedText } = resolved;
    if (attachment.type === "image") {
      return { reference: `[Attached image "${attachment.name}" is saved at: ${originalPath}]` };
    }
    if (
      "source" in attachment &&
      attachment.source &&
      "_tag" in attachment.source &&
      attachment.source._tag === "pasted-text"
    ) {
      return {
        reference: `[Pasted text "${attachment.name}" is saved at: ${originalPath}. Inspect it as needed.]`,
      };
    }
    if (attachment.mimeType.toLowerCase() !== "application/pdf") {
      return { reference: `[Attached file "${attachment.name}" is saved at: ${originalPath}]` };
    }
    if (!extractedTextPath || extractedText === undefined) {
      return { reference: `[Attached PDF "${attachment.name}" is saved at: ${originalPath}]` };
    }
    const paths = pdfPathPrompt(attachment, originalPath, extractedTextPath);
    return {
      reference: `${paths}\nThe extracted text was not inlined because of its size. Read the complete extracted-text file before answering about this PDF.`,
      inline: [
        paths,
        `<attached_pdf name=${JSON.stringify(attachment.name)}>`,
        extractedText,
        "</attached_pdf>",
      ].join("\n"),
    };
  });
  const parts = [...(input.text ? [input.text] : []), ...prompts.map(({ reference }) => reference)];
  let characterCount =
    parts.reduce((total, part) => total + part.length, 0) + Math.max(0, parts.length - 1) * 2;
  if (characterCount > PROVIDER_SEND_TURN_MAX_INPUT_CHARS) {
    throw new RangeError(
      `Input including attachment references exceeds ${PROVIDER_SEND_TURN_MAX_INPUT_CHARS} characters`,
    );
  }
  const offset = input.text ? 1 : 0;
  for (const [index, prompt] of prompts.entries()) {
    if (prompt.inline === undefined) continue;
    const nextCount = characterCount - prompt.reference.length + prompt.inline.length;
    if (nextCount <= PROVIDER_SEND_TURN_MAX_INPUT_CHARS) {
      parts[offset + index] = prompt.inline;
      characterCount = nextCount;
    }
  }
  return parts.length === 0 ? undefined : parts.join("\n\n");
}
