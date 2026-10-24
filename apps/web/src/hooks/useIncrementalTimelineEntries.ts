import { useState } from "react";
import {
  deriveTimelineEntriesFromVisibleTurnItemsWithState,
  type TimelineEntriesInput,
  type TimelineEntriesProjection,
} from "../session-logic";

function sameInput(left: TimelineEntriesInput, right: TimelineEntriesInput): boolean {
  return (
    left.visibleTurnItems === right.visibleTurnItems &&
    left.optimisticMessages === right.optimisticMessages &&
    left.anchoredMessages === right.anchoredMessages &&
    left.attachmentUrlById === right.attachmentUrlById &&
    left.attempts === right.attempts &&
    left.nodes === right.nodes &&
    left.plans === right.plans
  );
}

function createTimelineProjector() {
  let previous: { threadKey: string | null; projection: TimelineEntriesProjection } | null = null;
  return (threadKey: string | null, input: TimelineEntriesInput) => {
    const projectionBefore = previous?.threadKey === threadKey ? previous.projection : null;
    if (projectionBefore !== null && sameInput(projectionBefore.input, input)) {
      return projectionBefore.entries;
    }
    const projection = deriveTimelineEntriesFromVisibleTurnItemsWithState(input, projectionBefore);
    previous = { threadKey, projection };
    return projection.entries;
  };
}

/**
 * Timeline entries for a thread, derived from the previous projection so
 * unchanged rows keep their identity and memoized rows skip rendering. A new
 * thread starts from scratch.
 */
export function useIncrementalTimelineEntries(
  threadKey: string | null,
  input: TimelineEntriesInput,
): TimelineEntriesProjection["entries"] {
  const [project] = useState(createTimelineProjector);
  return project(threadKey, input);
}
