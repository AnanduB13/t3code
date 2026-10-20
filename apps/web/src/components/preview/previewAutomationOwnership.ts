import type { PreviewSessionSnapshot, ScopedThreadRef } from "@t3tools/contracts";

import { usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";

/** Tabs an agent opened on the environment's browser; they carry its automation owner. */
export function agentOwnedPreviewTabIds(
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>,
): readonly string[] {
  return Object.values(sessions)
    .filter((session) => session.runtime === "server" && session.automationOwner !== undefined)
    .map((session) => session.tabId);
}

/**
 * A floating preview is turn-scoped presentation even when the agent reused a
 * user-owned browser tab. Hide that presentation whenever the turn settles,
 * but return only agent-opened tabs for destructive session cleanup.
 */
export function prepareCompletedThreadPreviewCleanup(
  threadRef: ScopedThreadRef,
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>,
): readonly string[] {
  usePreviewMiniPlayerStore.getState().close(threadRef);
  return agentOwnedPreviewTabIds(sessions);
}
