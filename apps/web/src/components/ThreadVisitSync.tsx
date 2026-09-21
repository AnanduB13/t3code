import {
  parseScopedThreadKey,
  scopeThreadRef,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { useThreadShells } from "../state/entities";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { createThreadVisitSync, subscribeThreadVisits } from "../threadVisitSync";
import { useUiStateStore } from "../uiStateStore";

export function ThreadVisitSync() {
  const threads = useThreadShells();
  const updateMetadata = useAtomCommand(
    threadEnvironment.updateMetadata,
    "sync thread read status",
  );
  const sync = useMemo(
    () =>
      createThreadVisitSync({
        readLocal: (key) => useUiStateStore.getState().threadLastVisitedAtById[key],
        apply: (key, value) =>
          useUiStateStore.setState((state) => {
            if (state.threadLastVisitedAtById[key] === value) return state;
            const visits = { ...state.threadLastVisitedAtById };
            if (value === undefined) delete visits[key];
            else visits[key] = value;
            return { threadLastVisitedAtById: visits };
          }),
        send: async ({ threadKey, visitedAt, markUnread }) => {
          const threadRef = parseScopedThreadKey(threadKey);
          if (!threadRef) return false;
          const result = await updateMetadata({
            environmentId: threadRef.environmentId,
            input: {
              threadId: threadRef.threadId,
              lastVisitedAt: visitedAt,
              ...(markUnread ? { markUnread } : {}),
            },
          });
          return result._tag === "Success";
        },
      }),
    [updateMetadata],
  );
  useLayoutEffect(() => subscribeThreadVisits(sync.visit), [sync]);
  useLayoutEffect(() => sync.update(threads), [sync, threads]);
  useEffect(() => {
    // A running thread first seen on this device needs a read baseline so its
    // eventual completion becomes unread, without flagging old history.
    const state = useUiStateStore.getState();
    for (const thread of threads) {
      const turn = thread.latestTurn;
      if (turn === null || turn.state === "completed") continue;
      const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      if (state.threadLastVisitedAtById[key] === undefined && thread.lastVisitedAt == null) {
        state.markThreadVisited(key, turn.startedAt ?? turn.requestedAt);
      }
    }
  }, [threads]);
  return null;
}
