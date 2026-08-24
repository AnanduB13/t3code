import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";

const automationOwnedTabsByThread = new Map<string, Set<string>>();

export function markPreviewTabAutomationOwned(threadRef: ScopedThreadRef, tabId: string): void {
  const threadKey = scopedThreadKey(threadRef);
  const tabs = automationOwnedTabsByThread.get(threadKey) ?? new Set<string>();
  tabs.add(tabId);
  automationOwnedTabsByThread.set(threadKey, tabs);
}

export function releaseAutomationOwnedPreviewTabs(threadRef: ScopedThreadRef): readonly string[] {
  const threadKey = scopedThreadKey(threadRef);
  const tabs = automationOwnedTabsByThread.get(threadKey);
  if (!tabs) return [];
  automationOwnedTabsByThread.delete(threadKey);
  return [...tabs];
}

/**
 * A floating preview is turn-scoped presentation even when automation reused
 * a user-owned browser tab. Hide that presentation whenever the turn settles,
 * but return only automation-created tabs for destructive session cleanup.
 */
export function prepareCompletedThreadPreviewCleanup(
  threadRef: ScopedThreadRef,
): readonly string[] {
  usePreviewMiniPlayerStore.getState().close(threadRef);
  return releaseAutomationOwnedPreviewTabs(threadRef);
}
