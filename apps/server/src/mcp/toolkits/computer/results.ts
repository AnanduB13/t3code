import type { ComputerUseActionResult, ComputerUseAppState } from "@t3tools/contracts";
import { McpSchema } from "effect/unstable/ai";

/** Keeps PNG bytes out of JSON and gives the model one readable accessibility tree. */
export function computerUseToolResult(result: ComputerUseAppState | ComputerUseActionResult) {
  const state = result && ("observationId" in result ? result : result.observation);
  if (!state) {
    return new McpSchema.CallToolResult({
      isError: false,
      ...(result ? { structuredContent: result } : {}),
      content: [{ type: "text", text: JSON.stringify(result) }],
    });
  }
  const { screenshot, text, elements, ...application } = state;
  const metadata = {
    ...application,
    screenshot: {
      mimeType: screenshot.mimeType,
      width: screenshot.width,
      height: screenshot.height,
    },
  };
  const actionCompleted = result !== null && "actionCompleted" in result;
  return new McpSchema.CallToolResult({
    isError: false,
    structuredContent: actionCompleted
      ? { actionCompleted: true, observation: { ...metadata, elements } }
      : { ...metadata, elements },
    content: [
      {
        type: "text",
        text: `${JSON.stringify(actionCompleted ? { actionCompleted: true, observation: metadata } : metadata)}\n${text}`,
      },
      {
        type: "image",
        data: new Uint8Array(Buffer.from(screenshot.data, "base64")),
        mimeType: screenshot.mimeType,
      },
    ],
  });
}
