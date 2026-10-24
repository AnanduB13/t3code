import type {
  DesktopTask,
  DesktopTaskRequestTarget,
  DesktopTaskResponse,
  ProviderApprovalOption,
} from "@t3tools/contracts";

export const DEFAULT_APPROVAL_OPTIONS: ReadonlyArray<ProviderApprovalOption> = [
  { decision: "cancel", label: "Cancel" },
  { decision: "decline", label: "Decline" },
  { decision: "acceptForSession", label: "Always allow this session" },
  { decision: "accept", label: "Approve" },
];

export const taskRequestKey = (target: DesktopTaskRequestTarget) =>
  JSON.stringify([target.environmentId, target.threadId, target.requestId]);

export function taskRequests(tasks: readonly DesktopTask[]) {
  return tasks.flatMap((task) =>
    (task.requests ?? []).map((request) => ({
      task,
      request,
      target: {
        environmentId: task.environmentId,
        threadId: task.threadId,
        requestId: request.requestId,
      },
    })),
  );
}

/** Both IPC boundaries check the live request before forwarding an answer. */
export function validTaskResponse(
  tasks: readonly DesktopTask[],
  response: DesktopTaskResponse,
): boolean {
  const entry = taskRequests(tasks).find(
    ({ target }) => taskRequestKey(target) === taskRequestKey(response),
  );
  if (!entry) return false;
  const { request } = entry;
  if (request.responseUnavailableReason !== undefined) return false;
  if (response.kind === "dismiss") return request.kind === "input" && request.dismissible;
  if (response.kind === "approval")
    return (
      request.kind === "approval" &&
      (request.options ?? DEFAULT_APPROVAL_OPTIONS).some(
        (option) => option.decision === response.decision,
      )
    );
  if (request.kind !== "input" || Object.keys(response.answers).length !== request.questions.length)
    return false;
  return request.questions.every((question) => {
    if (!Object.hasOwn(response.answers, question.id)) return false;
    const answer = response.answers[question.id];
    const optionValues = new Set(question.options.map((option) => option.value ?? option.label));
    if (Array.isArray(answer))
      return (
        question.multiSelect === true &&
        answer.length > 0 &&
        new Set(answer).size === answer.length &&
        answer.every((value) => optionValues.has(value))
      );
    return (
      typeof answer === "string" &&
      ((!question.multiSelect && optionValues.has(answer)) ||
        (question.allowCustomAnswer !== false && answer.trim().length > 0))
    );
  });
}
