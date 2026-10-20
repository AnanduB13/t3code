import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useEffect, useRef } from "react";

import { readThreadPreviewState } from "~/previewStateStore";
import { isLatestRunSettled } from "~/session-logic";
import { useThreadShells } from "~/state/entities";
import { previewEnvironment } from "~/state/preview";
import { useAtomCommand } from "~/state/use-atom-command";

import { closePreviewSession } from "./closePreviewSession";
import { prepareCompletedThreadPreviewCleanup } from "./previewAutomationOwnership";

/**
 * Closes the browser tabs an agent opened once its turn settles, and hides the
 * floating preview. Mounted once at the app root so background threads clean up too.
 */
export function AgentPreviewTurnCleanup() {
  const threadShells = useThreadShells();
  const closePreview = useAtomCommand(previewEnvironment.close, { reportFailure: false });
  const settledByThreadRef = useRef(new Map<string, boolean>());
  useEffect(() => {
    const previous = settledByThreadRef.current;
    const next = new Map<string, boolean>();
    for (const thread of threadShells) {
      const threadRef = scopeThreadRef(thread.environmentId, thread.id);
      const threadKey = scopedThreadKey(threadRef);
      const settled = isLatestRunSettled(thread.latestRun, thread.runtime);
      next.set(threadKey, settled);
      if (previous.get(threadKey) !== false || !settled) continue;

      const { sessions } = readThreadPreviewState(threadRef);
      for (const tabId of prepareCompletedThreadPreviewCleanup(threadRef, sessions)) {
        void closePreviewSession({
          closePreview,
          snapshot: sessions[tabId] ?? null,
          tabId,
          threadRef,
        });
      }
    }
    settledByThreadRef.current = next;
  }, [closePreview, threadShells]);
  return null;
}
