import type { ThreadContextRecord } from "@t3tools/contracts";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import { formatThreadLink } from "@t3tools/shared/threadLinks";

import { collectInlineContextIds } from "./lib/composerContextReferences";

export function projectPendingUserInputAnswer(
  answer: unknown,
  threadContexts: ReadonlyArray<ThreadContextRecord>,
) {
  if (typeof answer !== "string" || threadContexts.length === 0) return answer;
  const recordsById = new Map(threadContexts.map((record) => [record.contextId, record]));
  return replaceComposerContextReferences(answer, (reference) => {
    const record = reference.kind === "thread" ? recordsById.get(reference.contextId) : undefined;
    return record ? formatThreadLink(record.threadId, reference.label) : reference.source;
  });
}

export {
  resolvePendingUserInputAnswer,
  setPendingUserInputCustomAnswer,
  carryDisplacedCustomAnswerIntoPrompt,
  togglePendingUserInputOptionSelection,
  buildPendingUserInputAnswers,
  countAnsweredPendingUserInputQuestions,
  findFirstUnansweredPendingUserInputQuestionIndex,
  derivePendingUserInputProgress,
  type PendingUserInputDraftAnswer,
  type PendingUserInputProgress,
} from "@t3tools/shared/pendingUserInput";

// Question drafts retain deleted chip records for undo; only transfer referenced records.
export function threadContextsReferencedByAnswer(
  answer: string,
  threadContexts: ReadonlyArray<ThreadContextRecord>,
) {
  const referencedIds = new Set(collectInlineContextIds(answer));
  return threadContexts.filter((record) => referencedIds.has(record.contextId));
}

export function pendingUserInputRequestKey(
  environmentId: string,
  threadId: string | null,
  requestId: string | undefined,
): string {
  return JSON.stringify([environmentId, threadId, requestId]);
}

/** Drops a thread's drafts for requests that are no longer pending. Unchanged input is returned as is. */
export function pruneResolvedUserInputDrafts<T>(
  draftsByRequestKey: Record<string, T>,
  environmentId: string,
  threadId: string,
  pendingRequestIds: ReadonlyArray<string>,
): Record<string, T> {
  const threadPrefix = JSON.stringify([environmentId, threadId]).slice(0, -1);
  const pendingKeys = new Set(
    pendingRequestIds.map((requestId) =>
      pendingUserInputRequestKey(environmentId, threadId, requestId),
    ),
  );
  const retained = Object.entries(draftsByRequestKey).filter(
    ([key]) => !key.startsWith(threadPrefix) || pendingKeys.has(key),
  );
  return retained.length === Object.keys(draftsByRequestKey).length
    ? draftsByRequestKey
    : Object.fromEntries(retained);
}
