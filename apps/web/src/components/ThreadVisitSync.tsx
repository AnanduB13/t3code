import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import { useLayoutEffect, useState } from "react";

import { useStableCallback } from "../hooks/useStableCallback";
import { useThreadShells } from "../state/entities";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { createThreadVisitSync, subscribeThreadVisits, type ThreadVisit } from "../threadVisitSync";
import { useUiStateStore } from "../uiStateStore";

/**
 * Keeps this client's read markers and the server's shared `lastVisitedAt` in
 * step: local visits and mark-unread actions dispatch `thread.visit` /
 * `thread.mark-unread`, and server markers mirror back into the local store
 * that the Activity Center and completion surfaces read.
 */
export function ThreadVisitSync() {
  const threads = useThreadShells();
  const visitThread = useAtomCommand(threadEnvironment.visit, { reportFailure: false });
  const markThreadUnread = useAtomCommand(threadEnvironment.markUnread, {
    reportFailure: false,
  });
  const send = useStableCallback(async ({ threadKey, visitedAt, markUnread }: ThreadVisit) => {
    const threadRef = parseScopedThreadKey(threadKey);
    if (!threadRef) return false;
    const result = markUnread
      ? await markThreadUnread({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId },
        })
      : await visitThread({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId, visitedAt },
        });
    return result._tag === "Success";
  });
  // The sync keeps per-thread canonical markers and in-flight sends, so it lives as long as this.
  const [sync] = useState(() =>
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
      send,
    }),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Subscribes to local visit events published outside React for this component's lifetime.
  useLayoutEffect(() => subscribeThreadVisits(sync.visit), [sync]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Mirrors server visit markers from the live thread shells into the local visit store.
  useLayoutEffect(() => sync.update(threads), [sync, threads]);
  return null;
}
