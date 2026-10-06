// @effect-diagnostics nodeBuiltinImport:off - the prompt reads text the claim step wrote to disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { ChatAttachmentId, ChatFileAttachment } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";

import { resolvePdfTextPath } from "../attachmentStore.ts";
import { providerMessageTextWithAttachmentPaths } from "./AttachmentPrompt.ts";

it("inlines a claimed PDF's extracted text after its path", () => {
  const attachmentsDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-pdf-prompt-"));
  try {
    const attachment = ChatFileAttachment.make({
      id: ChatAttachmentId.make("thread-a-00000000-0000-4000-8000-000000000001"),
      type: "file",
      name: "spec.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
    });
    const textPath = resolvePdfTextPath({ attachmentsDir, attachmentId: attachment.id })!;
    NodeFS.mkdirSync(NodePath.dirname(textPath), { recursive: true });
    NodeFS.writeFileSync(textPath, "Page one text");

    const text = providerMessageTextWithAttachmentPaths({
      text: "Summarize this",
      attachments: [attachment],
      attachmentsDir,
    });
    assert.include(text, `[Complete extracted text for "spec.pdf" is saved at: ${textPath}]`);
    assert.include(text, '<attached_pdf name="spec.pdf">\nPage one text\n</attached_pdf>');

    NodeFS.rmSync(textPath);
    const withoutText = providerMessageTextWithAttachmentPaths({
      text: "Summarize this",
      attachments: [attachment],
      attachmentsDir,
    });
    assert.notInclude(withoutText, "attached_pdf");
    assert.include(withoutText, '[Attached file "spec.pdf" is saved at:');
  } finally {
    NodeFS.rmSync(attachmentsDir, { recursive: true, force: true });
  }
});
