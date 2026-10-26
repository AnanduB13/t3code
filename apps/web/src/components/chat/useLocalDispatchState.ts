import type { QueuedPrompt } from "@t3tools/client-runtime/state/queued-prompts";
import { type MessageId, type RuntimeRequestId } from "@t3tools/contracts";
import { useState } from "react";
import { type ComposerSubmissionIntent } from "../../composer-logic";
import { type SessionPhase, type Thread } from "../../types";
import {
  createLocalDispatchSnapshot,
  hasServerAcknowledgedLocalDispatch,
  type LocalDispatchSnapshot,
} from "../ChatView.logic";

export function useLocalDispatchState(input: {
  activeThread: Thread | undefined;
  activeLatestRun: Thread["latestRun"] | null;
  latestUserMessageId: MessageId | null;
  phase: SessionPhase;
  activePendingApproval: RuntimeRequestId | null;
  activePendingUserInput: RuntimeRequestId | null;
  threadError: string | null | undefined;
  queuedMessages: ReadonlyArray<QueuedPrompt>;
}) {
  const [localDispatch, setLocalDispatch] = useState<LocalDispatchSnapshot | null>(null);

  const resetLocalDispatch = () => {
    setLocalDispatch(null);
  };

  const serverAcknowledgedLocalDispatch = hasServerAcknowledgedLocalDispatch({
    localDispatch,
    queuedMessages: input.queuedMessages,
    phase: input.phase,
    latestRun: input.activeLatestRun,
    latestUserMessageId: input.latestUserMessageId,
    runtime: input.activeThread?.runtime ?? null,
    hasPendingApproval: input.activePendingApproval !== null,
    hasPendingUserInput: input.activePendingUserInput !== null,
    threadError: input.threadError,
  });
  if (serverAcknowledgedLocalDispatch && localDispatch && !localDispatch.acknowledged) {
    // Keep submission intent until navigation finishes, but never re-enter
    // Sending when the acknowledged prompt leaves the queue.
    setLocalDispatch({ ...localDispatch, acknowledged: true });
  }
  const activeLocalDispatch = serverAcknowledgedLocalDispatch ? null : localDispatch;
  const beginLocalDispatch = (options?: {
    messageId?: MessageId;
    preparingWorktree?: boolean;
    submissionIntent?: ComposerSubmissionIntent;
  }) => {
    const preparingWorktree = Boolean(options?.preparingWorktree);
    setLocalDispatch((current) => {
      const active = serverAcknowledgedLocalDispatch ? null : current;
      if (active) {
        // A follow-up sent while the first run starts keeps that run's
        // baseline and message, so Sending lasts until the first run is live.
        const submissionIntent = options?.submissionIntent ?? active.submissionIntent;
        return { ...active, preparingWorktree, submissionIntent, dispatched: false };
      }
      return createLocalDispatchSnapshot(input.activeThread, {
        ...options,
        latestUserMessageId: input.latestUserMessageId,
      });
    });
  };
  const markLocalDispatchDispatched = () => {
    setLocalDispatch((current) =>
      current === null || current.dispatched ? current : { ...current, dispatched: true },
    );
  };

  return {
    beginLocalDispatch,
    markLocalDispatchDispatched,
    resetLocalDispatch,
    localDispatchStartedAt: activeLocalDispatch?.startedAt ?? null,
    isPreparingWorktree: activeLocalDispatch?.preparingWorktree ?? false,
    /** Shows the turn as working from Enter until the server reports its run. */
    isSendBusy: activeLocalDispatch !== null,
    /** Blocks another send only until the server has accepted this one. */
    isSubmissionBusy: activeLocalDispatch !== null && !activeLocalDispatch.dispatched,
    backgroundSubmissionPending: activeLocalDispatch?.submissionIntent === "background",
  };
}
