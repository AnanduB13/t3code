import { useLocale, useMessages } from "gt-react";
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

// A closure instead of render-time setState: a changed input must not schedule another render.
function createTimelineProjector() {
  let previous: {
    threadKey: string | null;
    locale: string;
    projection: TimelineEntriesProjection;
  } | null = null;
  return (threadKey: string | null, locale: string, input: TimelineEntriesInput) => {
    const projectionBefore =
      previous?.threadKey === threadKey && previous.locale === locale ? previous.projection : null;
    if (projectionBefore !== null && sameInput(projectionBefore.input, input)) {
      return projectionBefore.entries;
    }
    const projection = deriveTimelineEntriesFromVisibleTurnItemsWithState(input, projectionBefore);
    previous = { threadKey, locale, projection };
    return projection.entries;
  };
}

/**
 * Timeline entries for a thread, derived from the previous projection so
 * unchanged rows keep their identity and memoized rows skip rendering. A new
 * thread or locale starts from scratch.
 */
export function useIncrementalTimelineEntries(
  threadKey: string | null,
  timelineInput: TimelineEntriesInput,
): TimelineEntriesProjection["entries"] {
  // Keyed on the locale: without a GTProvider, useMessages() returns a new function every render.
  const locale = useLocale();
  const resolve = useMessages();
  const input = { ...timelineInput, resolve: timelineInput.resolve ?? resolve };
  const [project] = useState(createTimelineProjector);
  return project(threadKey, locale, input);
}
