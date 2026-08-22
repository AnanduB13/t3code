# Chat attachments

You can attach images and PDF documents to a message from the paperclip button. Pasting and dragging supported files into the composer works too.

Each message supports up to eight attachments. Images can be up to 10 MB each, and PDFs can be up to 20 MB each.

T3 Code keeps the original PDF and extracts its text page by page before the turn starts. The full extracted text is provided directly to the agent when it fits in the prompt. For unusually large documents, the agent receives the path to the complete extracted text instead of a shortened copy. Scanned or image-only pages remain attached, but their page entries state that they contain no extractable text so the agent can inspect the original document with an available OCR or vision tool.

Password-protected, malformed, or excessively large PDFs are rejected with an error instead of being sent with incomplete content.
