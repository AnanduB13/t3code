# Chat attachments

You can attach images and PDF documents to a message from the paperclip button. Pasting and dragging supported files into the composer works too.

Each message supports up to eight attachments. Images can be up to 10 MB each, and PDFs can be up to 20 MB each.

T3 Code keeps the original PDF and extracts its text page by page before the turn starts. The full extracted text is provided directly to the agent when it fits in the prompt. For unusually large documents, the agent receives the path to the complete extracted text instead of a shortened copy. Scanned or image-only pages remain attached, but their page entries state that they contain no extractable text so the agent can inspect the original document with an available OCR or vision tool.

Password-protected, malformed, or excessively large PDFs are rejected with an error instead of being sent with incomplete content.

## Visual evidence from web work

After Codex completes a user-visible website or web-app change, it can add two image attachments to its final response: a full-page capture of the primary changed page and a focused capture of the main changed region. Select either image to open the full preview.

These captures run in a headless browser on the T3 Code server and are saved with the thread. A connected desktop or an open laptop is not required. Local development pages should be addressed by their environment port so the server captures the page from the same environment where the agent did the work.

The server host must have Chrome or Chromium available. T3 Code detects Playwright browser installations and common system browser paths. Server operators can set `T3CODE_BROWSER_EXECUTABLE` to an explicit Chrome or Chromium executable when automatic detection is not suitable. If the backend browser cannot start or the page is unavailable, the completed code work remains intact and the agent reports that visual evidence could not be captured.
