import { describe, expect, it } from "vite-plus/test";
import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS, type ChatFileAttachment } from "@t3tools/contracts";

import { buildProviderInputWithAttachments } from "./attachmentPrompt.ts";

const pdf: ChatFileAttachment = {
  type: "file",
  id: "thread-pdf-1",
  name: "booking.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1_024,
};

const archive: ChatFileAttachment = {
  type: "file",
  id: "thread-archive-1",
  name: "sources.zip",
  mimeType: "application/zip",
  sizeBytes: 2_048,
};

describe("buildProviderInputWithAttachments", () => {
  it("inlines complete extracted PDF text when it fits", () => {
    const prompt = buildProviderInputWithAttachments({
      text: "Summarize this",
      attachments: [
        {
          attachment: pdf,
          originalPath: "/attachments/booking.pdf",
          extractedTextPath: "/attachments/booking.pdf.txt",
          extractedText: "Complete booking content",
        },
      ],
    });

    expect(prompt).toContain("Complete booking content");
    expect(prompt).toContain("<attached_pdf");
    expect(prompt).toContain("/attachments/booking.pdf.txt");
  });

  it("references the complete sidecar instead of truncating oversized text", () => {
    const extractedText = "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS);
    const prompt = buildProviderInputWithAttachments({
      text: "Read this",
      attachments: [
        {
          attachment: pdf,
          originalPath: "/attachments/booking.pdf",
          extractedTextPath: "/attachments/booking.pdf.txt",
          extractedText,
        },
      ],
    });

    expect(prompt).not.toContain(extractedText);
    expect(prompt).toContain("Read the complete extracted-text file");
    expect(prompt).toContain("/attachments/booking.pdf.txt");
  });

  it("keeps generic files and PDFs without extractable text addressable", () => {
    const prompt = buildProviderInputWithAttachments({
      attachments: [
        { attachment: archive, originalPath: "/attachments/sources.zip" },
        { attachment: pdf, originalPath: "/attachments/booking.pdf" },
      ],
    });

    expect(prompt).toContain("/attachments/sources.zip");
    expect(prompt).toContain("/attachments/booking.pdf");
  });
});
