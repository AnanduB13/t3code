import type { OrchestrationThreadActivity } from "@t3tools/contracts";

function isRetryingRuntimeWarning(activity: OrchestrationThreadActivity): boolean {
  if (activity.kind !== "runtime.warning" || activity.payload === null) {
    return false;
  }
  const payload = activity.payload as Record<string, unknown>;
  const detail = payload.detail;
  return (
    typeof detail === "object" &&
    detail !== null &&
    (detail as Record<string, unknown>).willRetry === true
  );
}

/**
 * Retry notices are live state, even though activities are durable. Once the
 * same turn emits another non-warning activity, the provider demonstrably
 * recovered and the old reconnect notice must no longer render as current.
 */
export function omitRecoveredRuntimeWarnings(
  orderedActivities: ReadonlyArray<OrchestrationThreadActivity>,
): ReadonlyArray<OrchestrationThreadActivity> {
  const laterActiveTurnIds = new Set<NonNullable<OrchestrationThreadActivity["turnId"]>>();
  const visible: OrchestrationThreadActivity[] = [];

  for (let index = orderedActivities.length - 1; index >= 0; index--) {
    const activity = orderedActivities[index];
    if (activity === undefined) continue;

    const recovered =
      isRetryingRuntimeWarning(activity) &&
      activity.turnId !== null &&
      laterActiveTurnIds.has(activity.turnId);
    if (!recovered) {
      visible.push(activity);
    }
    if (activity.turnId !== null && activity.kind !== "runtime.warning") {
      laterActiveTurnIds.add(activity.turnId);
    }
  }

  return visible.reverse();
}
