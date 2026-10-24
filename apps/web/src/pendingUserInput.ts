import type { ThreadContextRecord } from "@t3tools/contracts";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import { formatThreadLink } from "@t3tools/shared/threadLinks";

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
