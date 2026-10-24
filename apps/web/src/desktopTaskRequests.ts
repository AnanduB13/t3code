import { derivePendingThreadRequests } from "@t3tools/client-runtime/state/thread-requests";
import type { DesktopTaskRequest, OrchestrationV2ThreadProjection } from "@t3tools/contracts";

/** Use the same runtime requests as the app composer, including asynchronous questions. */
export function projectDesktopTaskRequests(
  projection: Pick<OrchestrationV2ThreadProjection, "runtimeRequests" | "turnItems">,
): DesktopTaskRequest[] {
  const pending = derivePendingThreadRequests(projection);
  const unavailable = new Map(
    projection.runtimeRequests.flatMap((request) =>
      request.responseCapability.type === "not_resumable"
        ? [[request.id, request.responseCapability.reason] as const]
        : [],
    ),
  );
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
    const reason = unavailable.get(request.requestId);
    return { ...request, ...(reason !== undefined ? { responseUnavailableReason: reason } : {}) };
  });
}
