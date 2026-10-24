import { derivePendingRequests } from "@t3tools/client-runtime/pending-requests";
import type { DesktopTaskRequest, OrchestrationThreadActivity } from "@t3tools/contracts";
import * as Predicate from "effect/Predicate";

/** Include provider failures so queued responses can fail visibly and be retried in the panel. */
export function projectDesktopTaskRequests(
  activities: readonly OrchestrationThreadActivity[],
): DesktopTaskRequest[] {
  const failures = new Map<string, { activityId: string; message: string }>();
  for (const activity of activities) {
    const kind =
      activity.kind === "provider.user-input.respond.failed"
        ? "input"
        : activity.kind === "provider.approval.respond.failed"
          ? "approval"
          : null;
    if (!kind || !Predicate.isObject(activity.payload)) continue;
    const { requestId, detail } = activity.payload;
    if (typeof requestId === "string" && typeof detail === "string") {
      failures.set(JSON.stringify([kind, requestId]), { activityId: activity.id, message: detail });
    }
  }
  const pending = derivePendingRequests(activities);
  const requests: DesktopTaskRequest[] = [
    ...pending.approvals.map((request) => ({
      kind: "approval" as const,
      requestId: request.requestId,
      requestKind: request.requestKind,
      ...(request.detail !== undefined ? { detail: request.detail } : {}),
      ...(request.appName !== undefined ? { appName: request.appName } : {}),
      ...(request.options !== undefined ? { options: request.options } : {}),
    })),
    ...pending.userInputs.map((request) => ({
      kind: "input" as const,
      requestId: request.requestId,
      questions: request.questions,
      dismissible: request.dismissible,
    })),
  ];
  return requests.map((request) => {
    const responseFailure = failures.get(JSON.stringify([request.kind, request.requestId]));
    return { ...request, ...(responseFailure ? { responseFailure } : {}) };
  });
}
