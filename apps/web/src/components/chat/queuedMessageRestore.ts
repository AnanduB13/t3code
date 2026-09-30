import type { OrchestrationQueuedMessage } from "@t3tools/contracts";
import {
  formatComposerContextReference,
  replaceComposerContextReferences,
} from "@t3tools/shared/composerContextReferences";
import { resolveUserMessageContext } from "../../lib/composerContextRecords";
import { toKindScopedComposerContextId } from "../../lib/composerContextReferences";
import { randomUUID } from "../../lib/utils";

/** Prepare draft context while keeping the exact server text for compare-and-remove. */
export function prepareQueuedMessageContext(
  message: OrchestrationQueuedMessage,
): { message: OrchestrationQueuedMessage; expectedText: string } | null {
  const context = resolveUserMessageContext(message);
  if (
    context.records.some(
      (record) =>
        !["image", "file", "terminal", "preview-annotation", "review-comment"].includes(
          record.kind,
        ),
    )
  ) {
    // Leave unsupported context in the durable queue instead of silently dropping it.
    return null;
  }
  const rewrittenIds = new Map(
    context.records.map((record) => [
      record.contextId,
      toKindScopedComposerContextId(record.kind, randomUUID()),
    ]),
  );
  const records = context.records.map((record) => ({
    ...record,
    contextId: rewrittenIds.get(record.contextId)!,
    ...("screenshotContextId" in record && record.screenshotContextId
      ? {
          screenshotContextId:
            rewrittenIds.get(record.screenshotContextId) ?? record.screenshotContextId,
        }
      : {}),
  }));
  const text = replaceComposerContextReferences(context.text, (reference) => {
    const contextId = rewrittenIds.get(reference.contextId);
    return contextId
      ? formatComposerContextReference({ ...reference, contextId })
      : reference.source;
  });
  return {
    message: { ...message, text, context: { version: 1, records } },
    expectedText: message.text,
  };
}
