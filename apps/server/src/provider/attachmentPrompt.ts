import {
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type ChatAttachment,
  type ChatPdfAttachment,
} from "@t3tools/contracts";

export interface ResolvedProviderAttachment {
  readonly attachment: ChatAttachment;
  readonly originalPath: string;
  readonly extractedTextPath?: string;
  readonly extractedText?: string;
}

const pdfPathPrompt = (
  attachment: ChatPdfAttachment,
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
  const parts = input.text ? [input.text] : [];
  let characterCount = input.text?.length ?? 0;

  for (const resolved of input.attachments) {
    if (resolved.attachment.type === "image") {
      parts.push(
        `[Attached image "${resolved.attachment.name}" is saved at: ${resolved.originalPath}]`,
      );
      continue;
    }

    const extractedTextPath = resolved.extractedTextPath;
    const extractedText = resolved.extractedText;
    if (!extractedTextPath || extractedText === undefined) continue;

    const pathPrompt = pdfPathPrompt(resolved.attachment, resolved.originalPath, extractedTextPath);
    const inlinePrompt = [
      pathPrompt,
      `<attached_pdf name=${JSON.stringify(resolved.attachment.name)}>`,
      extractedText,
      "</attached_pdf>",
    ].join("\n");
    const separatorChars = parts.length === 0 ? 0 : 2;
    if (
      characterCount + separatorChars + inlinePrompt.length <=
      PROVIDER_SEND_TURN_MAX_INPUT_CHARS
    ) {
      parts.push(inlinePrompt);
      characterCount += separatorChars + inlinePrompt.length;
    } else {
      parts.push(
        `${pathPrompt}\nThe extracted text was not inlined because of its size. Read the complete extracted-text file before answering about this PDF.`,
      );
    }
  }

  return parts.length === 0 ? undefined : parts.join("\n\n");
}
